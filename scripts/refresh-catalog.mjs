import { writeFile, readFile, rename } from "node:fs/promises";
import { artists } from "./artists.mjs";
import { buildCatalog } from "./build-catalog.mjs";
const data = {};
for (const artist of artists) {
  const url = `https://itunes.apple.com/lookup?id=${artist.appleId}&entity=song&country=kz&limit=200`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${artist.name}: HTTP ${response.status}`);
  data[artist.id] = await response.json();
  if (!data[artist.id].results.some((t) => t.kind === "song"))
    throw new Error(
      `${artist.name}: каталог бос, бұрынғы catalog.json сақталды.`,
    );
  console.log(`${artist.name}: деректер алынды`);
}
const catalog = buildCatalog(data);
const catalogPath = new URL("../catalog.json", import.meta.url);
let previous;
try {
  previous = JSON.parse(await readFile(catalogPath, "utf8"));
} catch {}
if (previous?.tracks) {
  const byId = new Map(previous.tracks.map((track) => [track.id, track]));
  for (const track of catalog.tracks) {
    const old = byId.get(track.id);
    if (!old?.audioUrl || !old.license || !old.downloadable) continue;
    for (const key of [
      "audioUrl",
      "downloadable",
      "license",
      "size",
      "mime",
      "version",
      "licenseUrl",
      "sourceUrl",
      "permissionRef",
      "sha256",
    ]) {
      if (Object.hasOwn(old, key)) track[key] = old[key];
    }
  }
  const known = new Set(catalog.tracks.map((track) => track.id));
  for (const track of previous.tracks)
    if (!known.has(track.id) && !track.id.startsWith("apple-"))
      catalog.tracks.push(track);
  const artistIds = new Set(catalog.artists.map((artist) => artist.id));
  for (const artist of previous.artists || [])
    if (
      !artistIds.has(artist.id) &&
      catalog.tracks.some((track) => track.artistId === artist.id)
    )
      catalog.artists.push(artist);
}
await writeFile(
  new URL("../catalog.tmp", import.meta.url),
  JSON.stringify(catalog, null, 2),
);
await rename(new URL("../catalog.tmp", import.meta.url), catalogPath);
console.log(
  `${catalog.tracks.length} ән. Толық аудионы catalog.json ішіндегі audioUrl, license және downloadable өрістеріне бөлек байланыстырыңыз.`,
);
