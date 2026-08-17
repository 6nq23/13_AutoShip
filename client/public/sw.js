const CACHE = "autoship-v4";
self.addEventListener("install", (event) => event.waitUntil(Promise.all([
  caches.open(CACHE).then((cache) => cache.addAll(["/"])),
  self.skipWaiting(),
])));
self.addEventListener("activate", (event) => event.waitUntil(Promise.all([
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  self.clients.claim(),
])));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !["http:", "https:"].includes(url.protocol) || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || Response.error()));
});
