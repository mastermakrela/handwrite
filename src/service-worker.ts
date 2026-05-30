/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/**
 * Offline-capable service worker so handwrite installs and runs as a PWA.
 * Precaches the built app shell + static assets, then serves cache-first for
 * those and network-first (with cache fallback) for everything else — including
 * SPA navigations, which fall back to the cached shell when offline.
 */
import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `handwrite-${version}`;
const PRECACHE = [...build, ...files];

sw.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => sw.skipWaiting()));
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // precached build/static assets — cache first (they're versioned/immutable)
      if (PRECACHE.includes(url.pathname)) {
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
      }

      try {
        const res = await fetch(request);
        if (res && res.status === 200 && res.type === "basic") cache.put(request, res.clone());
        return res;
      } catch {
        const hit = await cache.match(request);
        if (hit) return hit;
        // SPA fallback: serve the cached app shell for navigations while offline
        if (request.mode === "navigate") {
          const shell = (await cache.match("/")) || (await cache.match("/index.html"));
          if (shell) return shell;
        }
        throw new Error("offline and not in cache");
      }
    })(),
  );
});
