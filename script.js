import * as DB from "./db.js";
import {
  STYLES,
  normalize,
  escapeHtml as esc,
  formatTime,
  formatBytes,
  shuffled,
  safeUrl,
  validateCatalog,
  mergeCatalogs,
  mergeTracks,
  filterTracks,
  hasFullAudio,
  nextQueueIndex,
} from "./core.js";
import { icon, hydrateIcons } from "./icons.js";

const $ = (id) => document.getElementById(id);
const audio = $("audio"),
  dialog = $("dialog");
const collections = [
  {
    id: "heart",
    name: "Жүрекке жақын",
    art: "Жүрекке\nжақын.",
    caption: "Лирика · сезім · сағыныш",
    color: "#d7a58f",
    styles: ["lyrical"],
    artists: ["ernar", "miras", "duman", "kazybek"],
  },
  {
    id: "night",
    name: "Түнгі қала",
    art: "Түнгі\nқала.",
    caption: "Инди · электро · еркіндік",
    color: "#a8a7dd",
    styles: ["indie", "electronic"],
    artists: ["moldanazar", "darkhan"],
  },
  {
    id: "road",
    name: "Жол үстінде",
    art: "Жол\nүстінде.",
    caption: "Поп · жақсы көңіл күй",
    color: "#b3cbb0",
    styles: ["pop", "dance"],
    artists: ["sadraddin", "turar", "kalifarniya"],
  },
  {
    id: "wave",
    name: "Жайлы кеш",
    art: "Жайлы\nкеш.",
    caption: "Акустика · тыныш әуен",
    color: "#c5a3ce",
    styles: ["acoustic", "indie"],
    artists: ["ernar", "moldanazar"],
  },
  {
    id: "demo",
    name: "Офлайнды сынау",
    art: "Өз\nырғағың.",
    caption: "Түпнұсқа аспаптық демо",
    color: "#8ec9d4",
    styles: ["electronic"],
    artists: ["saz-demo"],
  },
];
const state = {
  catalog: { artists: [], tracks: [] },
  publishedCatalog: { artists: [], tracks: [] },
  initialized: false,
  library: [],
  tracks: [],
  playlists: [],
  settings: {},
  query: "",
  style: "all",
  artistId: "all",
  sort: "curated",
  availability: "all",
  limit: 50,
  currentId: null,
  queue: [],
  queueOrder: [],
  history: [],
  shuffle: false,
  repeat: "off",
  online: navigator.onLine,
  dbReady: false,
  offlineReady: false,
  downloads: new Map(),
  pending: [],
  busy: false,
  controller: null,
  bindId: null,
  sleepUntil: 0,
  registration: null,
};
let currentUrl = null,
  playToken = 0,
  toastTimer,
  searchTimer,
  saveTimer,
  visibleTracks = [],
  dropDepth = 0;
const getTrack = (id) => state.tracks.find((t) => t.id === id);
const artistOf = (t) => state.catalog.artists.find((a) => a.id === t?.artistId);
const canPlay = (t) =>
  Boolean(t && (t.downloaded || (state.online && hasFullAudio(t))));
const route = () => decodeURIComponent(location.hash.slice(1) || "home");
const cover = (t) =>
  `<span class="cover-art" style="--art-color:${artistOf(t)?.color || "#8c7daa"}"><b>${esc((t?.title || "S").slice(0, 1))}</b>${t?.artwork && state.online ? `<img src="${esc(t.artwork)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>`;
const artistPortrait = (a) =>
  `<span class="artist-portrait" style="--artist-color:${a.color}"><b>${esc(
    a.name
      .split(" ")
      .map((x) => x[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
  )}</b></span>`;

function toast(message, error = false) {
  $("toast").textContent = message;
  $("toast").classList.toggle("error", error);
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 5200);
}
function errorMessage(error) {
  return error?.name === "QuotaExceededError"
    ? "Сақтау орны жетпейді. Жүктелген әндердің бір бөлігін өшіріп көр."
    : error?.message || "Әрекет орындалмады. Қайта байқап көр.";
}
async function setting(key, value) {
  state.settings[key] = value;
  if (state.dbReady) await DB.put("settings", { key, value });
}
function requireDB() {
  if (!state.dbReady)
    throw new Error(
      "Құрылғыда сақтау қолжетімсіз. Браузердің әдеттегі режимін ашып көр.",
    );
}
let catalogSync;
async function syncPublishedCatalog() {
  if (!catalogSync)
    catalogSync = (async () => {
      const response = await fetch("./catalog.json", { cache: "reload" });
      if (!response.ok)
        throw new Error("Сайт каталогы жүктелмеді. Қайта байқап көр.");
      const published = validateCatalog(await response.json());
      const merged = mergeCatalogs(published, state.settings.customCatalog);
      await setting("cachedCatalog", published);
      state.publishedCatalog = published;
      state.catalog = merged;
    })().finally(() => {
      catalogSync = null;
    });
  return catalogSync;
}
async function refresh() {
  if (state.dbReady) {
    [state.library, state.playlists] = await Promise.all([
      DB.getAll("library"),
      DB.getAll("playlists"),
    ]);
  }
  state.tracks = mergeTracks(state.catalog.tracks, state.library);
  render();
  updatePlayer();
}
function showDialog(title, body) {
  dialog.classList.remove("now-playing-dialog");
  delete dialog.dataset.view;
  $("dialogTitle").textContent = title;
  $("dialogBody").innerHTML = body;
  if (!dialog.open) dialog.showModal();
}
function closeDialog() {
  dialog.close();
  dialog.classList.remove("now-playing-dialog");
  delete dialog.dataset.view;
  $("dialogBody").innerHTML = "";
}
function heading(title, subtitle = "", actions = "") {
  return `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;
}
function empty(title, copy, action = "") {
  return `<div class="empty-state">${icon("music")}<h2>${esc(title)}</h2><p>${esc(copy)}</p>${action}</div>`;
}
function button(action, label, extra = "", secondary = false) {
  return `<button class="button${secondary ? " subtle" : ""}" data-action="${action}" ${extra}>${label}</button>`;
}
function sectionHeading(title, subtitle, href = "") {
  return `<div class="section-heading"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>${href ? `<a class="text-link" href="${href}">Барлығын көру ${icon("arrow")}</a>` : ""}</div>`;
}
function collectionCards(items) {
  return `<div class="collection-grid">${items.map((c, i) => `<button class="collection-card" data-action="collection" data-id="${c.id}"><div class="collection-art" style="--collection-color:${c.color}"><span class="collection-number">SAZ / 0${i + 1}</span><b>${esc(c.art).replace(/\n/g, "<br>")}</b></div><h3>${esc(c.name)}</h3><p>${esc(c.caption)}</p></button>`).join("")}</div>`;
}
function artistCards(items) {
  return `<div class="artist-grid">${items.map((a) => `<button class="artist-card" data-action="artist" data-id="${esc(a.id)}">${artistPortrait(a)}<h3>${esc(a.name)}</h3><p>${state.tracks.filter((t) => t.artistId === a.id).length} ән · ${esc(STYLES.find((s) => s.id === a.styles[0])?.name || "Музыка")}</p></button>`).join("")}</div>`;
}
function filters() {
  return `<div class="filters">${STYLES.map((s) => `<button class="filter-chip${state.style === s.id ? " active" : ""}" data-action="style" data-id="${s.id}" aria-pressed="${state.style === s.id}">${s.name}</button>`).join("")}<select id="availabilityFilter" class="filter-select" aria-label="Аудио қолжетімділігі"><option value="all"${state.availability === "all" ? " selected" : ""}>Бүкіл каталог</option><option value="full"${state.availability === "full" ? " selected" : ""}>Толық аудио бар</option><option value="offline"${state.availability === "offline" ? " selected" : ""}>Офлайн дайын</option><option value="pending"${state.availability === "pending" ? " selected" : ""}>Аудио күтілуде</option></select><select id="artistFilter" class="filter-select" aria-label="Орындаушы бойынша сүзу"><option value="all">Барлық орындаушы</option>${state.catalog.artists
    .filter((a) => !a.id.startsWith("saz-"))
    .map(
      (a) =>
        `<option value="${esc(a.id)}"${state.artistId === a.id ? " selected" : ""}>${esc(a.name)}</option>`,
    )
    .join(
      "",
    )}<option value="local"${state.artistId === "local" ? " selected" : ""}>Менің файлдарым</option></select><select id="sortFilter" class="filter-select" aria-label="Әндерді сұрыптау"><option value="curated"${state.sort === "curated" ? " selected" : ""}>Іріктелген ретпен</option><option value="title"${state.sort === "title" ? " selected" : ""}>Атауы бойынша</option><option value="recent"${state.sort === "recent" ? " selected" : ""}>Жаңалары алдымен</option><option value="plays"${state.sort === "plays" ? " selected" : ""}>Көп тыңдалған</option></select></div>`;
}
function sorted(tracks) {
  const out = [...tracks];
  if (state.sort === "title")
    out.sort((a, b) => a.title.localeCompare(b.title, "kk"));
  if (state.sort === "recent")
    out.sort((a, b) =>
      String(b.releaseDate || b.addedAt || "").localeCompare(
        String(a.releaseDate || a.addedAt || ""),
      ),
    );
  if (state.sort === "plays")
    out.sort((a, b) => (b.plays || 0) - (a.plays || 0));
  return out;
}
function trackList(tracks, { limit = state.limit, allowMore = true } = {}) {
  visibleTracks = tracks;
  if (!tracks.length)
    return empty(
      state.availability === "full"
        ? "Толық аудио әлі қосылмаған"
        : "Бұл таңдауда ән жоқ",
      state.availability === "full"
        ? "Әннің толық файлы сайтқа қосылғанда осында көрінеді. Бүкіл каталогтан әнді таңдап, плейлистіңе қоса аласың."
        : "Іздеуді немесе қолжетімділік сүзгісін өзгертіп көр.",
      button("import", `${icon("plus")} Файл қосу`),
    );
  return `<div class="track-head"><span>#</span><span>Ән атауы</span><span class="track-artist">Орындаушы</span><span class="track-style">Стиль</span><span>Уақыт</span><span></span></div><div class="track-list">${tracks
    .slice(0, limit)
    .map((t, i) => {
      const progress = state.downloads.get(t.id),
        pending =
          progress && ["queued", "loading", "saving"].includes(progress.status);
      return `<div class="track-row${t.id === state.currentId ? " current" : ""}" data-track-id="${esc(t.id)}"><div class="track-number"><span>${String(i + 1).padStart(2, "0")}</span><button data-action="track-play" data-id="${esc(t.id)}" aria-label="${esc(t.title)} тыңдау">${icon(t.id === state.currentId && !audio.paused ? "pause" : "play")}</button></div><div class="track-main">${cover(t)}<div class="track-copy"><button class="track-title" data-action="track-play" data-id="${esc(t.id)}">${esc(t.title)}</button><p class="track-subtitle">${esc(t.artist)}${t.downloaded ? ' · <span class="offline-text">Офлайн дайын</span>' : t.demo ? " · Аспаптық демо" : hasFullAudio(t) ? ' · <span class="online-audio-text">Толық аудио бар</span>' : ' · <span class="pending-audio-text">Аудио күтілуде</span>'}</p></div></div><span class="track-artist">${esc(t.artist)}</span><span class="track-style style-label">${esc(STYLES.find((s) => s.id === t.styles?.[0])?.name || "Музыка")}</span><span class="track-time">${formatTime(t.duration)}</span><div class="track-actions"><button class="icon-button${t.favorite ? " active" : ""}" data-action="favorite" data-id="${esc(t.id)}" aria-label="${esc(t.title)}: ${t.favorite ? "ұнағандардан алып тастау" : "ұнағандарға қосу"}" aria-pressed="${Boolean(t.favorite)}">${icon("heart")}</button>${pending ? `<button class="icon-button" data-action="cancel-download" data-id="${esc(t.id)}" aria-label="Жүктеуді тоқтату"${progress.status === "saving" ? " disabled" : ""}><span class="row-progress">${progress.progress || 0}%</span></button>` : `<button class="icon-button${t.downloaded ? " ready-icon" : ""}" data-action="${t.downloaded ? "track-menu" : t.downloadable ? "download" : "bind"}" data-id="${esc(t.id)}" aria-label="${t.downloaded ? "Офлайн дайын" : t.downloadable ? "Офлайнға сақтау" : "Осы әннің аудиосын байланыстыру"}">${icon(t.downloaded ? "check" : t.downloadable ? "download" : "folder")}</button>`}<button class="icon-button" data-action="track-menu" data-id="${esc(t.id)}" aria-label="${esc(t.title)}: қосымша әрекеттер">${icon("more")}</button></div></div>`;
    })
    .join(
      "",
    )}</div>${allowMore && tracks.length > limit ? `<button class="load-more" data-action="more-tracks">Тағы ${Math.min(50, tracks.length - limit)} ән көрсету</button>` : ""}`;
}
function availabilitySummary() {
  const tracks = state.tracks.filter(
    (t) => !t.demo && state.catalog.artists.some((a) => a.id === t.artistId),
  );
  return `<section class="availability-strip" aria-label="Музыка қолжетімділігі"><div><b>${tracks.length} ән тізімі</b><span>${tracks.filter(hasFullAudio).length} толық аудио · ${tracks.filter((t) => t.downloaded).length} офлайн дайын</span></div><button class="text-link" data-action="available-catalog">Толық аудионы көрсету ${icon("arrow")}</button></section>`;
}
function offlineExplanation() {
  return `<div class="offline-explainer"><span>${icon("cloud-off")}</span><div><h3>Жеке әндерің. Интернетсіз тыңда.</h3><p>Сақталған әндер осы браузерде ойнатылады. Өз файлыңды немесе .saz жинағын қосқанда аудио сайт серверіне жіберілмейді. Интернетсіз тыңдау үшін әндерді алдын ала сақтап, сайтты бір рет ашып қой.</p></div></div>`;
}
function home() {
  const featured = state.catalog.artists.filter((a) => a.featured);
  const tracks = state.tracks.filter((t) => !t.demo).slice(0, 8);
  return `<div class="welcome"><div><h1>Қош келдің, тыңдарман.</h1><p>Бүгінгі көңіл күйіңе сай әуен табайық.</p></div><span class="small-pill">${icon("music")} ҚАЗАҚ МУЗЫКАСЫ</span></div><section class="hero"><div class="hero-copy"><span class="eyebrow">БІР ӘЛЕМ. МЫҢ ӘУЕН.</span><h2>Сенің әуенің.<br>Қай жерде<br>болсаң да.</h2><p>Өзің сүйетін әндерді бір жерге жина.<br>Интернетсіз де өз ырғағыңмен бол.</p><div class="hero-actions"><button class="button" data-action="shuffle-play" data-scope="all">${icon("shuffle")} Араластырып тыңдау</button><a href="#catalog" class="button secondary">${icon("discover")} Музыка іздеу</a></div></div><div class="hero-art" aria-hidden="true"><div class="hero-art-word">QAZAQ<br>WAVE<small>ӨЗ ЫРҒАҒЫҢМЕН</small></div><div class="hero-stars"><span>✦</span><span>✧</span></div></div></section>${availabilitySummary()}${sectionHeading("Көңіл күйіңді таңда", "Саған арнайы іріктелген әуендер")} ${collectionCards(collections.slice(0, 4))}${sectionHeading("Өзің сүйетін орындаушылар", "Таныс дауыстар. Жаңа әуендер.", "#artists")}${artistCards(featured)}${sectionHeading("Тыңдауға тұрарлық", "Ресми каталогтан таңдалған әндер", "#catalog")}${trackList(tracks, { limit: 8, allowMore: false })}`;
}
function renderDownloads() {
  const tracks = sorted(
    filterTracks(
      state.tracks.filter((t) => t.downloaded),
      {
        query: state.query,
        style: state.style,
        artistId: state.artistId,
        availability: state.availability,
      },
      state.catalog.artists,
    ),
  );
  const active = [...state.downloads.entries()].filter(
    ([, d]) => d.status !== "done" && d.status !== "cancelled",
  );
  return (
    heading(
      "Жүктелгендер",
      `${state.tracks.filter((t) => t.downloaded).length} ән · сайттың осы браузердегі сақтау орнында`,
      button("import", `${icon("plus")} Файл қосу`),
    ) +
    offlineExplanation() +
    `${active.length ? `<div id="downloadJobs">${active.map(([id, d]) => `<div class="download-row"><div><b>${esc(getTrack(id)?.title || id)}</b><small>${d.status === "error" ? esc(d.error) : d.status === "queued" ? "Кезекте" : d.status === "saving" ? "Сақталуда" : `${d.progress || 0}% · ${formatBytes(d.bytes || 0)}`}</small><div class="progress-bar"><span style="width:${d.progress || 0}%"></span></div></div>${d.status === "error" ? `<button class="icon-button" data-action="download" data-id="${esc(id)}" aria-label="Қайта жүктеу">${icon("repeat")}</button>` : `<button class="icon-button" data-action="cancel-download" data-id="${esc(id)}" aria-label="Жүктеуді тоқтату"${d.status === "saving" ? " disabled" : ""}>${icon("close")}</button>`}</div>`).join("")}</div>` : ""}` +
    (!tracks.length
      ? empty(
          "Музыкаңды өзіңмен алып жүр",
          "Файлдан ән қос немесе аспаптық демоны жүктеп, офлайн тыңдауды сынап көр.",
          `<a href="#collection/demo" class="button">${icon("download")} Жүктеуді сынау</a>`,
        )
      : filters() + trackList(tracks))
  );
}
function renderSettings() {
  const downloaded = state.tracks.filter((t) => t.downloaded),
    bytes = downloaded.reduce((n, t) => n + (t.size || 0), 0);
  return (
    heading("Баптаулар", "Өз әуенің. Өз құрылғың. Өз қалауың.") +
    `<div class="settings-grid"><section class="settings-card"><h3>Сайттың офлайн сақтау орны</h3><div class="stat-value">${formatBytes(bytes)}</div><p>${downloaded.length} ән офлайн тыңдауға дайын. Көшірмелер осы браузерде сақталады. Өз файлыңнан қосылған аудио сайт серверіне жіберілмейді.</p><div class="storage-line"><span id="storageBar" style="width:0"></span></div><div id="storageDetails" class="storage-details">Сақтау орны тексерілуде…</div>${button("persist", `${icon("shield")} Сақтауды қорғау`, "", true)}<p id="persistStatus" class="setting-hint"></p></section><section class="settings-card"><h3>Ойнату</h3><div class="settings-row"><label for="sleepSelect">Ұйқы таймері</label><select id="sleepSelect"><option value="0">Өшіру</option><option value="15">15 минут</option><option value="30">30 минут</option><option value="60">60 минут</option></select></div><div class="settings-row"><label for="offlineOnly">Тек офлайн әндерді көрсету</label><input id="offlineOnly" type="checkbox"${state.settings.offlineOnly ? " checked" : ""}></div><p class="setting-hint">Соңғы ән, тоқтаған секунд, дыбыс деңгейі және ойнату режимі сақталады.</p>${button("queue", `${icon("queue")} Ойнату кезегі`, "", true)}</section><section class="settings-card"><h3>Сақтық көшірме</h3><p>Ән файлдарын, ұнағандарды және жеке плейлисттерді бірге сақтап ал.</p>${button("backup-export", `${icon("download")} Көшірмені сақтау`)}${button("backup-import", `${icon("folder")} Қалпына келтіру`, "", true)}<p class="setting-hint">.saz файлы тек өзің таңдаған жерге сақталады.</p></section><section class="settings-card"><h3>Каталогты басқару</h3><p>Әннің мәзірінен аудиофайлды немесе жүктеу сілтемесін байланыстыр. Өзгертілген каталогты JSON түрінде сақта.</p>${button("catalog-sync", "Сайт каталогын жаңарту", "", true)}${button("catalog-export", "Каталогты сақтау")}${button("catalog-import", "Каталогты ашу", "", true)}<p class="setting-hint">Өзгерістер осы құрылғыда сақталады. Бәріне жариялау үшін экспортталған файлды сайттағы catalog.json орнына қой.</p></section><section class="settings-card"><h3>Қолданбаны орнату</h3><p>Телефонның негізгі экранынан SAZ-ды ашып, музыкаңа жылдам орал.</p>${button("install", "Орнату нұсқаулығы", "", true)}<p class="setting-hint" id="offlineReadyText">${state.offlineReady ? "Қолданба интернетсіз ашылуға дайын." : "Қолданбаның офлайн дайындығы тексерілуде."}</p></section><section class="settings-card"><h3>Сайт саясаты</h3><p>Жеке офлайн тыңдау, музыка құқықтары, құпиялық және теңдік қағидалары.</p><p><a class="text-link" href="legal/site-policy.html" target="_blank" rel="noopener">Толық саясат құжаты ${icon("external")}</a></p><p><a class="text-link" href="legal/site-policy.pdf" download>Құжатты PDF түрінде сақтау ${icon("download")}</a></p><p class="setting-hint">SAZ-POL-2026-001 · 1.0 нұсқа · 05.10.2026. SAZ ішкі мөрі мемлекеттік мөр немесе музыкалық лицензия емес.</p></section><section class="settings-card"><h3>Каталог туралы</h3><p>${state.catalog.artists.filter((a) => !a.id.startsWith("saz-")).length} орындаушы · ${state.catalog.tracks.filter((t) => !t.demo).length} ән. Атаулар мен сілтемелер ресми каталогтан жиналған.</p><p>Стильдер мен жинақтар — тыңдау көңіл күйіне сай редакциялық іріктеу. Сайттағы толық әндерді «Офлайнға сақтау» арқылы интернетсіз тыңдауға дайында.</p><p><a class="text-link" href="permissions/music-sources-and-permissions.html" target="_blank" rel="noopener">Музыка дереккөздері мен рұқсаттар ${icon("external")}</a></p><a class="text-link" href="#collection/demo">Аспаптық демоны тыңдау ${icon("arrow")}</a></section></div>`
  );
}
function render() {
  visibleTracks = [];
  const view = route(),
    base = view.split("/")[0];
  document
    .querySelectorAll("[data-view]")
    .forEach((el) =>
      el.classList.toggle(
        "active",
        el.dataset.view === base ||
          (base === "artist" && el.dataset.view === "artists"),
      ),
    );
  $("favCount").textContent = state.tracks.filter((t) => t.favorite).length;
  $("downloadCount").textContent = state.tracks.filter(
    (t) => t.downloaded,
  ).length;
  $("playlistNav").innerHTML = state.playlists.length
    ? state.playlists
        .map(
          (p) =>
            `<a href="#playlist/${encodeURIComponent(p.id)}"${view === `playlist/${p.id}` ? ' class="active"' : ""}>${icon("music")}<span>${esc(p.name)}</span></a>`,
        )
        .join("")
    : `<a href="#playlists">${icon("plus")} Бірінші плейлистің</a>`;
  let html = "";
  if (base === "home") html = home();
  else if (base === "catalog") {
    const tracks = sorted(
      filterTracks(
        state.tracks.filter((track) => !track.demo),
        {
          query: state.query,
          style: state.style,
          artistId: state.artistId,
          offlineOnly: Boolean(state.settings.offlineOnly),
          availability: state.availability,
        },
        state.catalog.artists,
      ),
    );
    html =
      heading(
        state.query ? `«${state.query}» іздеу нәтижесі` : "Музыка іздеу",
        `${tracks.length} ән · көңіл күйіңе сай әуен таңда`,
        button("shuffle-play", `${icon("shuffle")} Араластырып тыңдау`),
      ) +
      availabilitySummary() +
      filters() +
      trackList(tracks);
  } else if (base === "artists")
    html =
      heading(
        "Орындаушылар",
        "Таныс дауыстар және саған ұнауы мүмкін жаңа есімдер",
      ) +
      artistCards(
        state.catalog.artists.filter((a) => !a.id.startsWith("saz-")),
      ) +
      `<div class="notice">${icon("info")} Орындаушыны ашып, ресми әндер каталогын қара. Стильдер тыңдау көңіл күйіне қарай іріктелген.</div>`;
  else if (base === "artist") {
    const a = state.catalog.artists.find((a) => a.id === view.slice(7));
    html = a
      ? `<div class="artist-page-head">${artistPortrait(a)}<div><span class="eyebrow">ОРЫНДАУШЫ</span><h1>${esc(a.name)}</h1><p>${esc(a.description)}</p><p>${state.tracks.filter((t) => t.artistId === a.id).length} ән · ${a.styles
          .map((s) => STYLES.find((x) => x.id === s)?.name)
          .filter(Boolean)
          .join(
            " / ",
          )}</p><div class="artist-actions">${button("play-list", `${icon("play")} Тыңдау`)}${button("shuffle-play", `${icon("shuffle")} Араластыру`, "", true)}${state.tracks.some((t) => t.artistId === a.id && t.downloadable && !t.downloaded && hasFullAudio(t)) ? button("download-list", `${icon("download")} Офлайнға сақтау`, "", true) : ""}</div></div></div>` +
        trackList(state.tracks.filter((t) => t.artistId === a.id))
      : empty("Орындаушы табылмады", "Каталогтан басқа орындаушыны таңда.");
  } else if (base === "collection") {
    const c = collections.find((c) => c.id === view.slice(11));
    const tracks = c
      ? state.tracks.filter((t) => c.artists.includes(t.artistId))
      : [];
    html = c
      ? `<div class="playlist-heading"><span class="eyebrow">SAZ ЖИНАҒЫ</span>${heading(c.name, `${c.caption} · ${tracks.length} ән`, button("play-list", `${icon("play")} Тыңдау`) + button("download-list", `${icon("download")} Қолжетімді аудионы жүктеу`, "", true))}</div>` +
        (c.id === "demo"
          ? `<div class="notice">${icon("info")} Бұл — SAZ үшін жасалған түпнұсқа аспаптық демо. Жүктеп, интернетті өшіріп тыңдауды сынауға болады.</div>`
          : "") +
        trackList(tracks)
      : empty("Жинақ табылмады", "Басты беттен жинақты таңда.");
  } else if (base === "favorites") {
    const tracks = sorted(
      filterTracks(
        state.tracks.filter((t) => t.favorite),
        { query: state.query, style: state.style },
        state.catalog.artists,
      ),
    );
    html =
      heading(
        "Ұнаған әндер",
        `${tracks.length} ән · жүрегіңе жақын әуендер`,
        button("play-list", `${icon("play")} Тыңдау`),
      ) +
      (!tracks.length
        ? empty(
            "Алғашқы сүйікті әніңді таңда",
            "Әннің жанындағы жүрек белгісін бас. Ол осында сақталады.",
            `<a href="#catalog" class="button">Музыка іздеу</a>`,
          )
        : filters() + trackList(tracks));
  } else if (base === "downloads") html = renderDownloads();
  else if (base === "playlists")
    html =
      heading(
        "Менің плейлисттерім",
        "Әр сәтіңе өз жинағың болсын.",
        button("new-playlist", `${icon("plus")} Плейлист жасау`),
      ) +
      (!state.playlists.length
        ? empty(
            "Бірінші плейлистіңді жаса",
            "Жолға, жаттығуға немесе тыныш кешке өз әндеріңді жина.",
            button("new-playlist", "Плейлист жасау"),
          )
        : state.playlists
            .map(
              (p) =>
                `<a class="settings-card" style="display:block;margin-bottom:12px" href="#playlist/${encodeURIComponent(p.id)}"><h3>${esc(p.name)}</h3><p>${p.trackIds.length} ән</p></a>`,
            )
            .join(""));
  else if (base === "playlist") {
    const p = state.playlists.find((p) => p.id === view.slice(9));
    const tracks = p ? p.trackIds.map(getTrack).filter(Boolean) : [];
    html = p
      ? `<div class="playlist-heading"><span class="eyebrow">МЕНІҢ ПЛЕЙЛИСТІМ</span>${heading(p.name, `${tracks.length} ән · ${tracks.filter((t) => t.downloaded).length} офлайн дайын`, button("play-list", `${icon("play")} Тыңдау`) + button("download-list", `${icon("download")} Жүктеу`, "", true) + button("playlist-edit", icon("more"), `data-id="${esc(p.id)}"`, true))}</div>` +
        trackList(tracks)
      : empty(
          "Плейлист табылмады",
          "Жаңа плейлист жасап көр.",
          button("new-playlist", "Плейлист жасау"),
        );
  } else if (base === "settings") html = renderSettings();
  else
    html = empty(
      "Бет табылмады",
      "Басты бетке орал.",
      `<a href="#home" class="button">Басты бет</a>`,
    );
  $("content").innerHTML = html;
  hydrateIcons($("content"));
  if (base === "settings") updateStorage();
}

async function toggleFavorite(id) {
  requireDB();
  const t = getTrack(id);
  if (!t) return;
  await DB.put("library", { ...t, favorite: !t.favorite });
  await refresh();
}
function updatePlayer() {
  const t = getTrack(state.currentId);
  if (
    dialog.dataset.view === "now-playing" &&
    t &&
    $("nowPlayingPanel")?.dataset.trackId !== t.id
  )
    $("dialogBody").innerHTML = nowPlayingBody(t);
  $("playerTitle").textContent = t?.title || "Әуеніңді таңда";
  $("playerArtist").textContent = t?.artist || "Кітапханаң әрқашан өзіңмен";
  $("playerArt").innerHTML = t
    ? cover(t).replace(/^<span[^>]*>|<\/span>$/g, "")
    : icon("music");
  $("playerArt").style.setProperty(
    "--art-color",
    artistOf(t)?.color || "#8c7daa",
  );
  for (const btn of document.querySelectorAll('[data-action="play"]')) {
    btn.innerHTML = icon(audio.paused ? "play" : "pause");
    btn.setAttribute("aria-label", audio.paused ? "Ойнату" : "Кідірту");
  }
  for (const btn of document.querySelectorAll(
    '[data-action="player-favorite"]',
  )) {
    btn.classList.toggle("active", Boolean(t?.favorite));
    btn.setAttribute("aria-pressed", String(Boolean(t?.favorite)));
    btn.setAttribute(
      "aria-label",
      t?.favorite ? "Ұнағандардан алып тастау" : "Ұнағандарға қосу",
    );
  }
  for (const btn of document.querySelectorAll('[data-action="shuffle"]')) {
    btn.classList.toggle("active", state.shuffle);
    btn.setAttribute("aria-pressed", String(state.shuffle));
  }
  for (const btn of document.querySelectorAll('[data-action="repeat"]')) {
    btn.classList.toggle("active", state.repeat !== "off");
    btn.setAttribute(
      "aria-label",
      `Қайталау: ${state.repeat === "one" ? "бір ән" : state.repeat === "all" ? "барлық ән" : "өшіру"}`,
    );
    const one = btn.querySelector("[data-repeat-one]");
    if (one) one.hidden = state.repeat !== "one";
  }
  if ($("nowStatus"))
    $("nowStatus").textContent = t?.downloaded
      ? "Офлайн дайын"
      : "Сайттан ойнатылады";
  updateNowPlayingPosition();
  $("repeatOne").hidden = state.repeat !== "one";
  document.querySelectorAll(".track-row").forEach((row) => {
    const current = row.dataset.trackId === state.currentId;
    row.classList.toggle("current", current);
    const btn = row.querySelector(".track-number button");
    if (btn) btn.innerHTML = icon(current && !audio.paused ? "pause" : "play");
  });
}
function persistPlayback() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    setting("playback", {
      currentId: state.currentId,
      position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      queue: state.queue,
      queueOrder: state.queueOrder,
      shuffle: state.shuffle,
      repeat: state.repeat,
    }).catch(() => {});
  }, 350);
}
function updateMedia(t) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: t.album || "SAZ",
      artwork: [
        {
          src: new URL("icon-512.png", location.href).href,
          sizes: "512x512",
          type: "image/png",
        },
      ],
    });
    configureMediaControls();
  } catch {}
}
function nowPlayingBody(t) {
  return `<div id="nowPlayingPanel" class="now-playing-panel" data-track-id="${esc(t.id)}"><div class="cover-art now-art" style="--art-color:${artistOf(t)?.color || "#8c7daa"}"><b>${esc(t.title.slice(0, 1))}</b></div><div class="now-copy"><h3>${esc(t.title)}</h3><p>${esc(t.artist)}</p><span id="nowStatus" class="now-status">${t.downloaded ? "Офлайн дайын" : "Сайттан ойнатылады"}</span></div><div class="now-progress"><input id="nowSeek" type="range" min="0" max="100" step="0.1" value="0" aria-label="Толық плеер: әннің ойнату орны"><div class="now-times"><span id="nowCurrentTime">0:00</span><span id="nowDuration">${formatTime(t.duration)}</span></div></div><div class="now-controls"><button class="icon-button" data-action="shuffle" aria-label="Араластыру" aria-pressed="${state.shuffle}">${icon("shuffle")}</button><button class="icon-button" data-action="prev" aria-label="Алдыңғы ән">${icon("prev")}</button><button class="play-main now-play" data-action="play" aria-label="Ойнату">${icon("play")}</button><button class="icon-button" data-action="next" aria-label="Келесі ән">${icon("next")}</button><button class="icon-button" data-action="repeat" aria-label="Қайталау: өшіру">${icon("repeat")}<small data-repeat-one hidden>1</small></button></div><div class="now-actions"><button class="icon-button" data-action="player-favorite" aria-label="Ұнағандарға қосу">${icon("heart")}</button>${button("queue", `${icon("queue")} Кезек`, "", true)}${button("sleep", `${icon("moon")} Таймер`, "", true)}</div></div>`;
}
function updateNowPlayingPosition() {
  if (!$("nowSeek")) return;
  $("nowCurrentTime").textContent = formatTime(audio.currentTime);
  $("nowDuration").textContent = formatTime(
    Number.isFinite(audio.duration)
      ? audio.duration
      : getTrack(state.currentId)?.duration,
  );
  $("nowSeek").value =
    Number.isFinite(audio.duration) && audio.duration > 0
      ? (audio.currentTime / audio.duration) * 100
      : 0;
}
function playableSelection(all = false) {
  const global =
    all ||
    ["home", "artists", "playlists", "settings"].includes(
      route().split("/")[0],
    );
  return (global ? state.tracks.filter((t) => !t.demo) : visibleTracks).filter(
    canPlay,
  );
}
async function shufflePlay(all = false) {
  const ids = playableSelection(all).map((t) => t.id);
  if (!ids.length)
    return toast(
      state.online
        ? "Бұл таңдауда ойнатылатын ән жоқ."
        : "Алдымен әндерді интернет бар кезде офлайнға сақта.",
    );
  state.queueOrder = ids;
  state.queue = shuffled(ids);
  state.shuffle = true;
  if (state.repeat === "one") state.repeat = "all";
  state.history = [];
  await loadTrack(state.queue[0], { addHistory: false });
}
async function loadTrack(
  id,
  { autoplay = true, position = 0, addHistory = true } = {},
) {
  const t = getTrack(id);
  if (!canPlay(t)) return officialDialog(t);
  const token = ++playToken;
  audio.pause();
  let src = t.audioUrl;
  if (t.downloaded) {
    const record = await DB.get("audio", id);
    if (token !== playToken) return;
    if (!record?.blob) {
      await DB.deleteAudio(t);
      await refresh();
      throw new Error("Сақталған аудио табылмады. Файлды қайта қос.");
    }
    src = URL.createObjectURL(record.blob);
  }
  if (token !== playToken) {
    if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
    return;
  }
  if (addHistory && state.currentId && state.currentId !== id)
    state.history.push(state.currentId);
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = src?.startsWith("blob:") ? src : null;
  state.currentId = id;
  audio.src = src;
  audio.load();
  updateMedia(t);
  updatePlayer();
  const restore = () => {
    if (token !== playToken) return;
    if (position && Number.isFinite(audio.duration))
      audio.currentTime = Math.min(position, Math.max(0, audio.duration - 0.1));
  };
  audio.addEventListener("loadedmetadata", restore, { once: true });
  persistPlayback();
  if (autoplay) {
    try {
      await audio.play();
    } catch (error) {
      if (error.name === "AbortError" && (token !== playToken || audio.paused))
        return;
      throw error;
    }
    if (token === playToken && state.dbReady) {
      await DB.put("library", {
        ...getTrack(id),
        plays: (getTrack(id).plays || 0) + 1,
        lastPlayed: Date.now(),
      });
      state.library = await DB.getAll("library");
      state.tracks = mergeTracks(state.catalog.tracks, state.library);
    }
  }
}
async function playSelected(id) {
  const t = getTrack(id);
  if (!t) return;
  if (id === state.currentId && audio.src) {
    if (audio.paused) await audio.play();
    else audio.pause();
    return;
  }
  if (!canPlay(t)) {
    officialDialog(t);
    return;
  }
  let ids = playableSelection().map((t) => t.id);
  if (!ids.includes(id)) ids = [id];
  state.queueOrder = ids;
  state.queue = state.shuffle ? shuffled(ids, id) : ids;
  await loadTrack(id);
}
async function playPause() {
  if (audio.src && state.currentId) {
    if (audio.paused) await audio.play();
    else audio.pause();
    return;
  }
  const t = playableSelection()[0];
  if (t) await playSelected(t.id);
  else toast("Әннің толық аудиосын қос немесе аспаптық демоны жүкте.");
}
async function next() {
  const valid = state.queue.filter((id) => canPlay(getTrack(id)));
  state.queue = valid;
  const index = nextQueueIndex(
    valid.indexOf(state.currentId),
    valid.length,
    state.repeat,
  );
  if (index < 0) {
    audio.pause();
    persistPlayback();
    return;
  }
  await loadTrack(valid[index]);
}
async function previous() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const id = state.history.pop();
  if (id && canPlay(getTrack(id))) await loadTrack(id, { addHistory: false });
  else {
    const index = state.queue.indexOf(state.currentId);
    if (index > 0)
      await loadTrack(state.queue[index - 1], { addHistory: false });
    else audio.currentTime = 0;
  }
}
function officialDialog(t) {
  if (!t) return toast("Алдымен әнді таңда.");
  showDialog(
    t.title,
    `<div class="official-card">${cover(t)}<div><h3>${esc(t.title)}</h3><p>${esc(t.artist)}</p></div></div><div class="availability-message"><b>${state.online ? "Толық аудио күтілуде" : "Бұл ән офлайн сақталмаған"}</b><p>${state.online ? "Бұл ән әзірге каталогта ғана бар. Толық аудиосы сайтқа қосылғанда осы жерден тыңдап, офлайнға сақтай аласың." : "Әнді интернет бар кезде осы сайтта «Офлайнға сақтау» арқылы дайындау керек. Қазір сақталған әндеріңді таңда."}</p></div><div class="dialog-actions">${button("add-playlist", "Плейлистке қосу", `data-id="${esc(t.id)}"`)}<a href="#downloads" class="button subtle" data-action="show-offline">Офлайн әндерді ашу</a>${button("bind", `${icon("folder")} Өз аудиофайлымды қосу`, `data-id="${esc(t.id)}"`, true)}</div>`,
  );
}

async function probeAudio(blob) {
  if (!blob.size) throw new Error("Аудиофайл бос.");
  const url = URL.createObjectURL(blob),
    probe = new Audio();
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      const duration = probe.duration;
      probe.removeAttribute("src");
      probe.load();
      URL.revokeObjectURL(url);
      error ? reject(error) : resolve(Number.isFinite(duration) ? duration : 0);
    };
    probe.onloadedmetadata = () => finish();
    probe.onerror = () =>
      finish(
        new Error(
          "Браузер бұл аудиофайлды ойната алмады. MP3 немесе M4A нұсқасын қолданып көр.",
        ),
      );
    timer = setTimeout(
      () => finish(new Error("Аудиофайлды тексеру уақыты аяқталды.")),
      15000,
    );
    probe.preload = "metadata";
    probe.src = url;
  });
}
function mimeOf(name, type) {
  if (type?.startsWith("audio/")) return type;
  return (
    {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      aac: "audio/aac",
      wav: "audio/wav",
      ogg: "audio/ogg",
      oga: "audio/ogg",
      flac: "audio/flac",
      opus: "audio/opus",
      weba: "audio/webm",
    }[name.split(".").pop().toLowerCase()] || ""
  );
}
async function importFiles(files, bindId = null) {
  requireDB();
  let added = 0;
  const failed = [];
  for (const file of files) {
    try {
      const mime = mimeOf(file.name, file.type);
      if (!mime) throw new Error("Аудиофайл форматы танылмады.");
      if (file.size > 150 * 1024 ** 2)
        throw new Error("Бір файл 150 МБ-тан аспауы керек.");
      toast(`Қосылуда: ${file.name}`);
      const hash = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
      ]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      const duplicate = state.tracks.find(
        (t) => t.fingerprint === hash && t.downloaded,
      );
      if (duplicate) {
        toast(`Бұл файл бұрын қосылған: ${duplicate.title}`);
        continue;
      }
      const blob = new Blob([file], { type: mime }),
        duration = await probeAudio(blob);
      const existing = bindId ? getTrack(bindId) : null;
      const name = file.name.replace(/\.[^.]+$/, "");
      const parts = name.split(/\s[-–—]\s/);
      const record = {
        ...(existing || {}),
        id: existing?.id || `local-${hash}`,
        title:
          existing?.title ||
          (parts.length > 1 ? parts.slice(1).join(" - ") : name),
        artist:
          existing?.artist || (parts.length > 1 ? parts[0] : "Менің музыкам"),
        artistId: existing?.artistId || "local",
        styles: existing?.styles || ["pop"],
        source: existing ? "catalog" : "local",
        duration,
        size: file.size,
        fingerprint: hash,
        mime,
        downloaded: true,
        addedAt: Date.now(),
      };
      await DB.saveAudio(record, blob);
      added++;
      await refresh();
    } catch (error) {
      failed.push(`${file.name}: ${errorMessage(error)}`);
    }
  }
  if (failed.length) toast(`${added} ән қосылды. ${failed[0]}`, true);
  else if (added)
    toast(`${added} ән құрылғыда сақталды. Офлайн тыңдауға дайын.`);
  if (added && !bindId) location.hash = "downloads";
}
function enqueue(ids) {
  requireDB();
  if (!state.online) throw new Error("Жүктеу үшін интернет қажет.");
  let count = 0;
  for (const id of ids) {
    const t = getTrack(id);
    if (
      !t ||
      t.downloaded ||
      !t.downloadable ||
      !t.audioUrl ||
      state.pending.includes(id) ||
      ["loading", "saving"].includes(state.downloads.get(id)?.status)
    )
      continue;
    state.pending.push(id);
    state.downloads.set(id, { status: "queued", progress: 0, bytes: 0 });
    count++;
  }
  if (!count) {
    toast(
      "Жүктеуге дайын жаңа аудио жоқ. Әннің мәзірінен толық аудионы байланыстыр.",
    );
    return;
  }
  render();
  downloadWorker();
}
async function downloadWorker() {
  if (state.busy) return;
  state.busy = true;
  while (state.pending.length) {
    const id = state.pending.shift(),
      track = getTrack(id);
    if (!track) continue;
    const controller = new AbortController();
    state.controller = { id, controller };
    const status = { status: "loading", progress: 0, bytes: 0 };
    state.downloads.set(id, status);
    render();
    try {
      if (!state.online)
        throw new Error(
          "Интернет байланысы жоқ. Қайта қосылып, жүктеуді қайтала.",
        );
      const response = await fetch(track.audioUrl, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(`Аудио жүктелмеді (${response.status}).`);
      const type =
        response.headers.get("content-type")?.split(";")[0] || track.mime;
      if (type === "text/html" || type === "application/json")
        throw new Error("Сілтемеден аудионың орнына басқа файл келді.");
      const declared = Number(response.headers.get("content-length")) || 0,
        total =
          track.size ||
          (!response.headers.get("content-encoding") ? declared : 0);
      if (total > 150 * 1024 ** 2)
        throw new Error("Аудиофайл 150 МБ-тан үлкен.");
      const quota = await navigator.storage?.estimate?.();
      if (total && quota && quota.quota - quota.usage < total)
        throw new DOMException("Сақтау орны жетпейді.", "QuotaExceededError");
      const reader = response.body?.getReader(),
        chunks = [];
      let bytes = 0,
        lastRender = 0;
      if (reader) {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          chunks.push(part.value);
          bytes += part.value.byteLength;
          if (bytes > 150 * 1024 ** 2) {
            await reader.cancel();
            throw new Error("Аудиофайл 150 МБ-тан үлкен.");
          }
          status.bytes = bytes;
          status.progress = total
            ? Math.min(99, Math.round((bytes / total) * 100))
            : 0;
          if (Date.now() - lastRender > 200) {
            render();
            lastRender = Date.now();
          }
        }
      } else {
        const body = await response.arrayBuffer();
        chunks.push(body);
        bytes = body.byteLength;
      }
      if (total && bytes !== total)
        throw new Error("Файл толық жүктелмеді. Қайта жүктеп көр.");
      const blob = new Blob(chunks, { type });
      const duration = await probeAudio(blob);
      if (controller.signal.aborted)
        throw new DOMException("Жүктеу тоқтатылды.", "AbortError");
      status.status = "saving";
      render();
      await DB.saveAudio({ ...getTrack(id), duration }, blob);
      state.downloads.set(id, {
        status: "done",
        progress: 100,
        bytes: blob.size,
      });
      await refresh();
      toast(`${track.title} — офлайн дайын.`);
    } catch (error) {
      state.downloads.set(
        id,
        error.name === "AbortError"
          ? { status: "cancelled", progress: 0 }
          : { status: "error", progress: 0, error: errorMessage(error) },
      );
      render();
      if (error.name !== "AbortError") toast(errorMessage(error), true);
    }
    state.controller = null;
  }
  state.busy = false;
}
function cancelDownload(id) {
  if (state.downloads.get(id)?.status === "saving") return;
  state.pending = state.pending.filter((x) => x !== id);
  if (state.controller?.id === id) state.controller.controller.abort();
  state.downloads.set(id, { status: "cancelled", progress: 0 });
  render();
}
async function removeAudio(id) {
  const t = getTrack(id);
  if (!t) return;
  if (state.currentId === id) {
    ++playToken;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = null;
    state.currentId = null;
    state.queue = state.queue.filter((x) => x !== id);
    state.queueOrder = state.queueOrder.filter((x) => x !== id);
    persistPlayback();
  }
  await DB.deleteAudio(t);
  await refresh();
  closeDialog();
  toast("Осы браузердегі офлайн көшірме өшірілді.");
}

function trackMenu(id) {
  const t = getTrack(id);
  if (!t) return;
  const playlistId = route().startsWith("playlist/") ? route().slice(9) : null;
  showDialog(
    t.title,
    `<p>${esc(t.artist)}</p><div class="dialog-menu"><button data-action="track-play" data-id="${esc(id)}">${icon("play")} ${canPlay(t) ? "Тыңдау" : "Аудио қолжетімділігі"}</button><button data-action="add-playlist" data-id="${esc(id)}">${icon("plus")} Плейлистке қосу</button><button data-action="queue-next" data-id="${esc(id)}">${icon("queue")} Келесі болып ойнасын</button><button data-action="bind" data-id="${esc(id)}">${icon("folder")} Аудиофайлды байланыстыру</button><button data-action="source-edit" data-id="${esc(id)}">${icon("external")} Толық аудио сілтемесін қосу</button>${t.downloaded ? `<button class="danger-button" data-action="remove-audio" data-id="${esc(id)}">${icon("trash")} Құрылғыдан өшіру</button>` : ""}${playlistId ? `<button data-action="remove-from-playlist" data-id="${esc(id)}" data-playlist-id="${esc(playlistId)}">${icon("close")} Осы плейлисттен алып тастау</button>` : ""}</div>`,
  );
}
function sourceEditor(id) {
  const t = getTrack(id);
  if (!t) return;
  showDialog(
    "Аудио сілтемесін қосу",
    `<p>${esc(t.artist)} — ${esc(t.title)}</p><form data-form="source" data-id="${esc(id)}"><label for="sourceUrl">Толық аудиофайлдың HTTPS сілтемесі</label><input id="sourceUrl" type="url" required placeholder="https://…/song.mp3" value="${esc(t.audioUrl || "")}"><label for="sourceLicense">Пайдалану рұқсаты туралы белгі</label><input id="sourceLicense" required placeholder="Мысалы: автордың тарату рұқсаты" value="${esc(t.license || "")}"><label class="form-check"><input id="sourcePermission" type="checkbox" required><span>Осы аудионы қолданбада таратуға және жүктетуге рұқсатым бар.</span></label><p>Файл басқа доменде болса, қойма қолданбаға жүктеуге рұқсат беретін CORS баптауын қолдауы керек.</p><button class="button" type="submit">Сақтау</button></form>`,
  );
}
function playlistCreate(trackId = "") {
  showDialog(
    "Жаңа плейлист",
    `<form data-form="playlist-create" data-track-id="${esc(trackId)}"><label for="playlistName">Плейлист атауы</label><input id="playlistName" required maxlength="70" placeholder="Мысалы: Жолға" autocomplete="off"><button class="button" type="submit">Плейлист жасау</button></form>`,
  );
  setTimeout(() => $("playlistName")?.focus(), 30);
}
function addPlaylistDialog(trackId) {
  showDialog(
    "Плейлистке қосу",
    `<div class="dialog-menu">${state.playlists.map((p) => `<button data-action="playlist-add-track" data-id="${esc(trackId)}" data-playlist-id="${esc(p.id)}">${icon("music")} ${esc(p.name)}</button>`).join("")}<button data-action="new-playlist" data-track-id="${esc(trackId)}">${icon("plus")} Жаңа плейлист жасау</button></div>`,
  );
}
async function playlistAdd(id, trackId) {
  const p = state.playlists.find((p) => p.id === id);
  if (!p || !getTrack(trackId)) return;
  if (!p.trackIds.includes(trackId))
    await DB.put("playlists", { ...p, trackIds: [...p.trackIds, trackId] });
  await refresh();
  closeDialog();
  toast("Плейлистке қосылды.");
}
function queueDialog() {
  showDialog(
    "Ойнату кезегі",
    state.queue.length
      ? `<div class="queue-list">${state.queue
          .map((id, i) => {
            const t = getTrack(id);
            return t
              ? `<div class="queue-item${id === state.currentId ? " current" : ""}">${cover(t)}<div class="queue-name">${esc(t.title)}<small>${esc(t.artist)}</small></div><button class="icon-button" data-action="queue-up" data-index="${i}" aria-label="Жоғары жылжыту"${i === 0 ? " disabled" : ""}>${icon("up")}</button><button class="icon-button" data-action="queue-down" data-index="${i}" aria-label="Төмен жылжыту"${i === state.queue.length - 1 ? " disabled" : ""}>${icon("down")}</button><button class="icon-button" data-action="queue-remove" data-index="${i}" aria-label="Кезектен алып тастау"${id === state.currentId ? " disabled" : ""}>${icon("close")}</button></div>`
              : "";
          })
          .join("")}</div>`
      : `<p>Алдымен кітапханаңнан әнді ойнат. Сол тізімдегі қолжетімді әндер кезекке қосылады.</p>`,
  );
}
function sleepDialog() {
  showDialog(
    "Ұйқы таймері",
    `<p>${state.sleepUntil ? `Музыка шамамен ${Math.max(1, Math.ceil((state.sleepUntil - Date.now()) / 60000))} минуттан кейін тоқтайды.` : "Музыка қанша уақыттан кейін тоқтасын?"}</p><div class="button-list">${[15, 30, 60].map((m) => button("set-sleep", `${m} минут`, `data-minutes="${m}"`, true)).join("")}${button("set-sleep", "Өшіру", 'data-minutes="0"', true)}</div>`,
  );
}
function setSleep(minutes) {
  state.sleepUntil = minutes ? Date.now() + minutes * 60000 : 0;
  toast(
    minutes
      ? `Музыка ${minutes} минуттан кейін тоқтайды.`
      : "Ұйқы таймері өшірілді.",
  );
}
function checkSleep() {
  if (state.sleepUntil && Date.now() >= state.sleepUntil) {
    audio.pause();
    state.sleepUntil = 0;
    toast("Ұйқы таймері аяқталды.");
  }
}
async function updateStorage() {
  try {
    const info = await navigator.storage?.estimate?.();
    if ($("storageDetails"))
      $("storageDetails").textContent = info
        ? `${formatBytes(info.usage)} қолданылған · браузер квотасы шамамен ${formatBytes(info.quota)}`
        : "Бұл браузер сақтау көлемін көрсетпейді.";
    if (info && $("storageBar"))
      $("storageBar").style.width =
        `${Math.min(100, (info.usage / info.quota) * 100)}%`;
    const persistent = await navigator.storage?.persisted?.();
    if ($("persistStatus"))
      $("persistStatus").textContent = persistent
        ? "Тұрақты сақтау рұқсаты берілген."
        : "Сақтық көшірмені жүйелі сақтап отыр. Браузер деректерін тазалау әндерді өшіреді.";
  } catch {
    if ($("storageDetails"))
      $("storageDetails").textContent = "Сақтау көлемі қолжетімсіз.";
  }
}
function downloadFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function exportBackup() {
  requireDB();
  toast("Сақтық көшірме дайындалуда…");
  const meta = await DB.getAll("library"),
    files = [];
  let offset = 0;
  for (const t of meta.filter((t) => t.downloaded)) {
    const item = await DB.get("audio", t.id);
    if (!item?.blob) throw new Error(`${t.title}: аудио табылмады.`);
    files.push({
      track: t,
      offset,
      length: item.blob.size,
      mime: item.blob.type,
      blob: item.blob,
    });
    offset += item.blob.size;
  }
  const header = {
    version: 2,
    library: meta,
    playlists: state.playlists,
    files: files.map(({ blob, ...f }) => f),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const prefix = new Uint8Array(12);
  prefix.set(new TextEncoder().encode("SAZBACK2"));
  new DataView(prefix.buffer).setUint32(8, headerBytes.length, true);
  downloadFile(
    new Blob([prefix, headerBytes, ...files.map((f) => f.blob)], {
      type: "application/octet-stream",
    }),
    "saz-backup.saz",
  );
  toast("Сақтық көшірме дайын.");
}
async function importBackup(file) {
  requireDB();
  if (!file) return;
  toast("Көшірме тексерілуде…");
  const prefix = await file.slice(0, 12).arrayBuffer();
  if (
    prefix.byteLength !== 12 ||
    new TextDecoder().decode(new Uint8Array(prefix, 0, 8)) !== "SAZBACK2"
  )
    throw new Error("Бұл SAZ сақтық көшірмесі емес.");
  const length = new DataView(prefix).getUint32(8, true);
  if (length > 5 * 1024 ** 2 || length + 12 > file.size)
    throw new Error("Көшірме тақырыбы бүлінген.");
  const header = JSON.parse(await file.slice(12, 12 + length).text());
  if (
    header.version !== 2 ||
    !Array.isArray(header.files) ||
    !Array.isArray(header.library) ||
    !Array.isArray(header.playlists) ||
    header.files.length > 10000
  )
    throw new Error("Көшірме құрылымы дұрыс емес.");
  let expected = 0;
  const ids = new Set();
  for (const f of header.files) {
    if (
      !f.track?.id ||
      typeof f.track.id !== "string" ||
      ids.has(f.track.id) ||
      f.offset !== expected ||
      !Number.isSafeInteger(f.length) ||
      f.length <= 0 ||
      f.length > 150 * 1024 ** 2
    )
      throw new Error("Көшірмедегі аудио құрылымы дұрыс емес.");
    ids.add(f.track.id);
    expected += f.length;
  }
  if (12 + length + expected !== file.size)
    throw new Error("Көшірме толық емес.");
  const sanitized = (t) => ({
    id: String(t.id).slice(0, 100),
    title: String(t.title || "Атаусыз ән").slice(0, 200),
    artist: String(t.artist || "Менің музыкам").slice(0, 180),
    artistId: String(t.artistId || "local").slice(0, 100),
    styles: Array.isArray(t.styles)
      ? t.styles.filter((s) => STYLES.some((x) => x.id === s))
      : ["pop"],
    favorite: Boolean(t.favorite),
    source: t.source === "local" ? "local" : "catalog",
    duration: Math.max(0, Number(t.duration) || 0),
    officialUrl: safeUrl(t.officialUrl),
    artwork: safeUrl(t.artwork),
    audioUrl: safeUrl(t.audioUrl, { relative: true }),
    downloadable: Boolean(t.downloadable && t.license),
    license: String(t.license || ""),
    audioSourceOverride: Boolean(t.audioSourceOverride),
    fingerprint: String(t.fingerprint || ""),
    addedAt: Number(t.addedAt) || Date.now(),
  });
  for (const f of header.files) {
    const blob = file.slice(
      12 + length + f.offset,
      12 + length + f.offset + f.length,
      f.mime || "audio/mpeg",
    );
    const duration = await probeAudio(blob);
    await DB.saveAudio({ ...sanitized(f.track), duration }, blob);
  }
  for (const t of header.library) {
    if (!t.id || typeof t.id !== "string" || ids.has(t.id)) continue;
    const existing = await DB.get("library", t.id);
    await DB.put("library", {
      ...sanitized(t),
      ...existing,
      favorite: Boolean(t.favorite || existing?.favorite),
      downloaded: Boolean(existing?.downloaded),
    });
  }
  for (const p of header.playlists) {
    if (!p.id || !p.name || !Array.isArray(p.trackIds)) continue;
    const existing = await DB.get("playlists", String(p.id));
    await DB.put("playlists", {
      id: String(p.id).slice(0, 100),
      name: String(p.name).slice(0, 70),
      trackIds: [
        ...new Set([
          ...(existing?.trackIds || []),
          ...p.trackIds.filter((x) => typeof x === "string"),
        ]),
      ],
    });
  }
  await refresh();
  toast(`${header.files.length} аудио қалпына келтірілді.`);
  location.hash = "downloads";
}
function catalogExport() {
  const artists = [...state.catalog.artists];
  if (
    state.tracks.some((t) => t.artistId === "local") &&
    !artists.some((a) => a.id === "local")
  )
    artists.push({
      id: "local",
      name: "Менің музыкам",
      styles: ["pop"],
      color: "#aaa0dc",
    });
  const tracks = state.tracks.map(
    ({ downloaded, favorite, fingerprint, plays, lastPlayed, addedAt, ...t }) =>
      t,
  );
  downloadFile(
    new Blob(
      [
        JSON.stringify(
          validateCatalog({ ...state.catalog, artists, tracks }),
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    "catalog.json",
  );
  toast("Каталог сақталды.");
}

document.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-action]");
  if (!btn || btn.disabled) return;
  const action = btn.dataset.action,
    id = btn.dataset.id;
  try {
    switch (action) {
      case "import":
        $("fileInput").click();
        break;
      case "artist":
        state.query = "";
        $("search").value = "";
        state.limit = 50;
        location.hash = `artist/${encodeURIComponent(id)}`;
        break;
      case "collection":
        state.limit = 50;
        location.hash = `collection/${id}`;
        break;
      case "settings":
        location.hash = "settings";
        break;
      case "style":
        state.style = id;
        state.limit = 50;
        render();
        break;
      case "more-tracks":
        state.limit += 50;
        render();
        break;
      case "favorite":
        await toggleFavorite(id);
        break;
      case "player-favorite":
        if (state.currentId) await toggleFavorite(state.currentId);
        break;
      case "track-play":
        closeDialog();
        await playSelected(id);
        break;
      case "play":
        await playPause();
        break;
      case "next":
        await next();
        break;
      case "prev":
        await previous();
        break;
      case "shuffle":
        state.shuffle = !state.shuffle;
        if (!state.queue.length)
          state.queue = playableSelection().map((t) => t.id);
        if (state.shuffle) state.queueOrder = [...state.queue];
        state.queue = state.shuffle
          ? shuffled(state.queue, state.currentId)
          : [...state.queueOrder].filter((id) => canPlay(getTrack(id)));
        if (state.currentId && !state.queue.includes(state.currentId))
          state.queue.unshift(state.currentId);
        persistPlayback();
        updatePlayer();
        toast(state.shuffle ? "Араластыру қосылды." : "Араластыру өшірілді.");
        break;
      case "shuffle-play":
        await shufflePlay(btn.dataset.scope === "all");
        break;
      case "repeat":
        state.repeat =
          state.repeat === "off"
            ? "all"
            : state.repeat === "all"
              ? "one"
              : "off";
        persistPlayback();
        updatePlayer();
        toast(
          state.repeat === "off"
            ? "Қайталау өшірілді."
            : state.repeat === "all"
              ? "Барлық ән қайталанады."
              : "Бір ән қайталанады.",
        );
        break;
      case "play-list": {
        const first = visibleTracks.find(canPlay);
        if (first) await playSelected(first.id);
        else
          toast("Бұл жинақтың толық аудиосын файлдан байланыстыруға болады.");
        break;
      }
      case "available-catalog":
        state.availability = "full";
        state.query = "";
        state.style = "all";
        state.artistId = "all";
        $("search").value = "";
        location.hash = "catalog";
        render();
        break;
      case "show-offline":
        closeDialog();
        location.hash = "downloads";
        break;
      case "download":
        enqueue([id]);
        break;
      case "download-list":
        enqueue(visibleTracks.map((t) => t.id));
        break;
      case "cancel-download":
        cancelDownload(id);
        break;
      case "bind":
        requireDB();
        state.bindId = id;
        closeDialog();
        $("bindInput").click();
        break;
      case "track-menu":
        trackMenu(id);
        break;
      case "close-dialog":
        closeDialog();
        break;
      case "remove-audio":
        await removeAudio(id);
        break;
      case "source-edit":
        sourceEditor(id);
        break;
      case "new-playlist":
        requireDB();
        playlistCreate(btn.dataset.trackId || "");
        break;
      case "add-playlist":
        requireDB();
        addPlaylistDialog(id);
        break;
      case "playlist-add-track":
        await playlistAdd(btn.dataset.playlistId, id);
        break;
      case "remove-from-playlist": {
        const p = state.playlists.find((p) => p.id === btn.dataset.playlistId);
        if (p) {
          await DB.put("playlists", {
            ...p,
            trackIds: p.trackIds.filter((x) => x !== id),
          });
          await refresh();
          closeDialog();
        }
        break;
      }
      case "playlist-edit": {
        const p = state.playlists.find((p) => p.id === id);
        if (p)
          showDialog(
            "Плейлистті өзгерту",
            `<form data-form="playlist-edit" data-id="${esc(id)}"><label for="playlistName">Атауы</label><input id="playlistName" required maxlength="70" value="${esc(p.name)}"><div class="dialog-actions"><button type="button" class="button subtle danger-button" data-action="playlist-delete" data-id="${esc(id)}">Өшіру</button><button class="button" type="submit">Сақтау</button></div></form>`,
          );
        break;
      }
      case "playlist-delete":
        await DB.remove("playlists", id);
        await refresh();
        closeDialog();
        location.hash = "playlists";
        break;
      case "queue":
        queueDialog();
        break;
      case "queue-next":
        if (!canPlay(getTrack(id))) {
          toast("Алдымен әннің толық аудиосын қос.");
          break;
        }
        state.queue = state.queue.filter((x) => x !== id);
        state.queue.splice(
          Math.max(0, state.queue.indexOf(state.currentId) + 1),
          0,
          id,
        );
        state.queueOrder = [...state.queue];
        persistPlayback();
        closeDialog();
        toast("Келесі әндер кезегіне қосылды.");
        break;
      case "queue-up":
      case "queue-down": {
        const i = Number(btn.dataset.index),
          j = action === "queue-up" ? i - 1 : i + 1;
        if (j >= 0 && j < state.queue.length)
          [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
        state.queueOrder = [...state.queue];
        persistPlayback();
        queueDialog();
        break;
      }
      case "queue-remove":
        const [removed] = state.queue.splice(Number(btn.dataset.index), 1);
        state.queueOrder = state.queueOrder.filter((id) => id !== removed);
        persistPlayback();
        queueDialog();
        break;
      case "sleep":
        sleepDialog();
        break;
      case "set-sleep":
        setSleep(Number(btn.dataset.minutes));
        closeDialog();
        break;
      case "persist": {
        const result = await navigator.storage?.persist?.();
        toast(
          result
            ? "Тұрақты сақтау рұқсаты берілді."
            : "Браузер тұрақты сақтау рұқсатын бермеді. Сақтық көшірме жасап отыр.",
        );
        updateStorage();
        break;
      }
      case "backup-export":
        await exportBackup();
        break;
      case "backup-import":
        $("backupInput").click();
        break;
      case "catalog-export":
        catalogExport();
        break;
      case "catalog-import":
        $("catalogInput").click();
        break;
      case "catalog-sync":
        await syncPublishedCatalog();
        await refresh();
        toast("Сайт каталогы жаңартылды. Сақталған әндерің орнында.");
        break;
      case "install":
        if (window.installPrompt) {
          await window.installPrompt.prompt();
          window.installPrompt = null;
        } else
          showDialog(
            "Қолданбаны орнату",
            "<p>iPhone: Safari → Бөлісу → «Негізгі экранға қосу».</p><p>Android: Chrome мәзірі → «Қолданбаны орнату».</p><p>Компьютер: Chrome немесе Edge адрес жолындағы орнату белгішесі.</p>",
          );
        break;
      case "update":
        state.registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
        break;
      case "now-playing": {
        const t = getTrack(state.currentId);
        if (t) showDialog("Қазір ойнап тұр", nowPlayingBody(t));
        else toast("Алдымен әнді таңда.");
        if (t) {
          dialog.classList.add("now-playing-dialog");
          dialog.dataset.view = "now-playing";
          updatePlayer();
        }
        break;
      }
    }
  } catch (error) {
    toast(errorMessage(error), true);
  }
});
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  try {
    requireDB();
    if (form.dataset.form === "source") {
      const url = safeUrl($("sourceUrl").value);
      if (!url) throw new Error("Дұрыс HTTPS аудиосілтемесін енгіз.");
      const sourceTrack = getTrack(form.dataset.id);
      await DB.put("library", {
        ...sourceTrack,
        audioUrl: url,
        license: $("sourceLicense").value.trim(),
        downloadable: true,
        audioSourceOverride: true,
        sha256: "",
        size: sourceTrack.downloaded ? sourceTrack.size : 0,
        version: String(Date.now()),
        licenseUrl: "",
        permissionRef: "",
        sourceUrl: url,
      });
      await refresh();
      toast("Толық аудио сілтемесі сақталды.");
    } else if (form.dataset.form === "playlist-create") {
      const name = $("playlistName").value.trim();
      if (!name) throw new Error("Плейлист атауын енгіз.");
      const id = crypto.randomUUID();
      await DB.put("playlists", {
        id,
        name,
        trackIds: form.dataset.trackId ? [form.dataset.trackId] : [],
      });
      await refresh();
      location.hash = `playlist/${id}`;
    } else if (form.dataset.form === "playlist-edit") {
      const p = state.playlists.find((p) => p.id === form.dataset.id);
      const name = $("playlistName").value.trim();
      if (!name) throw new Error("Атау бос болмауы керек.");
      await DB.put("playlists", { ...p, name });
      await refresh();
    }
    closeDialog();
  } catch (error) {
    toast(errorMessage(error), true);
  }
});
document.addEventListener("change", async (event) => {
  try {
    switch (event.target.id) {
      case "availabilityFilter":
        state.availability = event.target.value;
        state.limit = 50;
        render();
        break;
      case "artistFilter":
        state.artistId = event.target.value;
        state.limit = 50;
        render();
        break;
      case "sortFilter":
        state.sort = event.target.value;
        render();
        break;
      case "offlineOnly":
        await setting("offlineOnly", event.target.checked);
        break;
      case "sleepSelect":
        setSleep(Number(event.target.value));
        break;
      case "fileInput":
        await importFiles([...event.target.files]);
        event.target.value = "";
        break;
      case "bindInput":
        await importFiles([...event.target.files], state.bindId);
        event.target.value = "";
        state.bindId = null;
        break;
      case "catalogInput": {
        const file = event.target.files[0];
        if (file) {
          const catalog = validateCatalog(JSON.parse(await file.text()));
          requireDB();
          await setting("customCatalog", catalog);
          state.catalog = mergeCatalogs(state.publishedCatalog, catalog);
          await refresh();
          toast("Каталог осы құрылғыда жаңартылды.");
        }
        event.target.value = "";
        break;
      }
      case "backupInput":
        await importBackup(event.target.files[0]);
        event.target.value = "";
        break;
    }
  } catch (error) {
    event.target.value = "";
    toast(errorMessage(error), true);
  }
});
$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = $("search").value.trim();
    state.limit = 50;
    state.style = "all";
    state.artistId = "all";
    if (route() !== "catalog") location.hash = "catalog";
    else render();
  }, 180);
});
$("volume").addEventListener("input", () => {
  audio.volume = Math.max(0, Math.min(1, Number($("volume").value)));
  setting("volume", audio.volume).catch(() => {});
});
$("seek").addEventListener("input", () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    audio.currentTime = (Number($("seek").value) / 100) * audio.duration;
    persistPlayback();
  }
});
document.addEventListener("input", (event) => {
  if (
    event.target.id === "nowSeek" &&
    Number.isFinite(audio.duration) &&
    audio.duration > 0
  ) {
    audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
    updateNowPlayingPosition();
    persistPlayback();
  }
});
audio.addEventListener("loadedmetadata", () => {
  $("duration").textContent = formatTime(audio.duration);
  updateNowPlayingPosition();
});
audio.addEventListener("timeupdate", () => {
  checkSleep();
  updateNowPlayingPosition();
  $("currentTime").textContent = formatTime(audio.currentTime);
  $("duration").textContent = formatTime(audio.duration);
  $("seek").value =
    Number.isFinite(audio.duration) && audio.duration > 0
      ? (audio.currentTime / audio.duration) * 100
      : 0;
  if (
    "mediaSession" in navigator &&
    navigator.mediaSession.setPositionState &&
    Number.isFinite(audio.duration) &&
    audio.duration > 0
  ) {
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        position: Math.min(audio.currentTime, audio.duration),
        playbackRate: audio.playbackRate,
      });
    } catch {}
  }
  persistPlayback();
});
for (const event of ["play", "pause"])
  audio.addEventListener(event, () => {
    updatePlayer();
    persistPlayback();
    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = audio.paused
        ? "paused"
        : "playing";
  });
audio.addEventListener("ended", () => {
  if (state.repeat === "one") {
    audio.currentTime = 0;
    audio.play().catch((error) => toast(errorMessage(error), true));
  } else next().catch((error) => toast(errorMessage(error), true));
});
audio.addEventListener("error", () => {
  if (audio.src)
    toast(
      "Аудионы ойнату мүмкін болмады. Файлды немесе сілтемені тексер.",
      true,
    );
});
function configureMediaControls() {
  if (!("mediaSession" in navigator)) return;
  for (const [action, fn] of Object.entries({
    play: () => audio.play().catch(() => {}),
    pause: () => audio.pause(),
    previoustrack: () => previous().catch(() => {}),
    nexttrack: () => next().catch(() => {}),
    seekto: (d) => {
      if (Number.isFinite(audio.duration) && d.seekTime != null)
        audio.currentTime = Math.max(0, Math.min(d.seekTime, audio.duration));
    },
    seekbackward: null,
    seekforward: null,
  })) {
    try {
      navigator.mediaSession.setActionHandler(action, fn);
    } catch {}
  }
}
configureMediaControls();
function network() {
  state.online = navigator.onLine;
  $("networkText").textContent = state.online
    ? "Интернет қосулы"
    : "Офлайн режим";
  $("networkDot").parentElement.classList.toggle("offline", !state.online);
  $("offlineBanner").hidden = state.online;
  if (
    !state.online &&
    state.controller &&
    state.downloads.get(state.controller.id)?.status !== "saving"
  )
    state.controller.controller.abort();
  render();
}
window.addEventListener("online", network);
window.addEventListener("online", () => {
  if (state.initialized)
    syncPublishedCatalog()
      .then(refresh)
      .catch(() => {});
});
window.addEventListener("offline", network);
window.addEventListener("hashchange", () => {
  state.limit = 50;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.installPrompt = event;
});
window.addEventListener("dbblocked", () =>
  toast("Басқа ашық SAZ беттерін жауып, қайта ашып көр.", true),
);
document.addEventListener("visibilitychange", () => {
  checkSleep();
  if (document.hidden && state.dbReady)
    setting("playback", {
      currentId: state.currentId,
      position: audio.currentTime || 0,
      queue: state.queue,
      queueOrder: state.queueOrder,
      shuffle: state.shuffle,
      repeat: state.repeat,
    }).catch(() => {});
});
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input,textarea,select") || dialog.open) return;
  if (event.key === "/") {
    event.preventDefault();
    $("search").focus();
  }
  if (event.code === "Space") {
    event.preventDefault();
    playPause().catch((error) => toast(errorMessage(error), true));
  }
  if (event.key === "ArrowRight" && Number.isFinite(audio.duration)) {
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  }
  if (event.key === "ArrowLeft") {
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  }
});
document.addEventListener("dragenter", (event) => {
  if (event.dataTransfer?.types.includes("Files")) {
    event.preventDefault();
    dropDepth++;
    document.body.classList.add("drop-active");
  }
});
document.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
});
document.addEventListener("dragleave", () => {
  if (--dropDepth <= 0) {
    dropDepth = 0;
    document.body.classList.remove("drop-active");
  }
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  dropDepth = 0;
  document.body.classList.remove("drop-active");
  if (event.dataTransfer?.files.length)
    importFiles([...event.dataTransfer.files]).catch((error) =>
      toast(errorMessage(error), true),
    );
});
dialog.addEventListener("close", () => {
  $("dialogBody").innerHTML = "";
  dialog.classList.remove("now-playing-dialog");
  delete dialog.dataset.view;
});
setInterval(checkSleep, 1000);
async function init() {
  hydrateIcons();
  $("content").innerHTML =
    '<div class="loading">Музыка әлемің дайындалуда…</div>';
  try {
    await DB.openDB();
    state.dbReady = true;
    const settings = await DB.getAll("settings");
    state.settings = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  } catch (error) {
    toast(`Сақтау қолжетімсіз: ${errorMessage(error)}`, true);
  }
  try {
    await syncPublishedCatalog();
  } catch (error) {
    state.publishedCatalog = state.settings.cachedCatalog || {
      artists: [],
      tracks: [],
    };
    state.catalog = mergeCatalogs(
      state.publishedCatalog,
      state.settings.customCatalog,
    );
    if (!state.catalog.tracks.length)
      toast("Каталог ашылмады. Интернет қосып, қайта ашып көр.", true);
  }
  await refresh();
  network();
  audio.volume = Math.max(
    0,
    Math.min(
      1,
      Number(state.settings.volume ?? localStorage.getItem("mp-volume") ?? 0.8),
    ),
  );
  $("volume").value = audio.volume;
  const saved = state.settings.playback;
  if (saved) {
    state.shuffle = Boolean(saved.shuffle);
    state.repeat = ["one", "all", "off"].includes(saved.repeat)
      ? saved.repeat
      : "off";
    state.queue = Array.isArray(saved.queue)
      ? saved.queue.filter((id) => getTrack(id))
      : [];
    state.queueOrder = Array.isArray(saved.queueOrder)
      ? saved.queueOrder.filter((id) => getTrack(id))
      : [...state.queue];
    if (saved.currentId && canPlay(getTrack(saved.currentId)))
      await loadTrack(saved.currentId, {
        autoplay: false,
        position: Number(saved.position) || 0,
        addHistory: false,
      });
    updatePlayer();
  }
  if ("serviceWorker" in navigator) {
    try {
      let knownController = navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register("./service-worker.js");
      knownController = navigator.serviceWorker.controller || knownController;
      state.registration = reg;
      const waiting = () => {
        if (reg.waiting && navigator.serviceWorker.controller)
          $("updateBanner").hidden = false;
      };
      waiting();
      reg.addEventListener("updatefound", () =>
        reg.installing?.addEventListener("statechange", waiting),
      );
      navigator.serviceWorker.ready.then(() => {
        state.offlineReady = true;
        if ($("offlineReadyText"))
          $("offlineReadyText").textContent =
            "Қолданба интернетсіз ашылуға дайын.";
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        const previousController = knownController;
        knownController = navigator.serviceWorker.controller;
        if (previousController && previousController !== knownController) {
          if (!reloading) {
            reloading = true;
            location.reload();
          }
        }
      });
    } catch {
      toast("Қолданбаның офлайн ашылуы әзірге дайын емес.", true);
    }
  }
  state.initialized = true;
}
init().catch((error) => toast(errorMessage(error), true));
