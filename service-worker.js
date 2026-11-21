const BASE = new URL("./", self.location);
const PREFIX = `saz-${BASE.pathname}-`;
const CACHE = `${PREFIX}v2-18`;
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "experience.css",
  "script.js",
  "core.js",
  "mixes.js",
  "assets/artwork/index.json",
  "db.js",
  "icons.js",
  "catalog.json",
  "manifest.json",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "icon-180.png",
  "legal/site-policy.html",
  "legal/policy.css",
  "legal/policy.js",
  "legal/site-policy.pdf",
  "legal/site-policy-content.json",
  "legal/policy-registration.json",
  "legal/archive/v1.0/site-policy.html",
  "legal/archive/v1.0/site-policy.pdf",
  "legal/archive/v1.0/site-policy-content.json",
  "legal/archive/v1.0/policy-registration.json",
  "legal/archive/v1.0/saz-policy-seal.svg",
  "legal/archive/v1.1/site-policy.html",
  "legal/archive/v1.1/site-policy.pdf",
  "legal/archive/v1.1/site-policy-content.json",
  "legal/archive/v1.1/policy-registration.json",
  "legal/archive/v1.1/policy.css",
  "legal/archive/v1.1/policy.js",
  "legal/archive/v1.1/saz-policy-seal.svg",
  "legal/saz-policy-seal.svg",
  "permissions/additional-audio-20261121.html",
  "permissions/additional-audio-20261121.json",
  "permissions/current-audio-publication.json",
  "permissions/additional-audio-20261122.html",
  "permissions/additional-audio-20261122.json",
];
const shellUrls = new Set(SHELL.map((path) => new URL(path, BASE).href));
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(
          SHELL.map(
            (path) => new Request(new URL(path, BASE), { cache: "reload" }),
          ),
        );
        // One compact bundle makes all editorial covers available offline.
        // No hundreds of image downloads, audio caching or external requests.
        const atlas=await (await cache.match(new URL("assets/artwork/index.json",BASE).href)).json();
        await Promise.all(Object.entries(atlas).filter(([path])=>/^assets\/artwork\/[a-f0-9]{16}\.svg$/.test(path)).map(([path,svg])=>cache.put(new URL(path,BASE).href,new Response(svg,{headers:{"Content-Type":"image/svg+xml"}}))));
      }),
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
  if (!shellUrls.has(url.href) && !url.pathname.startsWith(new URL("assets/artwork/", BASE).pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(request)) || fetch(request);
    })(),
  );
});
