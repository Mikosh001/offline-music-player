const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.SAZ_TEST_BASE || "http://127.0.0.1:4173/";
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browser = await chromium.launch({ headless: true, channel: "msedge" });
  }
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "icon.svg");
    const seeded = await page.evaluate(async () => {
      const DB = await import("./db.js");
      const catalog = await (
        await fetch("./catalog.json", { cache: "reload" })
      ).json();
      // Reproduce an older imported catalogue with no public audio and two privately saved recordings.
      for (const track of catalog.tracks.filter((track) => !track.demo)) {
        Object.assign(track, {
          audioUrl: "",
          downloadable: false,
          license: "",
          size: 0,
          sha256: "",
        });
      }
      const ids = ["apple-1793534605", "apple-1654400423"];
      const blob = await (await fetch("./assets/audio/qazaq-wave.wav")).blob();
      const hash = async (data) =>
        [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
      for (const id of ids) {
        await DB.saveAudio(
          {
            ...catalog.tracks.find((track) => track.id === id),
            duration: 24,
            favorite: id === ids[0],
            plays: 7,
          },
          blob,
        );
      }
      await DB.put("settings", { key: "customCatalog", value: catalog });
      await DB.put("settings", { key: "cachedCatalog", value: catalog });
      await DB.put("settings", {
        key: "playback",
        value: {
          currentId: ids[1],
          position: 3,
          queue: ids,
          shuffle: false,
          repeat: "all",
        },
      });
      await DB.put("playlists", {
        id: "personal-playlist",
        name: "Менің сақталған жинағым",
        trackIds: ids,
      });
      return {
        ids,
        size: blob.size,
        sha256: await hash(await blob.arrayBuffer()),
      };
    });
    await page.goto(base + "#catalog");
    await page.locator(".availability-strip").waitFor();
    assert.match(
      await page.locator(".availability-strip").textContent(),
      /203 толық аудио · 2 офлайн дайын/,
    );
    assert.equal(await page.locator("#favCount").textContent(), "1");
    assert.equal(await page.locator("#downloadCount").textContent(), "2");
    await page.getByRole("link", { name: "Менің сақталған жинағым" }).waitFor();
    await page.waitForFunction(
      () => Math.abs(document.getElementById("audio").currentTime - 3) < 0.5,
    );
    assert.equal(
      await page.evaluate(() => document.getElementById("audio").paused),
      true,
    );
    const verifyStored = async () => {
      const stored = await page.evaluate(async (ids) => {
        const DB = await import("./db.js");
        const records = [];
        for (const id of ids) {
          const audio = await DB.get("audio", id);
          const library = await DB.get("library", id);
          const hash = [
            ...new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                await audio.blob.arrayBuffer(),
              ),
            ),
          ]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("");
          records.push({
            id,
            size: audio.blob.size,
            sha256: hash,
            plays: library.plays,
          });
        }
        const cached = await DB.get("settings", "cachedCatalog");
        return {
          records,
          cachedFull: cached.value.tracks.filter(
            (track) => !track.demo && track.downloadable && track.audioUrl,
          ).length,
        };
      }, seeded.ids);
      assert.equal(stored.cachedFull, 203);
      for (const record of stored.records) {
        assert.equal(record.size, seeded.size);
        assert.equal(record.sha256, seeded.sha256);
        assert.equal(record.plays, 7);
      }
    };
    await verifyStored();
    await page.goto(base + "#settings");
    await page.getByRole("button", { name: "Сайт каталогын жаңарту" }).click();
    await page.locator("#toast").filter({ hasText: "Сайт каталогы жаңартылды." }).waitFor();
    await page.waitForFunction(async () => {
      const DB = await import("./db.js");
      return (
        (await DB.getAll("library")).filter((track) => track.downloaded)
          .length === 2
      );
    });
    await verifyStored();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.goto(base + "#catalog");
    await page.reload();
    await page.locator(".availability-strip").waitFor();
    assert.match(
      await page.locator(".availability-strip").textContent(),
      /203 толық аудио · 2 офлайн дайын/,
    );
    await page.locator("#availabilityFilter").selectOption("offline");
    assert.equal(await page.locator(".track-row").count(), 2);
    await page
      .locator(`[data-track-id="${seeded.ids[0]}"] .track-title`)
      .click();
    await page.waitForFunction(() => !document.getElementById("audio").paused);
    assert.match(await page.locator("#audio").getAttribute("src"), /^blob:/);
    await page.locator("#playBtn").click();
    assert.deepEqual(errors, []);
    console.log(
      "Catalogue sync passed in Edge: stale imported catalogue becomes 203 full songs; two exact private files, favorite, playlist, play counts and playback position survive; offline reload and private playback work.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
