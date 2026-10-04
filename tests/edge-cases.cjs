const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const base = "http://127.0.0.1:4173",
  root = path.resolve(__dirname, "..");
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browser = await chromium.launch({ headless: true, channel: "msedge" });
  }
  const legacy = await browser.newContext();
  const p = await legacy.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/icon.svg");
  await p.evaluate(async () => {
    const blob = await (await fetch("/assets/audio/qazaq-wave.wav")).blob();
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("offline-music-player", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("tracks", {
          keyPath: "id",
          autoIncrement: true,
        });
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("tracks", "readwrite");
        for (const id of [1, 2])
          tx.objectStore("tracks").put({
            id,
            name: `Legacy ${id}`,
            blob,
            size: blob.size,
            addedAt: id,
          });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await p.goto(base + "/#downloads");
  await p.locator(".track-row").first().waitFor();
  assert.equal(await p.locator(".track-row").count(), 2);
  assert.deepEqual(
    await p.evaluate(async () => {
      const DB = await import("./db.js");
      const db = await DB.openDB();
      return {
        version: db.version,
        legacy: db.objectStoreNames.contains("tracks"),
        files: (await DB.getAll("library")).filter((t) => t.downloaded).length,
      };
    }),
    { version: 2, legacy: false, files: 2 },
  );
  await p.locator('[data-track-id="local-legacy-2"] .track-title').click();
  await p.waitForFunction(() => !document.getElementById("audio").paused);
  await p
    .locator('[data-track-id="local-legacy-1"] [data-action="track-menu"]')
    .last()
    .click();
  await p.getByRole("button", { name: "Құрылғыдан өшіру" }).click();
  assert.equal(await p.locator("#playerTitle").textContent(), "Legacy 2");
  assert.ok(await p.evaluate(() => !document.getElementById("audio").paused));
  const abortContext = await browser.newContext();
  const a = await abortContext.newPage();
  a.on("pageerror", (e) => errors.push(e.message));
  await a.goto(base + "/#collection/demo");
  await a.getByRole("heading", { name: "Офлайнды сынау" }).waitFor();
  const wav = await fs.readFile(path.join(root, "assets/audio/qazaq-wave.wav"));
  await a.route("**/assets/audio/qazaq-wave.wav", async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route
      .fulfill({ status: 200, contentType: "audio/wav", body: wav })
      .catch(() => {});
  });
  await a
    .locator('[data-track-id="saz-wave"] [data-action="download"]')
    .click();
  await a
    .locator('[data-track-id="saz-wave"] [data-action="cancel-download"]')
    .click();
  await a.waitForTimeout(1200);
  assert.equal(
    await a.evaluate(async () => {
      const DB = await import("./db.js");
      return Boolean(await DB.get("audio", "saz-wave"));
    }),
    false,
  );
  await a.unroute("**/assets/audio/qazaq-wave.wav");
  await a
    .locator('[data-track-id="saz-wave"] [data-action="download"]')
    .click();
  await a.locator('[data-track-id="saz-wave"] .offline-text').waitFor();
  await a.route("**/assets/audio/quiet-evening.wav", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html>Not audio</html>",
    }),
  );
  await a
    .locator('[data-track-id="saz-evening"] [data-action="download"]')
    .click();
  await a.waitForTimeout(350);
  assert.equal(
    await a.evaluate(async () => {
      const DB = await import("./db.js");
      return Boolean(await DB.get("audio", "saz-evening"));
    }),
    false,
  );
  await a.unroute("**/assets/audio/quiet-evening.wav");
  await a.getByRole("button", { name: "Қолжетімді аудионы жүктеу" }).click();
  await a.locator('[data-track-id="saz-evening"] .offline-text').waitFor();
  assert.equal(
    await a.evaluate(async () => {
      const DB = await import("./db.js");
      return (await DB.getAll("library")).filter((t) => t.downloaded).length;
    }),
    2,
  );
  await a.locator("#backupInput").setInputFiles({
    name: "broken.saz",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("invalid backup"),
  });
  await a.waitForTimeout(150);
  assert.equal(
    await a.evaluate(async () => {
      const DB = await import("./db.js");
      return (await DB.getAll("library")).filter((t) => t.downloaded).length;
    }),
    2,
  );
  await a.goto(base + "/#catalog");
  await a.locator('[data-track-id="apple-1793534605"] .track-title').click();
  await a.locator(".availability-message").waitFor();
  assert.equal(await a.locator("#dialog iframe").count(), 0);
  assert.match(
    await a.locator(".availability-message").textContent(),
    /Толық аудио күтілуде/,
  );
  assert.equal(await a.locator('#dialog a[target="_blank"]').count(), 0);
  await a.locator('[data-action="close-dialog"]').click();
  for (const width of [320, 360, 390, 768, 1440]) {
    await a.setViewportSize({ width, height: 900 });
    for (const view of [
      "home",
      "catalog",
      "artists",
      "settings",
      "downloads",
    ]) {
      await a.goto(base + "/#" + view);
      await a.waitForTimeout(60);
      assert.ok(
        await a.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `overflow at ${width} ${view}`,
      );
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "Edge-case checks passed: v1 migration, stable playback on deletion, cancelled download rollback, retry, non-audio rejection, batch download, damaged backup rejection, unavailable audio without external playback, responsive widths 320–1440.",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
