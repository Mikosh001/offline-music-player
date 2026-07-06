// Кэш нұсқасы — файлдарды өзгертсең осы санды өсір
const CACHE_NAME = 'offline-music-player-v4';

// Тек "қаңқа" файлдар кэштеледі — ән файлдары IndexedDB-де сақталады,
// сондықтан оларды бұл кэшке қосудың қажеті жоқ.
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './db.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => (name !== CACHE_NAME ? caches.delete(name) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
