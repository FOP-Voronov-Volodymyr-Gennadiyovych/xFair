import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIRECTORY = path.join(APP_DIRECTORY, "public");

const STATIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};

export function parseTimestamp(input, now = () => new Date()) {
  let date;

  if (input === undefined || input === "") {
    date = now();
  } else if (/^-?\d+$/.test(input)) {
    date = new Date(Number(input));
  } else {
    date = new Date(input);
  }

  if (Number.isNaN(date.getTime())) return { error: "Invalid Date" };

  return {
    unix: date.getTime(),
    utc: date.toUTCString(),
  };
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
    "Cache-Control": fileName.endsWith(".html") ? "no-cache" : "public, max-age=3600",
    "Content-Length": contents.length,
    "Content-Type": contentType,
  });
  response.end(request.method === "HEAD" ? undefined : contents);
  return true;
}

export function createAppServer({
  now = () => new Date(),
  publicDirectory = PUBLIC_DIRECTORY,
} = {}) {
  return createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const { pathname } = requestUrl;

      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Origin": "*",
        });
        response.end();
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        sendJson(response, 405, { error: "Method not allowed" }, request.method);
        return;
      }

      if (pathname === "/favicon.ico") {
        response.writeHead(204, { "Cache-Control": "public, max-age=86400" });
        response.end();
        return;
      }

      if (pathname === "/health") {
        sendJson(response, 200, { status: "ok" }, request.method);
        return;
      }

      if (pathname === "/api" || pathname === "/api/") {
        sendJson(response, 200, parseTimestamp(undefined, now), request.method);
        return;
      }

      if (pathname.startsWith("/api/")) {
        const encodedDate = pathname.slice("/api/".length);
        let date;
        try {
          date = decodeURIComponent(encodedDate);
        } catch {
          sendJson(response, 200, { error: "Invalid Date" }, request.method);
          return;
        }
        sendJson(response, 200, parseTimestamp(date, now), request.method);
        return;
      }

      if (await serveStatic(request, response, pathname, publicDirectory)) return;
      sendJson(response, 404, { error: "Not found" }, request.method);
    } catch (error) {
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
    console.log(`Timestamp microservice listening on http://0.0.0.0:${port}`);
  });
}
