const cacheName = "slyce-v1.0.1";
const files = [
  "/slyce/",
  "/slyce/?source=pwa",
  "/slyce/EdgeFinder.js",
  "/slyce/algorithm.js",
  "/slyce/crc32.js",
  "/slyce/favicon.ico",
  "/slyce/icon-192.png",
  "/slyce/icon-512.png",
  "/slyce/index.html",
  "/slyce/manifest.json",
  "/slyce/math.js",
  "/slyce/poster.jpg",
  "/slyce/scrollzoom.js",
  "/slyce/slyce.jpg",
  "/slyce/style.css",
  "/slyce/ui.js",
  "/slyce/util.js"
];

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.open(cacheName)
      .then(c => c.match(event.request))
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(cacheName).then(cache => {
      return cache.addAll(files);
    })
  );
});

// Delete stale caches from previous versions once the new one is active.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("slyce-v") && key !== cacheName)
          .map(key => caches.delete(key))
    ))
  );
});

self.addEventListener("message", event => {
  const msg = event.data;
  if (msg["action"] === "hi") {
    const dash = cacheName.indexOf("-");
    event.source.postMessage({"action": "greetings", "version": cacheName.substring(dash + 1)});
  }
});
