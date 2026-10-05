import test from "node:test";
import assert from "node:assert/strict";
import {
  shuffled,
  filterTracks,
  validateCatalog,
  safeUrl,
  nextQueueIndex,
  mergeTracks,
} from "../core.js";
test("shuffle plays each unique song once and does not immediately repeat the current song", () => {
  for (let n = 2; n < 40; n++) {
    const ids = Array.from({ length: n }, (_, i) => `song-${i}`),
      result = shuffled(ids, ids[0]);
    assert.equal(result[0], ids[0]);
    assert.notEqual(result[1], ids[0]);
    assert.equal(new Set(result).size, n);
    assert.deepEqual([...result].sort(), ids.sort());
  }
});
test("Kazakh and Latin artist aliases are searchable while offline filters are respected", () => {
  const artists = [
      { id: "e", name: "Ернар Амандық", aliases: ["Ernar Amandyq"] },
    ],
    tracks = [
      {
        id: "one",
        title: "Keipker",
        artist: "Ernar Amandyq",
        artistId: "e",
        styles: ["lyrical"],
        downloaded: true,
      },
      {
        id: "two",
        title: "Keipker live",
        artistId: "e",
        styles: ["lyrical"],
        downloaded: false,
      },
    ];
  assert.equal(
    filterTracks(tracks, { query: "Ернар", offlineOnly: true }, artists).length,
    1,
  );
  assert.equal(
    filterTracks(tracks, { query: "Ernar Keipker" }, artists).length,
    2,
  );
  assert.equal(filterTracks(tracks, { style: "indie" }, artists).length, 0);
});
test("catalog import rejects duplicate IDs and never enables downloads without audio and license", () => {
  const base = {
    artists: [{ id: "artist", name: "Artist" }],
    tracks: [
      {
        id: "song",
        title: "Song",
        artistId: "artist",
        audioUrl: "https://example.com/audio.mp3",
        downloadable: true,
      },
    ],
  };
  assert.equal(validateCatalog(base).tracks[0].downloadable, false);
  assert.throws(() =>
    validateCatalog({ ...base, tracks: [...base.tracks, ...base.tracks] }),
  );
  assert.equal(
    validateCatalog({
      ...base,
      tracks: [{ ...base.tracks[0], license: "CC0" }],
    }).tracks[0].downloadable,
    true,
  );
});
test("unsafe catalogue URLs cannot become executable links or download sources", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "http://example.com/a",
    "https://user:pass@example.com/a",
    "//evil.example/a",
  ])
    assert.equal(safeUrl(url, { relative: true }), "");
  assert.equal(
    safeUrl("assets/audio/a.wav", { relative: true }),
    "assets/audio/a.wav",
  );
});
test("deleting preceding songs preserves playback identity, and repeat off ends the queue", () => {
  const tracks = mergeTracks(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    [{ id: "b", downloaded: true }],
  );
  const current = "b";
  const remaining = tracks.filter((t) => t.id !== "a");
  assert.equal(remaining.find((t) => t.id === current).downloaded, true);
  assert.equal(nextQueueIndex(1, 2, "off"), -1);
  assert.equal(nextQueueIndex(1, 2, "all"), 0);
});
