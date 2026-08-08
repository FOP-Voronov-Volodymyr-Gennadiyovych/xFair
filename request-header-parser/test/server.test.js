import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createAppServer, getClientIp, parseRequestHeaders } from "../server.js";

let baseUrl;
let server;

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

describe("header parsing", () => {
  it("uses the first forwarded address", () => {
    const request = {
      headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.2" },
      socket: { remoteAddress: "127.0.0.1" },
    };
    assert.equal(getClientIp(request), "203.0.113.8");
  });

  it("normalizes an IPv4-mapped socket address", () => {
    const request = { headers: {}, socket: { remoteAddress: "::ffff:127.0.0.1" } };
    assert.equal(getClientIp(request), "127.0.0.1");
  });

  it("returns exactly the three required properties", () => {
    const request = {
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Example Browser/1.0",
      },
      socket: { remoteAddress: "192.0.2.1" },
    };
    assert.deepEqual(parseRequestHeaders(request), {
      ipaddress: "192.0.2.1",
      language: "en-US,en;q=0.9",
      software: "Example Browser/1.0",
    });
  });
});

describe("GET /api/whoami", () => {
  it("returns forwarded IP, language, and user agent headers", async () => {
    const response = await fetch(`${baseUrl}/api/whoami`, {
      headers: {
        "Accept-Language": "fr-CA,fr;q=0.8",
        "User-Agent": "Header-Test/2.0",
        "X-Forwarded-For": "198.51.100.42, 10.0.0.1",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(await response.json(), {
      ipaddress: "198.51.100.42",
      language: "fr-CA,fr;q=0.8",
      software: "Header-Test/2.0",
    });
  });

  it("supports the trailing-slash endpoint", async () => {
    const response = await fetch(`${baseUrl}/api/whoami/`, {
      headers: { "User-Agent": "Trailing-Slash-Test" },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.software, "Trailing-Slash-Test");
    assert.equal(typeof body.ipaddress, "string");
    assert.equal(typeof body.language, "string");
  });

  it("rejects unsupported methods", async () => {
    const response = await fetch(`${baseUrl}/api/whoami`, { method: "POST" });
    assert.equal(response.status, 405);
    assert.deepEqual(await response.json(), { error: "Method not allowed" });
  });
});
