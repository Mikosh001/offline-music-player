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
test("bundled catalogue has all six requested artists and separates official metadata from original downloadable demos", async () => {
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
  for (const t of catalog.tracks.filter((t) => !t.demo)) {
    assert.equal(t.downloadable, false);
    assert.match(t.officialUrl, /^https:\/\/music.apple.com\//);
  }
  assert.equal(
    catalog.tracks.filter((t) => t.demo && t.downloadable).length,
    2,
  );
});
