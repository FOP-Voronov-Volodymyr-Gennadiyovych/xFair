import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import {
  UrlStore,
  createAppServer,
  parseSubmittedUrl,
  validateUrl,
} from "../server.js";

const successfulLookup = (_hostname, callback) => callback(null, "93.184.216.34", 4);
let baseUrl;
let dataFile;
let server;
let temporaryDirectory;

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "url-shortener-"));
  dataFile = path.join(temporaryDirectory, "urls.json");
  const store = new UrlStore(dataFile);
  server = createAppServer({ lookup: successfulLookup, store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("URL validation and body parsing", () => {
  it("accepts an HTTP URL after resolving its hostname", async () => {
    const calls = [];
    const lookup = (hostname, callback) => {
      calls.push(hostname);
      callback(null, "192.0.2.20", 4);
    };
    assert.equal(await validateUrl("https://example.com/docs", lookup), "https://example.com/docs");
    assert.deepEqual(calls, ["example.com"]);
  });

  it("rejects unsupported protocols before DNS lookup", async () => {
    let called = false;
    const lookup = () => { called = true; };
    assert.equal(await validateUrl("ftp://example.com/file", lookup), null);
    assert.equal(called, false);
  });

  it("rejects a hostname that does not resolve", async () => {
    const lookup = (_hostname, callback) => callback(new Error("ENOTFOUND"));
    assert.equal(await validateUrl("https://missing.invalid", lookup), null);
  });

  it("parses URL-encoded and JSON request bodies", () => {
    assert.equal(
      parseSubmittedUrl("url=https%3A%2F%2Fexample.com%2Fdocs", "application/x-www-form-urlencoded"),
      "https://example.com/docs",
    );
    assert.equal(
      parseSubmittedUrl('{"url":"https://example.com"}', "application/json"),
      "https://example.com",
    );
  });
});

describe("short URL API", () => {
  it("creates and persists a numeric short URL", async () => {
    const response = await fetch(`${baseUrl}/api/shorturl`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ url: "https://example.com/guide" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      original_url: "https://example.com/guide",
      short_url: 1,
    });

    const stored = JSON.parse(await readFile(dataFile, "utf8"));
    assert.equal(stored[0].short_url, 1);
  });

  it("reuses the existing code for a duplicate URL", async () => {
    const response = await fetch(`${baseUrl}/api/shorturl`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ url: "https://example.com/guide" }),
    });
    assert.deepEqual(await response.json(), {
      original_url: "https://example.com/guide",
      short_url: 1,
    });
  });

  it("redirects a short code to its original URL", async () => {
    const response = await fetch(`${baseUrl}/api/shorturl/1`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://example.com/guide");
  });

  it("returns the required error for invalid input", async () => {
    const response = await fetch(`${baseUrl}/api/shorturl`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ url: "not a url" }),
    });
    assert.deepEqual(await response.json(), { error: "invalid url" });
  });
});
