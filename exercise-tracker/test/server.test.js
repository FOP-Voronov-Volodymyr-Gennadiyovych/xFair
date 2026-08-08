import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { ExerciseStore, createAppServer, formatExercise } from "../server.js";

const FIXED_NOW = new Date("2024-06-15T18:30:00.000Z");
let baseUrl;
let dataFile;
let server;
let temporaryDirectory;
let userId;

function postForm(url, values) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
}

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "exercise-tracker-"));
  dataFile = path.join(temporaryDirectory, "users.json");
  const store = new ExerciseStore(dataFile, {
    idFactory: () => "5fb5853f734231456ccb3b05",
    now: () => new Date(FIXED_NOW),
  });
  server = createAppServer({ store });
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

describe("exercise formatting", () => {
  it("uses dateString format and preserves field types", () => {
    const exercise = formatExercise({
      date: Date.UTC(1990, 0, 1),
      description: "test",
      duration: 60,
    });
    assert.deepEqual(exercise, {
      description: "test",
      duration: 60,
      date: "Mon Jan 01 1990",
    });
    assert.equal(typeof exercise.description, "string");
    assert.equal(typeof exercise.duration, "number");
    assert.equal(typeof exercise.date, "string");
  });
});

describe("user API", () => {
  it("creates a user from URL-encoded form data", async () => {
    const response = await postForm(`${baseUrl}/api/users`, { username: "fcc_test" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    const user = await response.json();
    assert.deepEqual(user, {
      _id: "5fb5853f734231456ccb3b05",
      username: "fcc_test",
    });
    userId = user._id;
  });

  it("lists user objects with only username and _id", async () => {
    const response = await fetch(`${baseUrl}/api/users`);
    const users = await response.json();
    assert.equal(Array.isArray(users), true);
    assert.deepEqual(users, [{
      _id: "5fb5853f734231456ccb3b05",
      username: "fcc_test",
    }]);
  });
});

describe("exercise and log API", () => {
  it("adds an exercise and returns the user with exercise fields", async () => {
    const response = await postForm(`${baseUrl}/api/users/${userId}/exercises`, {
      date: "1990-01-01",
      description: "test",
      duration: "60",
    });
    assert.deepEqual(await response.json(), {
      _id: userId,
      username: "fcc_test",
      description: "test",
      duration: 60,
      date: "Mon Jan 01 1990",
    });
  });

  it("uses the current date when the optional date is omitted", async () => {
    const response = await postForm(`${baseUrl}/api/users/${userId}/exercises`, {
      description: "walk",
      duration: "30",
    });
    const exercise = await response.json();
    assert.equal(exercise.date, "Sat Jun 15 2024");
    assert.equal(exercise.duration, 30);
  });

  it("returns the full user log and count", async () => {
    const response = await fetch(`${baseUrl}/api/users/${userId}/logs`);
    const result = await response.json();
    assert.equal(result._id, userId);
    assert.equal(result.username, "fcc_test");
    assert.equal(result.count, 2);
    assert.equal(Array.isArray(result.log), true);
    assert.deepEqual(result.log[0], {
      description: "test",
      duration: 60,
      date: "Mon Jan 01 1990",
    });
    result.log.forEach((exercise) => {
      assert.equal(typeof exercise.description, "string");
      assert.equal(typeof exercise.duration, "number");
      assert.equal(typeof exercise.date, "string");
    });
  });

  it("applies inclusive from, to, and limit filters", async () => {
    const filtered = await fetch(
      `${baseUrl}/api/users/${userId}/logs?from=1990-01-01&to=2024-06-15&limit=1`,
    ).then((response) => response.json());
    assert.equal(filtered.count, 1);
    assert.equal(filtered.log.length, 1);
    assert.equal(filtered.log[0].date, "Mon Jan 01 1990");
  });

  it("persists users and exercises to disk", async () => {
    const stored = JSON.parse(await readFile(dataFile, "utf8"));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].exercises.length, 2);
  });
});
