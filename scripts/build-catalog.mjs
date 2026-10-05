import { writeFile, readFile } from "node:fs/promises";
import { artists } from "./artists.mjs";
export function buildCatalog(
  datasets,
  date = new Date().toISOString().slice(0, 10),
) {
  const tracks = [],
    ids = new Set();
  for (const artist of artists) {
    const rows = (datasets[artist.id]?.results || []).filter(
      (t) => t.kind === "song" && t.artistId === artist.appleId,
    );
    const titles = new Set();
    for (const t of rows) {
      const title = t.trackName.toLowerCase();
      if (
        titles.has(title) ||
        ids.has(t.trackId) ||
        String(t.releaseDate || "").slice(0, 10) > date
      )
        continue;
      if (!artist.featured && titles.size >= 10) continue;
      titles.add(title);
      ids.add(t.trackId);
      tracks.push({
        id: `apple-${t.trackId}`,
        title: t.trackName,
        artistId: artist.id,
        artist: t.artistName,
        album: t.collectionName,
        duration: Math.round((t.trackTimeMillis || 0) / 1000),
        releaseDate: t.releaseDate?.slice(0, 10) || "",
        styles: artist.styles,
        officialUrl: t.trackViewUrl.replace(/&uo=4/g, ""),
        artwork: "",
        audioUrl: "",
        downloadable: false,
        source: "Apple Music catalog",
        version: "1",
      });
    }
  }
  // Alternate artists on the discovery page while preserving each artist's catalogue order.
  const ordered = [];
  for (let round = 0; round < 200; round++)
    for (const a of artists) {
      const t = tracks.filter((t) => t.artistId === a.id)[round];
      if (t) ordered.push(t);
    }
  const demoArtist = {
    id: "saz-demo",
    name: "SAZ Studio",
    aliases: [],
    styles: ["electronic", "acoustic"],
    color: "#8ec9d4",
    description: "Офлайн жүйесін сынауға арналған түпнұсқа аспаптық демолар.",
  };
  const demoTracks = [
    ["saz-wave", "Өз ырғағың", "qazaq-wave.wav", ["electronic", "pop"]],
    ["saz-evening", "Тыныш кеш", "quiet-evening.wav", ["acoustic", "indie"]],
  ].map(([id, title, file, styles]) => ({
    id,
    title,
    artistId: "saz-demo",
    artist: "SAZ Studio",
    album: "SAZ · Offline sessions",
    duration: 24,
    styles,
    audioUrl: `assets/audio/${file}`,
    mime: "audio/wav",
    downloadable: true,
    license: "CC0-1.0 — SAZ үшін жасалған түпнұсқа синтезделген аспаптық аудио",
    demo: true,
    source: "SAZ original demo",
    version: "1",
  }));
  return {
    version: 2,
    updatedAt: date,
    description:
      "Ән метадеректері ресми Apple Music каталогынан жиналған. Стильдер — редакциялық көңіл күй жинақтары. Коммерциялық аудио бұл файлға енгізілмеген.",
    artists: [
      ...artists.map(({ appleId, ...a }) => ({
        ...a,
        officialUrl: `https://music.apple.com/kz/artist/${appleId}`,
      })),
      demoArtist,
    ],
    tracks: [...ordered, ...demoTracks],
  };
}
if (process.argv[2] === "local") {
  const research = new URL("../../research/", import.meta.url);
  const datasets = {};
  for (const a of artists) {
    const file =
      a.id === "turar"
        ? "turar-new"
        : a.id === "duman"
          ? "duman-verified"
          : a.id;
    datasets[a.id] = JSON.parse(
      await readFile(new URL(`${file}.json`, research), "utf8"),
    );
  }
  const catalog = buildCatalog(datasets, "2026-10-05");
  await writeFile(
    new URL("../catalog.json", import.meta.url),
    JSON.stringify(catalog, null, 2),
  );
  console.log(
    JSON.stringify({
      tracks: catalog.tracks.length,
      counts: artists.map((a) => ({
        artist: a.name,
        count: catalog.tracks.filter((t) => t.artistId === a.id).length,
      })),
    }),
  );
}
