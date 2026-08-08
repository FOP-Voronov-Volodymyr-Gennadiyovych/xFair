import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIRECTORY = path.join(APP_DIRECTORY, "public");
const DEFAULT_RECENT_FILE = path.join(APP_DIRECTORY, "data", "recent.json");
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const PAGE_SIZE = 10;
const MAX_RECENT_SEARCHES = 20;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const SOURCE_FILES = {
  "/source/README.md": "README.md",
  "/source/package.json": "package.json",
  "/source/server.js": "server.js",
  "/source/public/app.js": "public/app.js",
  "/source/public/index.html": "public/index.html",
  "/source/public/styles.css": "public/styles.css",
  "/source/test/server.test.js": "test/server.test.js",
};

export class RecentSearchStore {
  constructor(filePath = DEFAULT_RECENT_FILE, limit = MAX_RECENT_SEARCHES) {
    this.filePath = filePath;
    this.limit = limit;
    this.searches = [];
    this.writeQueue = Promise.resolve();
  }

  async init() {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(contents);
      this.searches = Array.isArray(parsed) ? parsed.slice(0, this.limit) : [];
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, "[]\n", "utf8");
    }
  }

  async add(searchQuery) {
    const record = {
      _id: randomUUID(),
      searchQuery,
      timeSearched: new Date().toISOString(),
    };
    this.searches.unshift(record);
    this.searches = this.searches.slice(0, this.limit);
    const payload = `${JSON.stringify(this.searches, null, 2)}\n`;

    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf8");
    });
    await this.writeQueue;
    return record;
  }

  list() {
    return this.searches.map((record) => ({ ...record }));
  }
}

function decodeHtml(value = "") {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackDescription(title) {
  return title
    .replace(/^File:/, "")
    .replace(/\.[a-z\d]{2,5}$/i, "")
    .replaceAll("_", " ");
}

export function normalizePage(page) {
  const imageInfo = page.imageinfo?.[0];
  if (!imageInfo?.url || !imageInfo.descriptionurl) return null;

  const metadata = imageInfo.extmetadata || {};
  const description = decodeHtml(
    metadata.ImageDescription?.value
      || metadata.ObjectName?.value
      || fallbackDescription(page.title),
  );

  return {
    url: imageInfo.url,
    thumbnail: {
      url: imageInfo.thumburl || imageInfo.url,
      width: imageInfo.thumbwidth || null,
      height: imageInfo.thumbheight || null,
    },
    description,
    parentPage: imageInfo.descriptionurl,
  };
}

function buildCommonsUrl(searchQuery, page, broaden = false) {
  const url = new URL(COMMONS_API);
  const terms = searchQuery.split(/\s+/).filter(Boolean);
  const effectiveQuery = broaden && terms.length > 1 ? terms.join(" OR ") : searchQuery;
  const parameters = {
    action: "query",
    generator: "search",
    gsrsearch: effectiveQuery,
    gsrnamespace: "6",
    gsrlimit: String(PAGE_SIZE),
    gsroffset: String((page - 1) * PAGE_SIZE),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "640",
    format: "json",
  };

  Object.entries(parameters).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
}

async function requestCommons(searchQuery, page, fetchImpl, broaden) {
  const response = await fetchImpl(buildCommonsUrl(searchQuery, page, broaden), {
    headers: {
      "User-Agent": "xFair-image-search/1.0 (educational project)",
    },
  });
  if (!response.ok) throw new Error(`Wikimedia Commons returned ${response.status}`);

  const data = await response.json();
  return Object.values(data.query?.pages || {})
    .sort((first, second) => first.index - second.index)
    .map(normalizePage)
    .filter(Boolean);
}

export async function searchImages(searchQuery, page, fetchImpl = fetch) {
  let images = await requestCommons(searchQuery, page, fetchImpl, false);
  if (!images.length && searchQuery.trim().includes(" ")) {
    images = await requestCommons(searchQuery, page, fetchImpl, true);
  }
  return images;
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(payload);
}

async function serveStatic(request, response, publicDirectory, pathname) {
  const staticFiles = {
    "/": "index.html",
    "/app.js": "app.js",
    "/source": "source.html",
    "/source/": "source.html",
    "/styles.css": "styles.css",
  };
  const fileName = staticFiles[pathname];
  if (!fileName) return false;

  const filePath = path.join(publicDirectory, fileName);
  const contents = await readFile(filePath);
  const extension = path.extname(fileName);
  response.writeHead(200, {
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600",
    "Content-Length": contents.length,
    "Content-Type": CONTENT_TYPES[extension],
  });
  if (request.method === "HEAD") response.end();
  else response.end(contents);
  return true;
}

async function serveSource(response, pathname) {
  const relativePath = SOURCE_FILES[pathname];
  if (!relativePath) return false;

  const contents = await readFile(path.join(APP_DIRECTORY, relativePath));
  response.writeHead(200, {
    "Cache-Control": "public, max-age=300",
    "Content-Length": contents.length,
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(contents);
  return true;
}

export function createAppServer({
  fetchImpl = fetch,
  recentStore = new RecentSearchStore(),
  publicDirectory = DEFAULT_PUBLIC_DIRECTORY,
} = {}) {
  return createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const { pathname } = requestUrl;

      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Origin": "*",
        });
        response.end();
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }

      if (pathname === "/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (pathname === "/recent" || pathname === "/recent/") {
        sendJson(response, 200, recentStore.list());
        return;
      }

      if (pathname.startsWith("/query/")) {
        const searchQuery = decodeURIComponent(pathname.slice("/query/".length)).trim();
        if (!searchQuery || searchQuery.length > 120) {
          sendJson(response, 400, { error: "Search query must contain 1 to 120 characters." });
          return;
        }

        const requestedPage = Number.parseInt(requestUrl.searchParams.get("page") || "1", 10);
        const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), 100) : 1;
        const images = await searchImages(searchQuery, page, fetchImpl);
        await recentStore.add(searchQuery);
        sendJson(response, 200, { images });
        return;
      }

      if (await serveSource(response, pathname)) return;
      if (await serveStatic(request, response, publicDirectory, pathname)) return;
      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      console.error(error);
      sendJson(response, 502, { error: "Image search is temporarily unavailable." });
    }
  });
}

async function start() {
  const recentStore = new RecentSearchStore(
    process.env.RECENT_FILE || DEFAULT_RECENT_FILE,
  );
  await recentStore.init();
  const server = createAppServer({ recentStore });
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Image search app listening on http://0.0.0.0:${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
