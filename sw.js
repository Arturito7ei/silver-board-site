/* Static shell for GitHub Pages. Paths are relative to this file so a project
   subpath (…/silver-board-site/) works without a root-absolute URL. */
const CACHE = "silver-board-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./table-totem.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
].map((path) => new URL(path, self.location).href);

const STATIC_EXT = /\.(?:html|css|js|webmanifest|png|jpe?g|webp|gif|svg|ico|json|txt|woff2?)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url, request) {
  if (request.mode === "navigate") return true;
  return STATIC_EXT.test(url.pathname);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === "basic") {
    try {
      await cache.put(request, response.clone());
    } catch (err) {
      console.warn("silver-board cache put failed", request.url, err);
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL("./", self.location).pathname;
  if (!url.pathname.startsWith(scopePath)) return;
  if (!isStaticAsset(url, request)) return;
  event.respondWith(cacheFirst(request));
});
