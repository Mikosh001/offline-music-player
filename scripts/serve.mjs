import http from "node:http";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".webmanifest": "application/manifest+json",
};
const port = Number(process.env.PORT || 4173);
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const relative =
      pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    const file = path.resolve(root, relative);
    if (
      !file.startsWith(root) ||
      relative.split(/[\\/]/).some((x) => x.startsWith("."))
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const headers = {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };
    let start = 0,
      end = info.size - 1,
      status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match) {
        res.writeHead(416, { "Content-Range": `bytes */${info.size}` });
        res.end();
        return;
      }
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      } else {
        start = Math.max(0, info.size - Number(match[2]));
      }
      if (start > end || start >= info.size) {
        res.writeHead(416, { "Content-Range": `bytes */${info.size}` });
        res.end();
        return;
      }
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    }
    headers["Content-Length"] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === "HEAD") res.end();
    else createReadStream(file, { start, end }).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`SAZ: http://127.0.0.1:${port}`),
);
