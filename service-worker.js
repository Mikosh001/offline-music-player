const BASE = new URL("./", self.location);
const PREFIX = `saz-${BASE.pathname}-`;
const CACHE = `${PREFIX}v2-10`;
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
  "legal/site-policy.html",
  "legal/site-policy.pdf",
  "legal/site-policy-content.json",
  "legal/policy-registration.json",
  "legal/saz-policy-seal.svg",
];
const shellUrls = new Set(SHELL.map((path) => new URL(path, BASE).href));
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          SHELL.map(
            (path) => new Request(new URL(path, BASE), { cache: "reload" }),
          ),
        ),
      ),
  );
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
          const cache = await caches.open(CACHE);
          const documentUrl = new URL(request.url);
          documentUrl.search = "";
          documentUrl.hash = "";
          const stored = await cache.match(documentUrl.href);
          if (stored) return stored;
          // A saved policy or PDF must keep its own content when opened offline.
          // Unknown document paths must not silently turn into the music home page.
          if (
            documentUrl.pathname === BASE.pathname ||
            documentUrl.pathname === new URL("index.html", BASE).pathname
          ) {
            return (
              (await cache.match(new URL("index.html", BASE).href)) ||
              Response.error()
            );
          }
          return Response.error();
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
