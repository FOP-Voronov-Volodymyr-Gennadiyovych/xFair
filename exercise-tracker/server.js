import { randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIRECTORY = path.join(APP_DIRECTORY, "public");
const USERS_FILE = path.join(APP_DIRECTORY, "data", "users.json");
const MAX_BODY_BYTES = 16 * 1024;

const STATIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};

function makeId() {
  return randomBytes(12).toString("hex");
}

function utcDayTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function formatExercise(exercise) {
  return {
    description: exercise.description,
    duration: exercise.duration,
    date: new Date(exercise.date).toDateString(),
  };
}

export class ExerciseStore {
  constructor(filePath = USERS_FILE, { idFactory = makeId, now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.idFactory = idFactory;
    this.now = now;
    this.users = [];
    this.initializing = null;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      try {
        const contents = await readFile(this.filePath, "utf8");
        const parsed = JSON.parse(contents);
        this.users = Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await mkdir(path.dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, "[]\n", "utf8");
      }
    })();
    return this.initializing;
  }

  async persist() {
    const payload = `${JSON.stringify(this.users, null, 2)}\n`;
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf8");
    });
    await this.writeQueue;
  }

  async createUser(username) {
    await this.init();
    const existing = this.users.find((user) => user.username === username);
    if (existing) return { _id: existing._id, username: existing.username };

    const user = { _id: this.idFactory(), username, exercises: [] };
    this.users.push(user);
    await this.persist();
    return { _id: user._id, username: user.username };
  }

  async listUsers() {
    await this.init();
    return this.users.map(({ _id, username }) => ({ _id, username }));
  }

  async addExercise(userId, { date, description, duration }) {
    await this.init();
    const user = this.users.find((item) => item._id === userId);
    if (!user) return null;

    const timestamp = utcDayTimestamp(date || this.now());
    if (timestamp === null) return { error: "Invalid date" };
    const numericDuration = Number(duration);
    if (!description?.trim() || !Number.isFinite(numericDuration) || numericDuration <= 0) {
      return { error: "Description and positive duration are required" };
    }

    const exercise = {
      date: timestamp,
      description: description.trim(),
      duration: numericDuration,
    };
    user.exercises.push(exercise);
    await this.persist();

    return {
      _id: user._id,
      username: user.username,
      ...formatExercise(exercise),
    };
  }

  async getLog(userId, { from, limit, to } = {}) {
    await this.init();
    const user = this.users.find((item) => item._id === userId);
    if (!user) return null;

    const fromTime = from ? utcDayTimestamp(from) : null;
    const toTime = to ? utcDayTimestamp(to) : null;
    let exercises = user.exercises.filter((exercise) => {
      if (fromTime !== null && exercise.date < fromTime) return false;
      if (toTime !== null && exercise.date > toTime) return false;
      return true;
    });

    const numericLimit = Number.parseInt(limit, 10);
    if (Number.isInteger(numericLimit) && numericLimit >= 0) {
      exercises = exercises.slice(0, numericLimit);
    }

    return {
      _id: user._id,
      username: user.username,
      count: exercises.length,
      log: exercises.map(formatExercise),
    };
  }
}

async function readRequestBody(request, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseBody(body, contentType = "") {
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(body));
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
  publicDirectory = PUBLIC_DIRECTORY,
  store = new ExerciseStore(),
} = {}) {
  return createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const { pathname, searchParams } = requestUrl;

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

      if ((pathname === "/api/users" || pathname === "/api/users/") && request.method === "POST") {
        const body = parseBody(
          await readRequestBody(request),
          request.headers["content-type"] || "",
        );
        const username = typeof body.username === "string" ? body.username.trim() : "";
        if (!username) {
          sendJson(response, 400, { error: "Username is required" });
          return;
        }
        sendJson(response, 200, await store.createUser(username));
        return;
      }

      if ((pathname === "/api/users" || pathname === "/api/users/") && (request.method === "GET" || request.method === "HEAD")) {
        sendJson(response, 200, await store.listUsers(), request.method);
        return;
      }

      const exerciseMatch = pathname.match(/^\/api\/users\/([^/]+)\/exercises\/?$/);
      if (exerciseMatch && request.method === "POST") {
        const body = parseBody(
          await readRequestBody(request),
          request.headers["content-type"] || "",
        );
        const result = await store.addExercise(decodeURIComponent(exerciseMatch[1]), body);
        if (!result) {
          sendJson(response, 404, { error: "Unknown userId" });
          return;
        }
        if (result.error) {
          sendJson(response, 400, result);
          return;
        }
        sendJson(response, 200, result);
        return;
      }

      const logMatch = pathname.match(/^\/api\/users\/([^/]+)\/logs\/?$/);
      if (logMatch && (request.method === "GET" || request.method === "HEAD")) {
        const result = await store.getLog(decodeURIComponent(logMatch[1]), {
          from: searchParams.get("from") || undefined,
          limit: searchParams.get("limit") || undefined,
          to: searchParams.get("to") || undefined,
        });
        if (!result) {
          sendJson(response, 404, { error: "Unknown userId" }, request.method);
          return;
        }
        sendJson(response, 200, result, request.method);
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
    console.log(`Exercise tracker listening on http://0.0.0.0:${port}`);
  });
}
