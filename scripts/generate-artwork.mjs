import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url);
const catalogUrl = new URL("catalog.json", root);
const registryUrl = new URL("permissions/artwork-credit.json", root);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
const previous = JSON.parse(await readFile(registryUrl, "utf8").catch((error) => {
  if (error.code === "ENOENT") return '{"files":[]}';
  throw error;
}));
const directory = new URL("assets/artwork/", root);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const escape = (value) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[char]));
const font = "Segoe UI, DejaVu Sans, Arial, sans-serif";
const covers = new Map();

for (const track of catalog.tracks.filter((track) => !track.demo)) {
  const artist = catalog.artists.find(({ id }) => id === track.artistId);
  const key = hash(artist.id + "|" + track.album);
  const name = key.slice(0, 16);
  if (!covers.has(name)) {
    covers.set(name, {
      name,
      seed: Number.parseInt(key.slice(16, 24), 16),
      artistId: artist.id,
      artist: artist.name,
      color: artist.color,
      album: track.album,
      title: (track.album || track.title).replace(/\s*[-–]\s*(Single|EP)$/i, ""),
      tracks: [],
    });
  }
  covers.get(name).tracks.push(track);
}

function hueOf(color) {
  const [red, green, blue] = color.slice(1).match(/../g).map((hex) => Number.parseInt(hex, 16));
  const high = Math.max(red, green, blue);
  const delta = high - Math.min(red, green, blue);
  if (!delta) return 267;
  if (high === red) return ((green - blue) / delta * 60 + 360) % 360;
  if (high === green) return 120 + (blue - red) / delta * 60;
  return 240 + (red - green) / delta * 60;
}

function motif(seed, accent) {
  const tilt = 18 + ((seed >>> 4) % 23);
  const rotation = (seed & 32) ? tilt : -tilt;
  if (seed % 4 === 0) {
    return `<g transform="rotate(${rotation} 256 139)">
      <ellipse cx="256" cy="139" rx="192" ry="105" fill="#11132b" fill-opacity=".54"/>
      ${[83, 113, 144, 176, 192].map((radius) => `<ellipse cx="256" cy="139" rx="${radius}" ry="${radius * .55}" fill="none" stroke="${accent}" stroke-opacity=".55" stroke-width="2"/>`).join("")}
      <ellipse cx="256" cy="139" rx="64" ry="36" fill="url(#light)"/>
      <ellipse cx="256" cy="139" rx="8" ry="4.5" fill="#1b192d"/>
      <circle cx="422" cy="90" r="8" fill="${accent}"/>
    </g>`;
  }
  if (seed % 4 === 1) {
    const phase = (seed % 20) / 8;
    return Array.from({ length: 19 }, (_, i) => {
      const envelope = Math.sin((i + 1) * Math.PI / 20);
      const height = 28 + envelope * (75 + 77 * Math.abs(Math.sin(i * .71 + phase)));
      return `<rect x="${49 + i * 22.3}" y="${142 - height / 2}" width="12" height="${height}" rx="6" fill="url(#light)" opacity="${.55 + .45 * envelope}"/>`;
    }).join("");
  }
  if (seed % 4 === 2) {
    const crest = (seed >>> 7) % 48;
    const shapes = Array.from({ length: 7 }, (_, i) =>
      `<path d="M-30 ${240 + 19 * i} C124 ${252 + 16 * i} 136 ${10 + 15 * i} ${255 + crest} ${50 + 17 * i} S411 ${262 + 17 * i} 546 ${92 + 16 * i}"/>`);
    return `<g fill="none" stroke="url(#light)" stroke-width="5" opacity=".82">${shapes.join("")}</g>
      <circle cx="${255 + crest}" cy="49" r="10" fill="${accent}"/>`;
  }
  return `<g transform="rotate(${rotation} 256 138)">
    <rect x="129" y="-44" width="254" height="354" rx="127" fill="url(#light)"/>
    <rect x="161" y="-17" width="190" height="300" rx="95" fill="#201a36" fill-opacity=".66"/>
    <rect x="193" y="12" width="126" height="244" rx="63" fill="none" stroke="${accent}" stroke-width="2"/>
    <rect x="224" y="40" width="64" height="189" rx="32" fill="url(#light)" opacity=".78"/>
    <path d="M95 138h323" stroke="#fff" opacity=".27"/>
  </g>`;
}

function artwork(cover, typography) {
  const { title, artist, color, seed } = cover;
  const { lines, size, bylineSize } = typography;
  const hue = Math.round(hueOf(color)) + ((seed % 31) - 15);
  const accent = `hsl(${hue} 78% 83%)`;
  const lineHeight = Math.round(size * 1.06);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img">
  <title>${escape(title + " · " + artist)}</title>
  <defs>
    <linearGradient id="base" x2=".8" y2="1">
      <stop stop-color="hsl(${hue + 14} 55% 19%)"/>
      <stop offset=".52" stop-color="hsl(${hue} 46% 37%)"/>
      <stop offset="1" stop-color="#161427"/>
    </linearGradient>
    <linearGradient id="light" x2=".86" y2="1">
      <stop stop-color="${accent}"/>
      <stop offset="1" stop-color="hsl(${hue + 29} 64% 52%)"/>
    </linearGradient>
    <linearGradient id="ink" x2="0" y2="1">
      <stop offset=".43" stop-color="#121224" stop-opacity="0"/>
      <stop offset=".64" stop-color="#171326" stop-opacity=".96"/>
      <stop offset="1" stop-color="#141224"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#base)"/>
  ${motif(seed, accent)}
  <rect width="512" height="512" fill="url(#ink)"/>
  <rect x="34" y="${400 - lineHeight * (lines.length - 1) - size}" width="36" height="4" rx="2" fill="${accent}"/>
  <g fill="#fff8f5" font-family="${font}" font-size="${size}" font-weight="700">
    ${lines.map((line, i) => `<text x="33" y="${420 - lineHeight * (lines.length - 1 - i)}">${escape(line)}</text>`).join("\n    ")}
  </g>
  <text x="35" y="469" fill="${accent}" font-family="${font}" font-size="${bylineSize}" font-weight="600">${escape(artist)}</text>
</svg>
`;
}

await mkdir(directory, { recursive: true });
const atlas = {};
const registry = [];
let posterBytes = 0;
let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ channel: "msedge" });
}
try {
  const page = await browser.newPage({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 1,
  });
  await page.setContent('<style>body{margin:0}svg{display:block}</style><main></main>');
  const typography = await page.evaluate(({ covers, font }) => {
    const ctx = document.createElement("canvas").getContext("2d");
    const measure = (size, weight = 700) => {
      ctx.font = weight + " " + size + "px " + font;
      return (text) => ctx.measureText(text).width;
    };
    return covers.map(({ title, artist }) => {
      let bylineSize = 25;
      while (measure(bylineSize, 600)(artist) > 437) bylineSize -= 1;
      for (let size = 64; size >= 25; size -= 1) {
        const width = measure(size);
        const lines = [];
        let line = "";
        for (const word of title.split(/\s+/u)) {
          const joined = line ? line + " " + word : word;
          if (line && width(joined) > 438) {
            lines.push(line);
            line = word;
          } else {
            line = joined;
          }
        }
        lines.push(line);
        if (lines.length <= 3 && lines.every((line) => width(line) <= 438) &&
            (lines.length - 1) * size * 1.06 + size <= 157) {
          return { lines, size, bylineSize };
        }
      }
      throw new Error("Cover title does not fit: " + title);
    });
  }, { covers: [...covers.values()].map(({ title, artist }) => ({ title, artist })), font });

  for (const [index, cover] of [...covers.values()].entries()) {
    const svg = artwork(cover, typography[index]);
    await page.locator("main").evaluate((main, markup) => { main.innerHTML = markup; }, svg);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 67 });
    const posterHash = hash(jpeg);
    const file = `assets/artwork/${cover.name}.svg`;
    const poster = `assets/artwork/${cover.name}-${posterHash.slice(0, 12)}.jpg`;
    await writeFile(new URL(file, root), svg);
    await writeFile(new URL(poster, root), jpeg);
    atlas[file] = svg;
    registry.push({
      file, artistId: cover.artistId, album: cover.album, sha256: hash(svg),
      poster, posterSha256: posterHash,
    });
    for (const track of cover.tracks) Object.assign(track, { artwork: file, poster });
    posterBytes += jpeg.length;
  }
} finally {
  await browser.close();
}

await writeFile(catalogUrl, JSON.stringify(catalog, null, 2) + "\n");
await writeFile(new URL("index.json", directory), JSON.stringify(atlas) + "\n");
await writeFile(registryUrl, JSON.stringify({
  kind: "Original SAZ editorial artwork; not official artist portraits or original release sleeves",
  license: "CC0-1.0",
  generator: "scripts/generate-artwork.mjs",
  files: registry,
}, null, 2) + "\n");
const currentPosters = new Set(registry.map(({ poster }) => poster));
for (const { poster } of previous.files) {
  if (/^assets\/artwork\/[a-f0-9]{16}-[a-f0-9]{12}\.jpg$/.test(poster || "") && !currentPosters.has(poster)) {
    await rm(new URL(poster, root), { force: true });
  }
}
console.log(`Generated ${registry.length} SAZ covers with 512×512 JPEG posters (${posterBytes} bytes)`);
