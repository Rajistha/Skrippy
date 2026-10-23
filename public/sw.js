/* Service worker Skrippy. Dua tujuan: aplikasi terbuka cepat, dan laporan terakhir bisa dibaca tanpa jaringan.
 *
 * Yang disimpan di perangkat:
 *  - berkas statis (/_next/static, ikon): cache-first, karena namanya memuat hash isi.
 *  - halaman (navigasi): jaringan dulu, salinan terakhir bila offline; /offline bila belum pernah dibuka.
 *  - data API yang hanya dibaca (profil, dashboard, skripsi, laporan dan temuannya): jaringan dulu, salinan bila offline.
 * Tidak pernah disimpan: teks naskah (/preview), unduhan PDF/DOCX, tautan berbagi, API admin, dan semua metode selain GET.
 * Semua cache berawalan "skrippy-" dan dihapus aplikasi saat pengguna keluar atau sesinya berakhir (src/lib/pwa.ts).
 */
const VERSION = "v1";
const STATIC_CACHE = "skrippy-static-" + VERSION;
const PAGE_CACHE = "skrippy-pages-" + VERSION;
const API_CACHE = "skrippy-api-" + VERSION;
const OFFLINE_URL = "/offline";

/** Data milik pengguna yang boleh disalin untuk dibaca offline. Daftar putih, bukan daftar hitam. */
function shouldCacheApi(pathname) {
  if (pathname === "/api/me" || pathname === "/api/dashboard" || pathname === "/api/theses") {
    return true;
  }
  if (/^\/api\/theses\/[0-9a-f-]{36}$/i.test(pathname)) return true;
  return /^\/api\/checks\/[0-9a-f-]{36}(\/(issues|trend))?$/i.test(pathname);
}

/** Halaman aplikasi yang boleh disalin. Halaman masuk, callback auth, tautan berbagi, dan admin tidak pernah disimpan. */
function shouldCachePage(pathname) {
  return /^\/(dashboard|skripsi|riwayat|profil|laporan)(\/|$)/.test(pathname);
}

function isStaticAsset(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/pwa-icon/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = [STATIC_CACHE, PAGE_CACHE, API_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith("skrippy-") && !keep.includes(n))
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, canStore = true) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // Respons hasil pengalihan tidak boleh dipakai ulang untuk navigasi, jadi tidak disimpan.
    if (response.ok && !response.redirected && canStore) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
}

async function navigate(request) {
  try {
    return await networkFirst(request, PAGE_CACHE, shouldCachePage(new URL(request.url).pathname));
  } catch (error) {
    const cache = await caches.open(PAGE_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
  } else if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.startsWith("/api/") && shouldCacheApi(url.pathname)) {
    event.respondWith(networkFirst(request, API_CACHE));
  }
});
