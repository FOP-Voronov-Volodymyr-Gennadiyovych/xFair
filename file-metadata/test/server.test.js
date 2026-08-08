import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import {
  createAppServer,
  extractBoundary,
  parseMultipartFile,
} from "../server.js";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
let baseUrl;
let server;

function multipartBody({ boundary, content, field = "upfile", filename, type }) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="${field}"; filename="${filename}"\r\n`),
    Buffer.from(`Content-Type: ${type}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

before(async () => {
  server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("multipart parsing", () => {
  it("extracts quoted and unquoted boundaries", () => {
    assert.equal(extractBoundary("multipart/form-data; boundary=abc123"), "abc123");
    assert.equal(extractBoundary('multipart/form-data; boundary="quoted-value"'), "quoted-value");
  });

  it("preserves binary bytes and returns exact metadata", () => {
    const content = Buffer.from([0x00, 0xff, 0x10, 0x0d, 0x0a, 0x80]);
    const boundary = "test-boundary";
    assert.deepEqual(
      parseMultipartFile(multipartBody({
        boundary,
        content,
        filename: "pixels.bin",
        type: "application/octet-stream",
      }), boundary),
      {
        name: "pixels.bin",
        type: "application/octet-stream",
        size: 6,
      },
    );
  });

  it("ignores files outside the required upfile field", () => {
    const boundary = "wrong-field";
    const body = multipartBody({
      boundary,
      content: Buffer.from("hello"),
      field: "attachment",
      filename: "hello.txt",
      type: "text/plain",
    });
    assert.equal(parseMultipartFile(body, boundary), null);
  });
});

describe("file metadata API", () => {
  it("accepts a multipart form upload and returns name, type, and size", async () => {
    const content = Buffer.from([1, 2, 3, 4, 5, 250, 251]);
    const form = new FormData();
    form.append("upfile", new Blob([content], { type: "application/x-test-binary" }), "sample.bin");

    const response = await fetch(`${baseUrl}/api/fileanalyse`, {
      method: "POST",
      body: form,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(await response.json(), {
      name: "sample.bin",
      type: "application/x-test-binary",
      size: 7,
    });
  });

  it("supports the American spelling endpoint alias", async () => {
    const form = new FormData();
    form.append("upfile", new Blob(["metadata"], { type: "text/plain" }), "notes.txt");
    const response = await fetch(`${baseUrl}/api/fileanalyze`, { method: "POST", body: form });
    assert.deepEqual(await response.json(), {
      name: "notes.txt",
      type: "text/plain",
      size: 8,
    });
  });

  it("rejects a multipart form without upfile", async () => {
    const form = new FormData();
    form.append("other", new Blob(["nope"], { type: "text/plain" }), "wrong.txt");
    const response = await fetch(`${baseUrl}/api/fileanalyse`, { method: "POST", body: form });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "No file provided in upfile field" });
  });

  it("serves a form whose file input is named upfile", async () => {
    const html = await readFile(path.join(TEST_DIRECTORY, "..", "public", "index.html"), "utf8");
    assert.match(html, /<form[^>]+enctype="multipart\/form-data"/);
    assert.match(html, /<input[^>]+name="upfile"[^>]+type="file"/);
  });
});
