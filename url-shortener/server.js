import { lookup as dnsLookup } from "node:dns";
import { createServer as createHttpServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIRECTORY = path.join(APP_DIRECTORY, "public");
const URLS_FILE = path.join(APP_DIRECTORY, "data", "urls.json");
const MAX_BODY_BYTES = 16 * 1024;

const STATIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};

export class UrlStore {
  constructor(filePath = URLS_FILE) {
    this.filePath = filePath;
    this.records = [];
    this.initializing = null;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      try {
        const contents = await readFile(this.filePath, "utf8");
        const parsed = JSON.parse(contents);
        this.records = Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await mkdir(path.dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, "[]\n", "utf8");
      }
    })();
    return this.initializing;
  }

  async add(originalUrl) {
    await this.init();
    const existing = this.records.find((record) => record.original_url === originalUrl);
    if (existing) return { ...existing };

    const nextCode = this.records.reduce(
      (maximum, record) => Math.max(maximum, Number(record.short_url) || 0),
      0,
    ) + 1;
    const record = { original_url: originalUrl, short_url: nextCode };
    this.records.push(record);
    const payload = `${JSON.stringify(this.records, null, 2)}\n`;

    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf8");
    });
    await this.writeQueue;
    return { ...record };
  }

  async find(shortCode) {
    await this.init();
    const record = this.records.find((item) => String(item.short_url) === String(shortCode));
    return record ? { ...record } : null;
  }
}

function lookupHostname(hostname, lookup) {
  return new Promise((resolve, reject) => {
    lookup(hostname, (error, address) => {
      if (error || !address) reject(error || new Error("Hostname did not resolve"));
      else resolve(address);
    });
  });
}

export async function validateUrl(value, lookup = dnsLookup) {
  if (typeof value !== "string" || !value.trim()) return null;

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (!(["http:", "https:"].includes(url.protocol)) || !url.hostname) return null;

  try {
    await lookupHostname(url.hostname, lookup);
    return value.trim();
  } catch {
    return null;
  }
}

export async function readRequestBody(request, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function parseSubmittedUrl(body, contentType = "") {
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(body).url;
    } catch {
      return undefined;
    }
  }
  return new URLSearchParams(body).get("url") || undefined;
}

function sendJson(response, statusCode, body, method = "GET") {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(method === "HEAD" ? undefined : payload);
}

async function serveStatic(request, response, pathname, publicDirectory) {
  const file = STATIC_FILES[pathname];
  if (!file) return false;
  const [fileName, contentType] = file;
  const contents = await readFile(path.join(publicDirectory, fileName));
  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": fileName.endsWith(".html") ? "no-cache" : "public, max-age=3600",
    "Content-Length": contents.length,
    "Content-Type": contentType,
  });
  response.end(request.method === "HEAD" ? undefined : contents);
  return true;
}

export function createAppServer({
  lookup = dnsLookup,
  publicDirectory = PUBLIC_DIRECTORY,
  store = new UrlStore(),
} = {}) {
  return createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const { pathname } = requestUrl;

      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Origin": "*",
        });
        response.end();
        return;
      }

      if (pathname === "/favicon.ico") {
        response.writeHead(204, { "Cache-Control": "public, max-age=86400" });
        response.end();
        return;
      }

      if (pathname === "/health" && (request.method === "GET" || request.method === "HEAD")) {
        sendJson(response, 200, { status: "ok" }, request.method);
        return;
      }

      if ((pathname === "/api/shorturl" || pathname === "/api/shorturl/") && request.method === "POST") {
        const body = await readRequestBody(request);
        const submittedUrl = parseSubmittedUrl(body, request.headers["content-type"] || "");
        const originalUrl = await validateUrl(submittedUrl, lookup);
        if (!originalUrl) {
          sendJson(response, 200, { error: "invalid url" });
          return;
        }
        sendJson(response, 200, await store.add(originalUrl));
        return;
      }

      if (pathname.startsWith("/api/shorturl/") && (request.method === "GET" || request.method === "HEAD")) {
        const shortCode = pathname.slice("/api/shorturl/".length);
        const record = await store.find(shortCode);
        if (!record) {
          sendJson(response, 404, { error: "No short URL found for the given input" }, request.method);
          return;
        }
        response.writeHead(302, {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          Location: record.original_url,
        });
        response.end();
        return;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        if (await serveStatic(request, response, pathname, publicDirectory)) return;
        sendJson(response, 404, { error: "Not found" }, request.method);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      if (error.message === "Request body too large") {
        sendJson(response, 413, { error: "Request body too large" });
        return;
      }
      console.error(error);
      if (!response.headersSent) sendJson(response, 500, { error: "Internal server error" });
      else response.end();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const server = createAppServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`URL shortener listening on http://0.0.0.0:${port}`);
  });
}
