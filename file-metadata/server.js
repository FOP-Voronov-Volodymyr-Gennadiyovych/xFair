import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIRECTORY = path.join(APP_DIRECTORY, "public");
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const STATIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};

export function extractBoundary(contentType = "") {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return (match?.[1] || match?.[2] || "").trim();
}

function dispositionValue(disposition, name) {
  const match = disposition.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match?.[1];
}

function safeFilename(disposition) {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let filename = dispositionValue(disposition, "filename");
  if (encoded) {
    try {
      filename = decodeURIComponent(encoded);
    } catch {
      filename = encoded;
    }
  }
  if (!filename) return "";
  return path.basename(filename.replaceAll("\\", "/"));
}

export function parseMultipartFile(body, boundary, fieldName = "upfile") {
  if (!Buffer.isBuffer(body) || !boundary) return null;

  const delimiter = Buffer.from(`--${boundary}`);
  const nextDelimiter = Buffer.from(`\r\n--${boundary}`);
  let cursor = 0;

  while (cursor < body.length) {
    const boundaryStart = body.indexOf(delimiter, cursor);
    if (boundaryStart === -1) break;

    let headerStart = boundaryStart + delimiter.length;
    if (body.subarray(headerStart, headerStart + 2).equals(Buffer.from("--"))) break;
    if (body.subarray(headerStart, headerStart + 2).equals(Buffer.from("\r\n"))) {
      headerStart += 2;
    }

    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) break;
    const headers = body.subarray(headerStart, headerEnd).toString("utf8");
    const dataStart = headerEnd + 4;
    const dataEnd = body.indexOf(nextDelimiter, dataStart);
    if (dataEnd === -1) break;

    const disposition = headers.match(/^content-disposition:\s*(.+)$/im)?.[1] || "";
    const partName = dispositionValue(disposition, "name");
    const filename = safeFilename(disposition);

    if (partName === fieldName && filename) {
      const type = headers.match(/^content-type:\s*([^\r\n]+)$/im)?.[1].trim()
        || "application/octet-stream";
      return {
        name: filename,
        type,
        size: dataEnd - dataStart,
      };
    }

    cursor = dataEnd + 2;
  }

  return null;
}

export async function readRequestBuffer(request, limit = MAX_UPLOAD_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Upload too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
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

export function createAppServer({ publicDirectory = PUBLIC_DIRECTORY } = {}) {
  return createHttpServer(async (request, response) => {
    try {
      const normalizedRequestTarget = request.url.replace(/^\/{2,}/, "/");
      const requestUrl = new URL(normalizedRequestTarget, `http://${request.headers.host || "localhost"}`);
      const pathname = requestUrl.pathname.replace(/\/{2,}/g, "/");

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

      const isUploadPath = ["/api/fileanalyse", "/api/fileanalyse/", "/api/fileanalyze", "/api/fileanalyze/"].includes(pathname);
      if (isUploadPath && request.method === "POST") {
        const contentType = request.headers["content-type"] || "";
        const boundary = extractBoundary(contentType);
        if (!contentType.toLowerCase().startsWith("multipart/form-data") || !boundary) {
          sendJson(response, 400, { error: "A multipart file upload is required" });
          return;
        }

        const metadata = parseMultipartFile(await readRequestBuffer(request), boundary);
        if (!metadata) {
          sendJson(response, 400, { error: "No file provided in upfile field" });
          return;
        }
        sendJson(response, 200, metadata);
        return;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        if (await serveStatic(request, response, pathname, publicDirectory)) return;
        sendJson(response, 404, { error: "Not found" }, request.method);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      if (error.message === "Upload too large") {
        sendJson(response, 413, { error: "File exceeds the 25 MB limit" });
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
    console.log(`File metadata service listening on http://0.0.0.0:${port}`);
  });
}
