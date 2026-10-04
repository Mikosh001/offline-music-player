import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { publishAudio } from "../scripts/publish-audio.mjs";
import { hasFullAudio, filterTracks, validateCatalog } from "../core.js";

async function fixture() {
  const base = fileURLToPath(
    new URL("../test-results/publisher/", import.meta.url),
  );
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "fixture-"));
  const track = {
    id: "test-original",
    title: "Original test audio",
    artistId: "ernar",
    audioUrl: "",
    downloadable: false,
  };
  await writeFile(
    path.join(root, "catalog.json"),
    JSON.stringify({
      artists: [{ id: "ernar", name: "Test fixture" }],
      tracks: [track],
    }),
  );
  const bytes = await readFile(
    new URL("../assets/audio/qazaq-wave.wav", import.meta.url),
  );
  await writeFile(path.join(root, "original.wav"), bytes);
  const manifestPath = path.join(root, "manifest.json");
  const entry = {
    trackId: track.id,
    file: "original.wav",
    redistributionAllowed: true,
    license: "CC0-1.0 original test fixture",
    permissionRef: "SAZ original demo generator",
    sourceUrl: "https://example.com/original-test-fixture",
  };
  await writeFile(manifestPath, JSON.stringify({ tracks: [entry] }));
  return { root, manifestPath, entry, bytes };
}

test("offline, full-audio and pending filters keep catalogue metadata separate from available sound", () => {
  const tracks = [
    { id: "pending", title: "Pending" },
    {
      id: "hosted",
      title: "Hosted",
      audioUrl: "assets/audio/full.mp3",
      downloadable: true,
      license: "Permission",
    },
    { id: "saved", title: "Saved", downloaded: true },
  ];
  assert.equal(hasFullAudio(tracks[1]), true);
  assert.deepEqual(
    filterTracks(tracks, { availability: "full" }).map((t) => t.id),
    ["hosted", "saved"],
  );
  assert.deepEqual(
    filterTracks(tracks, { availability: "offline" }).map((t) => t.id),
    ["saved"],
  );
  assert.deepEqual(
    filterTracks(tracks, { availability: "pending" }).map((t) => t.id),
    ["pending"],
  );
  assert.deepEqual(
    filterTracks(tracks, { availability: "full", offlineOnly: true }).map(
      (t) => t.id,
    ),
    ["saved"],
  );
});

test("publisher preview leaves files unchanged; apply stores exact bytes on the site with permission references", async () => {
  const f = await fixture();
  const before = await readFile(path.join(f.root, "catalog.json"), "utf8");
  const preview = await publishAudio(f);
  assert.equal(preview.applied, false);
  assert.equal(
    await readFile(path.join(f.root, "catalog.json"), "utf8"),
    before,
  );
  await assert.rejects(access(path.join(f.root, preview.tracks[0].audioUrl)), {
    code: "ENOENT",
  });
  const applied = await publishAudio({ ...f, apply: true });
  const track = validateCatalog(
    JSON.parse(await readFile(path.join(f.root, "catalog.json"), "utf8")),
  ).tracks[0];
  assert.match(
    track.audioUrl,
    /^assets\/audio\/licensed\/test-original-[a-f0-9]+\.wav$/,
  );
  assert.deepEqual(await readFile(path.join(f.root, track.audioUrl)), f.bytes);
  assert.equal(track.size, f.bytes.length);
  assert.equal(track.permissionRef, f.entry.permissionRef);
  assert.equal(
    track.sha256,
    createHash("sha256").update(f.bytes).digest("hex"),
  );
  assert.equal(applied.applied, true);
  await publishAudio({ ...f, apply: true }); // Repeated publication reuses the same immutable file.
});

test("missing redistribution rights or a bad second file rejects the whole batch before publication", async () => {
  const f = await fixture();
  const before = await readFile(path.join(f.root, "catalog.json"), "utf8");
  await writeFile(
    f.manifestPath,
    JSON.stringify({ tracks: [{ ...f.entry, redistributionAllowed: false }] }),
  );
  await assert.rejects(
    publishAudio({ ...f, apply: true }),
    /қайта тарату рұқсаты/,
  );
  assert.equal(
    await readFile(path.join(f.root, "catalog.json"), "utf8"),
    before,
  );
  const catalog = JSON.parse(before);
  catalog.tracks.push({ ...catalog.tracks[0], id: "second-test" });
  await writeFile(path.join(f.root, "catalog.json"), JSON.stringify(catalog));
  await writeFile(
    path.join(f.root, "fake.mp3"),
    "<html>This is not an audio file</html>",
  );
  await writeFile(
    f.manifestPath,
    JSON.stringify({
      tracks: [
        f.entry,
        { ...f.entry, trackId: "second-test", file: "fake.mp3" },
      ],
    }),
  );
  await assert.rejects(publishAudio({ ...f, apply: true }), /жарамсыз/);
  await assert.rejects(access(path.join(f.root, "assets/audio/licensed")), {
    code: "ENOENT",
  });
  assert.equal(
    JSON.parse(await readFile(path.join(f.root, "catalog.json"), "utf8"))
      .tracks[0].downloadable,
    false,
  );
});
