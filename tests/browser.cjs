const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = process.env.SAZ_OUTPUT_DIR || path.join(root, "test-results");
async function start() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browser = await chromium.launch({ headless: true, channel: "msedge" });
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4173");
  await page.getByRole("heading", { name: "Қош келдің, тыңдарман." }).waitFor();
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(
      () =>
        new Promise((resolve) =>
          navigator.serviceWorker.controller
            ? resolve()
            : navigator.serviceWorker.addEventListener(
                "controllerchange",
                resolve,
                { once: true },
              ),
        ),
    ),
  );
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({
    path: path.join(output, "saz-desktop.png"),
    fullPage: false,
  });
  await page.locator("#search").fill("Ернар");
  await page.waitForURL("**/#catalog");
  await page.getByRole("heading", { name: "«Ернар» іздеу нәтижесі" }).waitFor();
  const rows = page.locator(".track-row");
  assert.ok((await rows.count()) > 10);
  await page.locator("#search").fill("");
  await page.waitForTimeout(250);
  await page.goto("http://127.0.0.1:4173/#collection/demo");
  await page.getByRole("heading", { name: "Офлайнды сынау" }).waitFor();
  await page
    .locator('[data-track-id="saz-wave"] [data-action="favorite"]')
    .click();
  await page
    .locator('[data-track-id="saz-wave"] [data-action="download"]')
    .click();
  await page
    .locator('[data-track-id="saz-wave"] .offline-text')
    .waitFor({ timeout: 20000 });
  assert.equal(
    await page.evaluate(async () => {
      const db = await import("./db.js");
      return (await db.get("audio", "saz-wave")).blob.size;
    }),
    1058444,
  );
  await page
    .locator('[data-track-id="saz-wave"] [data-action="track-play"]')
    .last()
    .click();
  await page.waitForFunction(() => !document.getElementById("audio").paused);
  await page.locator("#seek").fill("35");
  await page.locator('[data-action="new-playlist"]').first().click();
  await page.locator("#playlistName").fill("Жолға");
  await page
    .locator("#dialog")
    .getByRole("button", { name: "Плейлист жасау", exact: true })
    .click();
  await page.getByRole("heading", { name: "Жолға", exact: true }).waitFor();
  await page.goto("http://127.0.0.1:4173/#collection/demo");
  await page
    .locator('[data-track-id="saz-wave"] [data-action="track-menu"]')
    .last()
    .click();
  await page
    .getByRole("button", { name: "Плейлистке қосу", exact: true })
    .click();
  await page.getByRole("button", { name: "Жолға", exact: true }).click();
  await page.waitForTimeout(600);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Офлайнды сынау" }).waitFor();
  await page.locator('[data-track-id="saz-wave"] .offline-text').waitFor();
  assert.equal(await page.locator("#playerTitle").textContent(), "Өз ырғағың");
  assert.ok(
    (await page.evaluate(() => document.getElementById("audio").currentTime)) >
      7,
  );
  await page
    .locator('[data-track-id="saz-wave"] [data-action="track-play"]')
    .last()
    .click();
  await page.waitForFunction(() => !document.getElementById("audio").paused);
  await page.locator('#mainNav [href="#favorites"]').click();
  assert.equal(await page.locator(".track-row").count(), 1);
  await page.locator("#playlistNav a").filter({ hasText: "Жолға" }).click();
  assert.equal(await page.locator(".track-row").count(), 1);
  await context.setOffline(false);
  await page.goto("http://127.0.0.1:4173/#settings");
  const backupEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Көшірмені сақтау" }).click();
  const backup = await backupEvent;
  const backupPath = path.join(output, "test-backup.saz");
  await backup.saveAs(backupPath);
  const second = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  const mobile = await second.newPage();
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto("http://127.0.0.1:4173");
  await mobile
    .getByRole("heading", { name: "Қош келдің, тыңдарман." })
    .waitFor();
  await mobile.screenshot({
    path: path.join(output, "saz-mobile.png"),
    fullPage: false,
  });
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mobile.locator("#backupInput").setInputFiles(backupPath);
  await mobile.waitForURL("**/#downloads");
  await mobile.locator('[data-track-id="saz-wave"] .offline-text').waitFor();
  assert.equal(
    await mobile.evaluate(async () => {
      const db = await import("./db.js");
      return (await db.get("audio", "saz-wave")).blob.size;
    }),
    1058444,
  );
  const imported = await mobile.evaluate(async () => {
    const db = await import("./db.js");
    return await db.getAll("playlists");
  });
  assert.equal(imported[0].name, "Жолға");
  assert.ok(imported[0].trackIds.includes("saz-wave"));
  await mobile
    .locator("#fileInput")
    .setInputFiles(path.join(root, "assets/audio/quiet-evening.wav"));
  await mobile.waitForFunction(async () => {
    const db = await import("./db.js");
    return (
      (await db.getAll("library")).filter((t) => t.downloaded).length === 2
    );
  });
  await mobile
    .locator("#fileInput")
    .setInputFiles(path.join(root, "assets/audio/quiet-evening.wav"));
  await mobile.waitForTimeout(400);
  assert.equal(
    await mobile.evaluate(async () => {
      const db = await import("./db.js");
      return (await db.getAll("library")).filter((t) => t.downloaded).length;
    }),
    2,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: catalogue, Kazakh search, favorites, download bytes, playback, resume position, offline reload, playlist persistence, full-audio backup/restore, local import deduplication, mobile width.",
  );
  await browser.close();
}
start().catch((error) => {
  console.error(error);
  process.exit(1);
});
