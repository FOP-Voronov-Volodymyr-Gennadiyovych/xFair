import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createAppServer, parseTimestamp } from "../server.js";

const FIXED_NOW = new Date("2024-02-29T12:34:56.789Z");
let baseUrl;
let server;

before(async () => {
  server = createAppServer({ now: () => new Date(FIXED_NOW) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("parseTimestamp", () => {
  it("converts a GMT date to Unix milliseconds and UTC", () => {
    assert.deepEqual(parseTimestamp("2015-12-25"), {
      unix: 1451001600000,
      utc: "Fri, 25 Dec 2015 00:00:00 GMT",
    });
  });

  it("treats an integer as Unix milliseconds", () => {
    assert.deepEqual(parseTimestamp("1451001600000"), {
      unix: 1451001600000,
      utc: "Fri, 25 Dec 2015 00:00:00 GMT",
    });
  });

  it("returns the required error shape for an invalid date", () => {
    assert.deepEqual(parseTimestamp("this-is-not-a-date"), { error: "Invalid Date" });
  });
});

describe("timestamp API", () => {
  it("returns the current timestamp when no date is supplied", async () => {
    const response = await fetch(`${baseUrl}/api/`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(await response.json(), {
      unix: FIXED_NOW.getTime(),
      utc: FIXED_NOW.toUTCString(),
    });
  });

  it("accepts an encoded natural-language GMT date", async () => {
    const response = await fetch(`${baseUrl}/api/December%2015,%202015`);
    assert.deepEqual(await response.json(), {
      unix: 1450137600000,
      utc: "Tue, 15 Dec 2015 00:00:00 GMT",
    });
  });

  it("accepts Unix milliseconds", async () => {
    const response = await fetch(`${baseUrl}/api/1451001600000`);
    assert.deepEqual(await response.json(), {
      unix: 1451001600000,
      utc: "Fri, 25 Dec 2015 00:00:00 GMT",
    });
  });

  it("returns Invalid Date without changing the response contract", async () => {
    const response = await fetch(`${baseUrl}/api/not-a-date`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { error: "Invalid Date" });
  });
});
