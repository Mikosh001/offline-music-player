const BASE = new URL("./", self.location);
const PREFIX = `saz-${BASE.pathname}-`;
const CACHE = `${PREFIX}v2-3`;
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "core.js",
  "db.js",
  "icons.js",
  "catalog.json",
  "manifest.json",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "icon-180.png",
];
const shellUrls = new Set(SHELL.map((path) => new URL(path, BASE).href));
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(PREFIX) && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== BASE.origin ||
    request.headers.has("range")
  )
    return;
  // Audio is stored explicitly in IndexedDB. Provider embeds and remote media are never cached here.
  if (url.pathname.includes("/assets/audio/")) return;
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await caches.open(CACHE)).match(
            new URL("index.html", BASE).href,
          );
        }
      })(),
    );
    return;
  }
  if (url.href === new URL("catalog.json", BASE).href) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(request, response.clone());
          return response;
        } catch {
          const stored = await cache.match(request);
          return stored || Response.error();
        }
      })(),
    );
    return;
  }
  if (!shellUrls.has(url.href)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(request)) || fetch(request);
    })(),
  );
});
