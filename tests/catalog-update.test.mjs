import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mergeTracks, validateCatalog } from "../core.js";
test("a newly published full audio becomes downloadable for an already favorited song", () => {
  const old = {
    id: "song",
    title: "Song",
    favorite: true,
    downloadable: false,
    audioUrl: "",
  };
  const published = {
    id: "song",
    title: "Song",
    downloadable: true,
    audioUrl: "https://example.com/full.mp3",
    license: "CC0",
  };
  const [result] = mergeTracks([published], [old]);
  assert.equal(result.favorite, true);
  assert.equal(result.downloadable, true);
  assert.equal(result.audioUrl, published.audioUrl);
});
test("personal audio bindings and downloaded byte counts survive catalogue updates", () => {
  const published = {
    id: "song",
    title: "Updated title",
    duration: 200,
    audioUrl: "https://example.com/new.mp3",
    size: 99,
  };
  const personal = {
    id: "song",
    downloaded: true,
    favorite: true,
    duration: 201,
    size: 123,
    plays: 3,
    audioSourceOverride: true,
    audioUrl: "https://example.com/personal.mp3",
    downloadable: true,
    license: "Permission",
  };
  const [result] = mergeTracks([published], [personal]);
  assert.equal(result.title, "Updated title");
  assert.equal(result.size, 123);
  assert.equal(result.duration, 201);
  assert.equal(result.plays, 3);
  assert.equal(result.audioUrl, personal.audioUrl);
});
test("bundled catalogue connects 203 owner-supplied recordings to declarations and keeps four missing recordings pending", async () => {
  const catalog = validateCatalog(
    JSON.parse(
      await readFile(new URL("../catalog.json", import.meta.url), "utf8"),
    ),
  );
  for (const id of [
    "ernar",
    "moldanazar",
    "sadraddin",
    "miras",
    "turar",
    "duman",
  ])
    assert.ok(catalog.tracks.filter((t) => t.artistId === id).length >= 10, id);
  const songs = catalog.tracks.filter((t) => !t.demo);
  const hosted = songs.filter((t) => t.downloadable);
  assert.equal(hosted.length, 203);
  assert.equal(new Set(hosted.map((t) => t.audioUrl)).size, 202);
  for (const t of songs) {
    assert.match(t.officialUrl, /^https:\/\/music.apple.com\//);
  }
  for (const t of hosted) {
    assert.match(
      t.audioUrl,
      /^assets\/audio\/licensed\/apple-\d+-[a-f0-9]{16}\.mp3$/,
    );
    assert.match(t.permissionRef, /^SAZ-20261005-001-F\d{3}$/);
    assert.match(t.license, /жинақтаушының мәлімдемесі/);
    assert.match(t.sha256, /^[a-f0-9]{64}$/);
    assert.ok(t.size > 0 && t.duration > 0);
  }
  assert.deepEqual(
    songs
      .filter((t) => !t.downloadable)
      .map((t) => t.id)
      .sort(),
    [
      "apple-1541309376",
      "apple-1548678265",
      "apple-1634913631",
      "apple-1880744346",
    ],
  );
  assert.equal(
    catalog.tracks.filter((t) => t.demo && t.downloadable).length,
    2,
  );
  assert.equal(
    catalog.artists.filter((a) => !a.id.startsWith("saz-")).length,
    6,
  );
  assert.equal(catalog.tracks.filter((t) => !t.demo).length, 207);
});
