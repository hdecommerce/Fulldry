// Service worker minimal : rend l'app installable et sert la coquille hors ligne.
// Les appels /api ne sont jamais mis en cache.
const CACHE = "traca-v2";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/logo.png", "/icon-192.png", "/icon-512.png"]))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok && u.origin === location.origin) caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match("/"))));
});
