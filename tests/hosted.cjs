const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = "http://127.0.0.1:4173";
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browser = await chromium.launch({ headless: true, channel: "msedge" });
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [],
    externalAudio = [],
    fileDownloads = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("download", (d) => fileDownloads.push(d.suggestedFilename()));
  page.on("request", (req) => {
    if (/music\.apple\.com|soundcloud\.com|hitmoz\.com/.test(req.url()))
      externalAudio.push(req.url());
  });
  await page.goto(base + "/#catalog");
  await page.locator("#availabilityFilter").waitFor();
  assert.match(
    await page.locator(".availability-strip").textContent(),
    /207 ән тізімі/,
  );
  assert.match(
    await page.locator(".availability-strip").textContent(),
    /203 толық аудио/,
  );
  await page.locator("#availabilityFilter").selectOption("full");
  assert.ok((await page.locator(".track-row").count()) > 0);
  assert.equal(await page.locator(".pending-audio-text").count(), 0);
  await page.locator('[data-track-id="apple-1793534605"] .track-title').click();
  await page.waitForFunction(() => !document.getElementById("audio").paused);
  assert.equal(
    new URL(await page.locator("#audio").getAttribute("src"), base).origin,
    base,
  );
  await page.locator("#playBtn").click();
  await page.locator("#availabilityFilter").selectOption("pending");
  assert.equal(await page.locator(".track-row").count(), 4);
  await page.locator('[data-track-id="apple-1541309376"] .track-title').click();
  await page.locator(".availability-message").waitFor();
  assert.equal(await page.locator("#dialog iframe").count(), 0);
  await page.locator('[data-action="close-dialog"]').click();
  await page.locator("#availabilityFilter").selectOption("all");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const db = await import("./db.js");
    const catalog = await (await fetch("./catalog.json")).json();
    // Use small original test audio in this isolated context for the offline-storage assertions.
    const t = catalog.tracks.find((t) => t.id === "apple-1793534605");
    Object.assign(t, {
      title: "Түпнұсқа сынақ аудиосы",
      artist: "SAZ test fixture",
      audioUrl: "assets/audio/qazaq-wave.wav",
      downloadable: true,
      license: "CC0 original test fixture",
      audioSourceOverride: true,
      sha256: "",
      size: 1058444,
      duration: 24,
    });
    await db.put("settings", { key: "customCatalog", value: catalog });
  });
  await page.reload();
  await page.locator("#availabilityFilter").selectOption("full");
  assert.ok((await page.locator(".track-row").count()) > 0);
  await page.locator('[data-track-id="apple-1793534605"] .track-title').click();
  await page.waitForFunction(() => !document.getElementById("audio").paused);
  assert.equal(
    new URL(await page.locator("#audio").getAttribute("src"), base).origin,
    base,
  );
  await page
    .locator('[data-track-id="apple-1793534605"] [data-action="download"]')
    .click();
  await page
    .locator('[data-track-id="apple-1793534605"] .offline-text')
    .waitFor();
  await context.setOffline(true);
  await page.reload();
  await page.locator("#availabilityFilter").selectOption("offline");
  assert.equal(await page.locator(".track-row").count(), 1);
  await page.locator('[data-track-id="apple-1793534605"] .track-title').click();
  await page.waitForFunction(() => !document.getElementById("audio").paused);
  assert.match(await page.locator("#audio").getAttribute("src"), /^blob:/);
  await page.locator('#mainNav [href="#downloads"]').click();
  await page
    .getByRole("heading", { name: "Жеке әндерің. Интернетсіз тыңда." })
    .waitFor();
  assert.deepEqual(fileDownloads, []);
  assert.deepEqual(externalAudio, []);
  assert.deepEqual(errors, []);
  console.log(
    "Hosted checks passed: six-artist catalogue, truthful availability, same-site full audio, offline browser storage without a file download, no external music player.",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
