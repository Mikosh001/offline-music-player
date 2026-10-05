import { readFile, writeFile, mkdir, rename, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const MIME = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};
const ALLOWED_ARTISTS = new Set([
  "ernar",
  "moldanazar",
  "sadraddin",
  "miras",
  "turar",
  "duman",
]);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function isAudio(bytes, extension) {
  if (extension === ".wav")
    return (
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WAVE"
    );
  if (extension === ".ogg") return bytes.toString("ascii", 0, 4) === "OggS";
  if (extension === ".flac") return bytes.toString("ascii", 0, 4) === "fLaC";
  if (extension === ".m4a") return bytes.toString("ascii", 4, 8) === "ftyp";
  return (
    bytes.toString("ascii", 0, 3) === "ID3" ||
    (bytes[0] === 255 && (bytes[1] & 224) === 224)
  );
}
function requireHttps(value, field) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error(`${field}: HTTPS мекенжайы қажет.`);
  return url.href;
}

export async function publishAudio({ root, manifestPath, apply = false }) {
  root = await realpath(root);
  const catalogPath = path.join(root, "catalog.json");
  const original = await readFile(catalogPath, "utf8");
  const catalog = JSON.parse(original);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(manifest.tracks) || !manifest.tracks.length)
    throw new Error("Жариялайтын tracks тізімі бос.");
  const planned = [],
    seen = new Set(),
    audioUrlsByHash = new Map();
  for (const entry of manifest.tracks) {
    const track = catalog.tracks.find((t) => t.id === entry.trackId);
    if (!track || !ALLOWED_ARTISTS.has(track.artistId))
      throw new Error(
        `Ән осы алты орындаушының каталогынан табылмады: ${entry.trackId}`,
      );
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(track.id) || seen.has(track.id))
      throw new Error("Ән ID-лері жарамды әрі бірегей болуы керек.");
    seen.add(track.id);
    if (
      entry.redistributionAllowed !== true ||
      !String(entry.license || "").trim() ||
      !String(entry.permissionRef || "").trim()
    )
      throw new Error(
        `${track.title}: қайта тарату рұқсаты, license және permissionRef қажет.`,
      );
    const sourceUrl = requireHttps(entry.sourceUrl, "sourceUrl");
    const licenseUrl = entry.licenseUrl
      ? requireHttps(entry.licenseUrl, "licenseUrl")
      : "";
    if (!entry.file)
      throw new Error(
        `${track.title}: жергілікті толық аудиофайлды көрсетіңіз.`,
      );
    const source = path.resolve(path.dirname(manifestPath), entry.file);
    const extension = path.extname(source).toLowerCase();
    if (!MIME[extension])
      throw new Error("MP3, WAV, M4A, OGG немесе FLAC файлы қажет.");
    const bytes = await readFile(source);
    if (
      bytes.length < 16 ||
      bytes.length > 150 * 1024 * 1024 ||
      !isAudio(bytes, extension)
    )
      throw new Error(`${track.title}: аудио форматы немесе көлемі жарамсыз.`);
    const sha256 = digest(bytes);
    const audioKey = `${extension}:${sha256}`;
    const audioUrl =
      audioUrlsByHash.get(audioKey) ||
      `assets/audio/licensed/${track.id}-${sha256.slice(0, 16)}${extension}`;
    audioUrlsByHash.set(audioKey, audioUrl);
    const fields = {
      audioUrl,
      downloadable: true,
      license: entry.license,
      permissionRef: entry.permissionRef,
      sourceUrl,
      licenseUrl,
      size: bytes.length,
      mime: MIME[extension],
      sha256,
      version: sha256.slice(0, 16),
    };
    Object.assign(track, fields);
    planned.push({
      id: track.id,
      title: track.title,
      source,
      bytes,
      ...fields,
    });
  }
  // Nothing changes until every input has been checked. Dry-run is the default.
  if (apply) {
    const audioDirectory = path.join(root, "assets", "audio", "licensed");
    await mkdir(audioDirectory, { recursive: true });
    const resolvedAudioDirectory = await realpath(audioDirectory);
    if (!resolvedAudioDirectory.startsWith(root + path.sep))
      throw new Error("Аудио қоймасы жоба түбірінен тыс болмауы керек.");
    for (const file of planned) {
      const destination = path.join(
        resolvedAudioDirectory,
        path.basename(file.audioUrl),
      );
      try {
        await writeFile(destination, file.bytes, { flag: "wx" });
      } catch (error) {
        if (
          error.code !== "EEXIST" ||
          digest(await readFile(destination)) !== file.sha256
        )
          throw error;
      }
    }
    const temp = path.join(root, "catalog.publish.tmp");
    await writeFile(temp, JSON.stringify(catalog, null, 2) + "\n");
    await rename(temp, catalogPath);
  }
  return {
    applied: apply,
    tracks: planned.map(({ bytes, source, ...file }) => file),
    note: apply
      ? "Аудио сайттың қоймасына көшірілді. Жобаны хостингке жариялаңыз."
      : "Алдын ала тексеру. Файлдар өзгерген жоқ; қолдану үшін --apply қосыңыз.",
  };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const manifest = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!manifest) {
    console.error(
      "Қолдану: npm run publish:audio -- audio-manifest.json [--apply]",
    );
    process.exitCode = 1;
  } else {
    try {
      console.log(
        JSON.stringify(
          await publishAudio({
            root: fileURLToPath(new URL("../", import.meta.url)),
            manifestPath: path.resolve(manifest),
            apply: process.argv.includes("--apply"),
          }),
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
