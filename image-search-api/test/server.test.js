import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createAppServer } from "../server.js";

class MemoryRecentStore {
  constructor() {
    this.searches = [];
  }

  async add(searchQuery) {
    this.searches.unshift({
      _id: String(this.searches.length + 1),
      searchQuery,
      timeSearched: "2026-08-08T12:00:00.000Z",
    });
  }

  list() {
    return this.searches;
  }
}

function mockCommonsResponse() {
  return {
    batchcomplete: "",
    query: {
      pages: {
        42: {
          pageid: 42,
          index: 1,
          title: "File:Test image.jpg",
          imageinfo: [
            {
              url: "https://images.example/original.jpg",
              thumburl: "https://images.example/thumb.jpg",
              thumbwidth: 640,
              thumbheight: 480,
              descriptionurl: "https://commons.example/File:Test_image.jpg",
              extmetadata: {
                ImageDescription: { value: "<b>A test image</b> &amp; sample" },
              },
            },
          ],
        },
      },
    },
  };
}

describe("image search abstraction layer", () => {
  let server;
  let baseUrl;
  let requestedUrls;

  beforeEach(async () => {
    requestedUrls = [];
    const fetchImpl = async (url) => {
      requestedUrls.push(new URL(url));
      return {
        ok: true,
        async json() {
          return mockCommonsResponse();
        },
      };
    };
    server = createAppServer({
      fetchImpl,
      recentStore: new MemoryRecentStore(),
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("returns normalized image URLs, descriptions, and source pages", async () => {
    const response = await fetch(`${baseUrl}/query/test%20image?page=1`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.images, [
      {
        url: "https://images.example/original.jpg",
        thumbnail: {
          url: "https://images.example/thumb.jpg",
          width: 640,
          height: 480,
        },
        description: "A test image & sample",
        parentPage: "https://commons.example/File:Test_image.jpg",
      },
    ]);
  });

  it("maps the page parameter to the Commons result offset", async () => {
    await fetch(`${baseUrl}/query/pagination?page=2`);
    assert.equal(requestedUrls[0].searchParams.get("gsroffset"), "10");
  });

  it("records submitted queries on the recent endpoint", async () => {
    await fetch(`${baseUrl}/query/aurora?page=1`);
    const response = await fetch(`${baseUrl}/recent/`);
    const body = await response.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].searchQuery, "aurora");
    assert.equal(body[0].timeSearched, "2026-08-08T12:00:00.000Z");
  });

  it("serves the browser interface", async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Framefinder/);
  });

  it("serves a public source index and project files", async () => {
    const indexResponse = await fetch(`${baseUrl}/source/`);
    const sourceResponse = await fetch(`${baseUrl}/source/server.js`);

    assert.equal(indexResponse.status, 200);
    assert.match(await indexResponse.text(), /Source Code/);
    assert.equal(sourceResponse.status, 200);
    assert.match(await sourceResponse.text(), /createAppServer/);
  });
});
