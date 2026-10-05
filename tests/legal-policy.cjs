const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const base = process.env.SAZ_TEST_URL || "http://127.0.0.1:4173/";
const output =
  process.env.SAZ_OUTPUT_DIR || path.join(__dirname, "../test-results");

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browser = await chromium.launch({ headless: true, channel: "msedge" });
  }
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(base + "#settings");
    await page.locator(".settings-grid").waitFor();
    assert.equal(
      await page
        .locator('.settings-grid a[href="legal/site-policy.html"]')
        .count(),
      1,
    );
    assert.equal(
      await page
        .locator('.page-footer a[href="legal/site-policy.html"]')
        .count(),
      1,
    );
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() =>
      Boolean(navigator.serviceWorker.controller),
    );

    // Cache installation, rather than a previous visit, makes the policy readable offline.
    await context.setOffline(true);
    await page.goto(base + "legal/site-policy.html?from=offline-test");
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert.match(await page.title(), /Сайт саясаты/);
    assert.equal(await page.locator(".clause").count(), 100);
    const registry = await page.evaluate(async () => {
      const response = await fetch("policy-registration.json");
      if (!response.ok) throw new Error("Offline registry unavailable");
      return response.json();
    });
    assert.equal(registry.documentId, "SAZ-POL-2026-001");
    assert.equal(registry.isDigitallySigned, false);
    for (const file of registry.files) {
      const fetched = await page.evaluate(async (name) => {
        const response = await fetch(name);
        return {
          contentType: response.headers.get("content-type"),
          data: Array.from(new Uint8Array(await response.arrayBuffer())),
        };
      }, file.path);
      const bytes = Buffer.from(fetched.data);
      assert.equal(
        crypto.createHash("sha256").update(bytes).digest("hex"),
        file.sha256,
        file.path,
      );
      if (file.path.endsWith(".pdf")) {
        assert.match(fetched.contentType, /application\/pdf/);
        assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
      }
    }
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width}: policy fits screen`,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "saz-policy-phone.png") });
    await page.goto(base + "#settings");
    await page.locator(".settings-grid").waitFor();
    assert.match(await page.title(), /SAZ/);

    // An unknown document must not be replaced by the player home page.
    let failed = false;
    try {
      await page.goto(base + "legal/missing-policy-document.html");
    } catch {
      failed = true;
    }
    assert.ok(failed, "unknown offline document reports a network failure");
    await context.close();
    console.log(
      "Policy passed: settings/footer links, first offline policy navigation, 100 readable clauses, PDF MIME and all registered file hashes, phone/desktop width, offline return to app, unknown-document routing.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
