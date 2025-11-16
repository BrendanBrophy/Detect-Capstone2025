// ---- sw.js (service worker) ----

const TILE_CACHE = "satellite-tiles-v1";

// receive list of tile URLs and cache them
self.addEventListener("message", async (event) => {
  const data = event.data || {};
  if (data.type !== "CACHE_TILES" || !Array.isArray(data.urls)) return;

  const { areaId, urls } = data;
  const cache = await caches.open(TILE_CACHE);
  const total = urls.length;
  let done = 0;

  for (const url of urls) {
    try {
      const req = new Request(url, { mode: "cors" });
      const resp = await fetch(req);
      if (resp.ok) {
        await cache.put(req, resp.clone());
      }
    } catch (e) {
      // ignore individual failures
    }
    done++;

    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.postMessage({
        type: "CACHE_PROGRESS",
        areaId,
        done,
        total
      });
    }
  }

  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({
      type: "CACHE_DONE",
      areaId,
      total
    });
  }
});

// cache-first for map tiles
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // adapt this condition to your actual tile domain/pattern
  if (url.origin === "https://tile.openstreetmap.org") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(TILE_CACHE);
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const resp = await fetch(event.request);
          if (resp.ok) {
            cache.put(event.request, resp.clone());
          }
          return resp;
        } catch (e) {
          // if network fails and no cache, just fail
          return cached || Response.error();
        }
      })()
    );
  }
});
