import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "find-tony-test-"));
process.env.DATA_DIR = dataDirectory;
const { createApp } = await import("../server.js");
let server;
let baseUrl;

before(async () => {
  const app = await createApp();
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await fs.rm(dataDirectory, { recursive: true, force: true });
});

test("health check is ready and returns JSON", async () => {
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("PWA manifest, service worker, icons, and local Leaflet assets are served", async () => {
  const htmlResponse = await fetch(`${baseUrl}/`);
  assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text();
  assert.match(html, /<title>Find Tony \/\/ Sydney<\/title>/);
  assert.match(html, /src="\/app\.js\?v=2"/);

  const manifestResponse = await fetch(`${baseUrl}/manifest.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "Find Tony - Sydney");
  assert.equal(manifest.display, "standalone");

  for (const resource of [
    "/sw.js",
    "/icons/icon.svg",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/vendor/leaflet/leaflet.js",
    "/vendor/leaflet/leaflet.css",
  ]) {
    const response = await fetch(`${baseUrl}${resource}`);
    assert.equal(response.status, 200, `${resource} should be available`);
  }
});

test("vibe results are filtered, distance-sorted, and reject partial coordinates", async () => {
  const response = await fetch(`${baseUrl}/api/vibes?category=FOODIE&lat=-33.9175&lng=151.2313`);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.ok(result.items.length >= 3);
  assert.ok(result.items.every((item) => item.category === "FOODIE" && Number.isFinite(item.distanceMeters)));
  assert.ok(result.items[0].distanceMeters <= result.items.at(-1).distanceMeters);

  const partial = await fetch(`${baseUrl}/api/vibes?lat=-33.9175`);
  assert.equal(partial.status, 400);
});

test("alerts validate inputs, persist, and survive concurrent submissions", async () => {
  const invalid = await fetch(`${baseUrl}/api/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Outside Sydney", category: "CHILL", lat: 40, lng: -73 }),
  });
  assert.equal(invalid.status, 400);

  const submissions = await Promise.all(["Test study meetup", "Second study meetup"].map((title) =>
    fetch(`${baseUrl}/api/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        category: "CHILL",
        lat: -33.9175,
        lng: 151.2313,
        details: "A test community pin.",
      }),
    })));
  const results = await Promise.all(submissions.map((response) => response.json()));
  assert.ok(submissions.every((response) => response.status === 201));
  assert.deepEqual(results.map((result) => result.item.title).sort(), ["Second study meetup", "Test study meetup"]);

  const search = await fetch(`${baseUrl}/api/vibes?category=CHILL&lat=-33.9175&lng=151.2313`);
  const spots = await search.json();
  assert.ok(results.every((result) => spots.items.some((item) => item.id === result.item.id)));
  const stored = await fs.readFile(path.join(dataDirectory, "alerts.json"), "utf8");
  assert.ok(results.every((result) => stored.includes(result.item.id)));
});
