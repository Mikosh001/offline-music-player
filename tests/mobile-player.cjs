const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.SAZ_TEST_URL || "http://127.0.0.1:4173/";
const output =
  process.env.SAZ_OUTPUT_DIR || path.join(__dirname, "../test-results");
const engine = process.env.SAZ_TEST_ENGINE || "chromium";
const controls = ["shuffle", "prev", "play", "next", "repeat"];
let activePage;
async function playback(page) {
  return page.evaluate(async () => {
    const db = await import("./db.js");
    return (await db.get("settings", "playback"))?.value;
  });
}
async function playing(page) {
  await page.waitForFunction(() => {
    const a = document.getElementById("audio");
    return !a.paused && a.readyState >= 2 && a.currentTime > 0;
  });
}
async function geometry(page, selector, minimum = 44) {
  const boxes = [];
  for (const action of controls) {
    const button = page.locator(`${selector} [data-action="${action}"]`);
    await button.waitFor({ state: "visible" });
    assert.ok(await button.isVisible(), `${engine}: ${action} visible`);
    const box = await button.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(
      box.width >= minimum && box.height >= minimum,
      `${action}: touch target ${JSON.stringify(box)}`,
    );
    assert.ok(
      box.x >= 0 && box.x + box.width <= viewport.width + 1,
      `${action} within screen`,
    );
    assert.ok(
      box.y >= 0 && box.y + box.height <= viewport.height + 1,
      `${action} above screen bottom`,
    );
    boxes.push(box);
  }
  for (let i = 1; i < boxes.length; i++)
    assert.ok(
      boxes[i].x >= boxes[i - 1].x + boxes[i - 1].width - 1,
      "transport buttons do not overlap",
    );
}
(async () => {
  let browser;
  if (engine === "webkit") browser = await webkit.launch({ headless: true });
  else {
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      browser = await chromium.launch({ headless: true, channel: "msedge" });
    }
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => {
    // Reproducible E2E track order; core.test.mjs separately exercises the real random generator.
    Math.random = () => 0;
    window.mediaHandlers = {};
    if ("mediaSession" in navigator) {
      const original = navigator.mediaSession.setActionHandler.bind(
        navigator.mediaSession,
      );
      navigator.mediaSession.setActionHandler = (name, handler) => {
        window.mediaHandlers[name] = handler;
        return original(name, handler);
      };
    }
  });
  const page = await context.newPage(),
    errors = [];
  let mainNavigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) mainNavigations++;
  });
  activePage = page;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "#home");
  await page.locator('.hero [data-action="shuffle-play"]').waitFor();
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(
      () =>
        new Promise((resolve) => {
          if (navigator.serviceWorker.controller) resolve();
          else
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              resolve,
              { once: true },
            );
        }),
    ),
  );
  await page.waitForTimeout(150);
  assert.equal(
    mainNavigations,
    1,
    "first service-worker activation does not reload or interrupt the app",
  );
  // Explicit test insets model a notched iPhone; desktop engines return zero for actual env() insets.
  await page.addStyleTag({
    content: ":root { --safe-top:59px; --safe-bottom:34px; }",
  });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".mobile-nav")).height === "98px",
  );
  assert.ok((await page.locator(".mobile-brand").boundingBox()).y >= 59);
  assert.ok((await page.locator(".search-wrap").boundingBox()).y >= 59);
  assert.equal(
    await page.locator("#search").evaluate((e) => getComputedStyle(e).fontSize),
    "16px",
  );
  await geometry(page, ".transport");
  assert.ok(
    (await page.locator(".mobile-nav a").last().boundingBox()).y + 44 <=
      844 - 34,
  );
  // Global shuffle includes the full playable collection rather than the eight home preview rows.
  await page.locator('.hero [data-action="shuffle-play"]').click();
  await playing(page);
  await page.waitForTimeout(450);
  let saved = await playback(page);
  const fullCount = await page.evaluate(
    async () =>
      (await (await fetch("./catalog.json")).json()).tracks.filter(
        (t) => !t.demo && t.audioUrl && t.downloadable,
      ).length,
  );
  assert.equal(saved.queue.length, fullCount);
  assert.equal(fullCount, 203);
  assert.equal(new Set(saved.queue).size, 203);
  assert.equal(saved.shuffle, true);
  assert.notDeepEqual(saved.queue, saved.queueOrder);
  const first = saved.currentId;
  await page.locator('.transport [data-action="next"]').click();
  await playing(page);
  await page.waitForTimeout(400);
  assert.notEqual((await playback(page)).currentId, first);
  await page.evaluate(() => (document.getElementById("audio").currentTime = 0));
  await page.locator('.transport [data-action="prev"]').click();
  await playing(page);
  await page.waitForTimeout(400);
  assert.equal((await playback(page)).currentId, first);
  // Changing page must not reduce the existing queue to a preview or an empty view.
  await page.locator('.mobile-nav [href="#settings"]').click();
  await page.locator("#shuffleBtn").click();
  await page.waitForTimeout(450);
  saved = await playback(page);
  assert.equal(saved.shuffle, false);
  assert.deepEqual(saved.queue, saved.queueOrder);
  assert.equal(saved.queue.length, 203);
  await page.locator("#shuffleBtn").click();
  await page.waitForTimeout(400);
  await page.locator('.mobile-nav [href="#home"]').click();
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({
    path: path.join(output, `saz-phone-player-${engine}.png`),
  });
  // Expanded player controls, metadata and seek position remain live as songs change.
  await page.locator('[data-action="now-playing"]').click();
  assert.equal(await page.locator("#dialog").evaluate((e) => e.open), true);
  await geometry(page, ".now-controls");
  assert.ok(
    (await page.locator('#dialog [data-action="close-dialog"]').boundingBox())
      .y >= 59,
  );
  const oldTitle = await page.locator(".now-copy h3").textContent();
  await page.locator('.now-controls [data-action="next"]').click();
  await playing(page);
  assert.notEqual(await page.locator(".now-copy h3").textContent(), oldTitle);
  assert.equal(
    await page.locator(".now-copy h3").textContent(),
    await page.locator("#playerTitle").textContent(),
  );
  await page.locator('.now-controls [data-action="play"]').click();
  await page.waitForFunction(() => document.getElementById("audio").paused);
  await page.waitForFunction(
    () =>
      document
        .querySelector('.now-controls [data-action="play"]')
        .getAttribute("aria-label") === "Ойнату",
  );
  assert.equal(
    await page
      .locator('.now-controls [data-action="play"]')
      .getAttribute("aria-label"),
    "Ойнату",
  );
  await page.locator("#nowSeek").fill("50");
  await page.locator("#nowSeek").dispatchEvent("input");
  assert.ok(
    await page
      .locator("#audio")
      .evaluate((a) => Math.abs(a.currentTime / a.duration - 0.5) < 0.02),
  );
  await page.locator('.now-actions [data-action="player-favorite"]').click();
  await page.waitForFunction(
    () =>
      document.getElementById("playerFav").getAttribute("aria-pressed") ===
      "true",
  );
  assert.equal(
    await page.locator("#playerFav").getAttribute("aria-pressed"),
    "true",
  );
  for (let i = 0; i < 2; i++)
    await page.locator('.now-controls [data-action="repeat"]').click();
  assert.equal(await page.locator("[data-repeat-one]").isVisible(), true);
  await page.screenshot({
    path: path.join(output, `saz-phone-now-playing-${engine}.png`),
  });
  await page.locator('#dialog [data-action="close-dialog"]').click();
  // Verify native Media Session command handlers, without claiming OS lock-screen rendering.
  const nativeAvailable = await page.evaluate(
    () => "mediaSession" in navigator,
  );
  if (nativeAvailable) {
    assert.deepEqual(
      await page.evaluate(() => [
        typeof mediaHandlers.previoustrack,
        typeof mediaHandlers.nexttrack,
        mediaHandlers.seekbackward,
        mediaHandlers.seekforward,
      ]),
      ["function", "function", null, null],
    );
    await page.evaluate(() => mediaHandlers.nexttrack());
    await playing(page);
    await page.waitForTimeout(400);
    const nativeNext = (await playback(page)).currentId;
    await page.evaluate(() => {
      document.getElementById("audio").currentTime = 0;
      mediaHandlers.previoustrack();
    });
    await playing(page);
    await page.waitForTimeout(400);
    assert.notEqual((await playback(page)).currentId, nativeNext);
  }
  // Real hosted audio: store two songs, then reload with the network disconnected and shuffle only those.
  await page.goto(base + "#catalog");
  await page.locator("#search").fill("saz-no-matching-song-1234");
  await page.locator(".empty-state").waitFor();
  const queueBeforeEmptySearch = (await playback(page)).queue;
  await page.locator('.page-heading [data-action="shuffle-play"]').click();
  assert.match(
    await page.locator("#toast").textContent(),
    /Бұл таңдауда ойнатылатын ән жоқ/,
  );
  assert.deepEqual((await playback(page)).queue, queueBeforeEmptySearch);
  await page.locator("#search").fill("");
  await page.locator(".track-row").first().waitFor();
  if (!process.env.SAZ_SKIP_OFFLINE) {
    await page.goto(base + "#catalog");
    const downloadIds = ["apple-1793534605", "apple-1654400423"];
    for (const id of downloadIds) {
      const row = page.locator(`[data-track-id="${id}"]`);
      await row.locator('[data-action="download"]').click();
      await row.locator(".offline-text").waitFor({ timeout: 60000 });
    }
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.goto(base + "#home");
    await page.locator('.hero [data-action="shuffle-play"]').click();
    await playing(page);
    await page.waitForTimeout(400);
    saved = await playback(page);
    assert.deepEqual([...saved.queue].sort(), downloadIds.sort());
    assert.match(await page.locator("#audio").getAttribute("src"), /^blob:/);
    await page.locator('.transport [data-action="next"]').click();
    await playing(page);
    assert.match(await page.locator("#audio").getAttribute("src"), /^blob:/);
  }
  await context.setOffline(false);
  // Small phones: no horizontal overflow and all five transport buttons remain tappable.
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto(base + "#home");
    await page.locator(".hero").waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}: no overflow`,
    );
    await geometry(page, ".transport");
    await page.locator('[data-action="now-playing"]').click();
    await geometry(page, ".now-controls");
    await page.locator('#dialog [data-action="close-dialog"]').click();
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(base + "#home");
  await page.locator(".hero").waitFor();
  await page.addStyleTag({
    content:
      ":root { --safe-left:47px; --safe-right:47px; --safe-bottom:21px; }",
  });
  await geometry(page, ".transport");
  assert.ok((await page.locator(".mobile-brand").boundingBox()).x >= 47);
  await page.locator('[data-action="now-playing"]').click();
  await geometry(page, ".now-controls");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    `Mobile ${engine} passed: safe-area geometry, 44px controls, 203-song shuffle, original queue restore, expanded player, favorites, repeat, seek, Media Session commands, ${process.env.SAZ_SKIP_OFFLINE ? "offline codec test explicitly skipped" : "offline two-song shuffle (actual hosted MP3)"}, portrait widths 320–430 and landscape 844.`,
  );
})().catch(async (error) => {
  console.error(error);
  if (activePage)
    console.error(
      await activePage
        .evaluate(() => {
          const a = document.getElementById("audio");
          return {
            title: document.getElementById("playerTitle").textContent,
            paused: a.paused,
            time: a.currentTime,
            ready: a.readyState,
            error: a.error?.message,
            toast: document.getElementById("toast").textContent,
            dimensions: { w: innerWidth, h: innerHeight },
            nav: document
              .querySelector(".mobile-nav")
              .getBoundingClientRect()
              .toJSON(),
            navItem: document
              .querySelector(".mobile-nav a:last-child")
              .getBoundingClientRect()
              .toJSON(),
          };
        })
        .catch(() => null),
    );
  process.exit(1);
});
