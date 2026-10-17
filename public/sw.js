const CACHE_PREFIX = "find-tony-";
const APP_CACHE = `${CACHE_PREFIX}app-v6`;
const DATA_CACHE = `${CACHE_PREFIX}data-v6`;
const APP_SHELL_CACHE_KEY = new Request(`${self.location.origin}/__find-tony-app-shell__`);
const CATEGORIES = ["FOODIE", "PARTY", "EVENTS", "CHILL"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const dataCache = await caches.open(DATA_CACHE);
    await Promise.all(CATEGORIES.map(async (category) => {
      try {
        const request = new Request(`/api/vibes?category=${category}&radius=10`);
        const response = await fetch(request);
        if (response.ok) await dataCache.put(request, response);
      } catch (error) {
        console.warn(`Offline cache could not preload ${category} places.`, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== APP_CACHE && name !== DATA_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname === "/api/vibes") {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        const exact = await cache.match(request);
        if (exact) return exact;
        const category = url.searchParams.get("category");
        if (category && CATEGORIES.includes(category)) {
          const fallbackRequest = new Request(`/api/vibes?category=${category}&radius=10`);
          const fallbackResponse = await cache.match(fallbackRequest);
          if (fallbackResponse) {
            const data = await fallbackResponse.json();
            return new Response(JSON.stringify({ ...data, offline: true }), {
              status: 200,
              headers: { "Content-Type": "application/json", "X-Find-Tony-Offline": "true" },
            });
          }
        }
        return new Response(JSON.stringify({ error: "Sydney places are not available offline yet." }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/api/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    const cacheKey = request.mode === "navigate" ? APP_SHELL_CACHE_KEY : request;
    try {
      const response = await fetch(request);
      if (url.pathname.startsWith("/_next/static/") && response.ok) {
        await cache.put(request, response.clone());
      }
      if (url.pathname === "/manifest.webmanifest" && response.ok) {
        await cache.put(request, response.clone());
      }
      if (response.ok) await cache.put(cacheKey, response.clone());
      return response;
    } catch {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      return Response.error();
    }
  })());
});
