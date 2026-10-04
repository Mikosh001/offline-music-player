export const STYLES = [
  { id: "all", name: "Барлығы", caption: "Өз әуеніңді тап" },
  { id: "lyrical", name: "Лирика", caption: "Жүрекке жақын", color: "#db9b86" },
  { id: "indie", name: "Инди", caption: "Еркін әуен", color: "#a7a8ec" },
  { id: "pop", name: "Қазақ поп", caption: "Күннің ырғағы", color: "#a9cfa2" },
  { id: "rnb", name: "R&B / соул", caption: "Жұмсақ ырғақ", color: "#c89ace" },
  { id: "acoustic", name: "Акустика", caption: "Тыныш сәт", color: "#d4b887" },
  {
    id: "dance",
    name: "Ырғақты",
    caption: "Қозғалысқа дайын",
    color: "#8ec9d4",
  },
  {
    id: "electronic",
    name: "Электро",
    caption: "Түнгі толқын",
    color: "#9ba4df",
  },
];
export function normalize(value = "") {
  const table = {
    ә: "a",
    ғ: "g",
    қ: "q",
    ң: "n",
    ө: "o",
    ұ: "u",
    ү: "u",
    һ: "h",
    і: "i",
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "i",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sh",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya",
    ь: "",
    ъ: "",
  };
  return String(value)
    .toLocaleLowerCase()
    .replace(/[а-яәғқңөұүһі]/g, (c) => table[c] ?? c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function formatTime(seconds = 0) {
  return !Number.isFinite(seconds) || seconds < 0
    ? "0:00"
    : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
export function formatBytes(bytes = 0) {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} ГБ`
    : bytes >= 1024 ** 2
      ? `${(bytes / 1024 ** 2).toFixed(1)} МБ`
      : `${Math.ceil(bytes / 1024)} КБ`;
}
export function shuffled(ids, currentId = null, random = Math.random) {
  const bag = [...new Set(ids)].filter((id) => id !== currentId);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return currentId && ids.includes(currentId) ? [currentId, ...bag] : bag;
}
export function safeUrl(value, { relative = false } = {}) {
  if (!value || String(value).startsWith("//")) return "";
  try {
    const url = new URL(value, "https://local.example/");
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (url.origin === "https://local.example")
      return relative && !String(value).startsWith("//") ? value : "";
    return url.href;
  } catch {
    return "";
  }
}
export function validateCatalog(input) {
  if (!input || !Array.isArray(input.tracks) || !Array.isArray(input.artists))
    throw new Error("Каталогта artists және tracks тізімдері болуы керек.");
  if (input.tracks.length > 10000)
    throw new Error("Каталогта 10 000 әннен артық болмауы керек.");
  const artistIds = new Set();
  const artists = input.artists.map((a) => {
    const id = String(a.id || "").slice(0, 100);
    if (!id || !a.name || artistIds.has(id))
      throw new Error("Орындаушы идентификаторлары бірегей болуы керек.");
    artistIds.add(id);
    return {
      id,
      name: String(a.name).slice(0, 150),
      aliases: Array.isArray(a.aliases)
        ? a.aliases.map(String).slice(0, 10)
        : [],
      styles: Array.isArray(a.styles)
        ? a.styles.filter((s) => STYLES.some((x) => x.id === s && s !== "all"))
        : ["pop"],
      color: /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : "#aaa0dc",
      officialUrl: safeUrl(a.officialUrl),
      featured: Boolean(a.featured),
      description: String(a.description || "").slice(0, 250),
    };
  });
  const ids = new Set();
  const tracks = input.tracks.map((t) => {
    const id = String(t.id || "").slice(0, 100);
    if (!id || !t.title || !artistIds.has(String(t.artistId)) || ids.has(id))
      throw new Error(
        "Ән идентификаторы, атауы және орындаушысы дұрыс әрі бірегей болуы керек.",
      );
    ids.add(id);
    const audioUrl = safeUrl(t.audioUrl, { relative: true });
    return {
      id,
      title: String(t.title).slice(0, 200),
      artistId: String(t.artistId),
      artist: String(t.artist || "").slice(0, 180),
      album: String(t.album || "").slice(0, 200),
      duration: Math.max(0, Number(t.duration) || 0),
      releaseDate: String(t.releaseDate || ""),
      styles: Array.isArray(t.styles)
        ? t.styles.filter((s) => STYLES.some((x) => x.id === s && s !== "all"))
        : [],
      officialUrl: safeUrl(t.officialUrl),
      audioUrl,
      artwork: safeUrl(t.artwork),
      downloadable: Boolean(audioUrl && t.downloadable === true && t.license),
      license: String(t.license || "").slice(0, 500),
      size: Math.max(0, Number(t.size) || 0),
      mime: String(t.mime || "audio/mpeg"),
      version: String(t.version || "1"),
      demo: Boolean(t.demo),
      source: String(t.source || "catalog"),
    };
  });
  return {
    version: 2,
    updatedAt: String(input.updatedAt || ""),
    artists,
    tracks,
  };
}
export function mergeTracks(catalogTracks, library) {
  const merged = new Map(catalogTracks.map((t) => [t.id, { ...t }]));
  for (const item of library) {
    const catalog = merged.get(item.id);
    if (!catalog) {
      merged.set(item.id, { ...item });
      continue;
    }
    const personal = {};
    for (const key of [
      "downloaded",
      "favorite",
      "fingerprint",
      "plays",
      "lastPlayed",
      "addedAt",
    ]) {
      if (Object.hasOwn(item, key)) personal[key] = item[key];
    }
    if (item.downloaded)
      for (const key of ["size", "duration", "mime"]) {
        if (Object.hasOwn(item, key)) personal[key] = item[key];
      }
    if (item.audioSourceOverride)
      for (const key of [
        "audioUrl",
        "license",
        "downloadable",
        "mime",
        "audioSourceOverride",
      ]) {
        if (Object.hasOwn(item, key)) personal[key] = item[key];
      }
    merged.set(item.id, { ...catalog, ...personal });
  }
  return [...merged.values()];
}
export function filterTracks(
  tracks,
  { query = "", style = "all", artistId = "all", offlineOnly = false } = {},
  artists = [],
) {
  const terms = normalize(query).split(" ").filter(Boolean);
  const names = new Map(
    artists.map((a) => [a.id, `${a.name} ${(a.aliases || []).join(" ")}`]),
  );
  return tracks.filter(
    (t) =>
      (style === "all" || t.styles?.includes(style)) &&
      (artistId === "all" || t.artistId === artistId) &&
      (!offlineOnly || t.downloaded) &&
      terms.every((term) =>
        normalize(
          `${t.title} ${t.artist} ${t.album} ${names.get(t.artistId) || ""}`,
        ).includes(term),
      ),
  );
}
export function nextQueueIndex(index, length, repeat) {
  if (!length) return -1;
  return index + 1 < length ? index + 1 : repeat === "all" ? 0 : -1;
}
