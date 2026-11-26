const PAGE_CACHE = 'laikona-v1';
const STATIC_CACHE = 'laikona-static-v1';
const ALLOWED_CACHES = [PAGE_CACHE, STATIC_CACHE];

const PRECACHE_ASSETS = [
  '/manifest.webmanifest',
  '/brand/laikona-avatar.svg',
  '/landing/logo-negro.svg',
  '/landing/logo-blanco.svg',
];

const CACHEABLE_NAV_PREFIXES = [
  '/cita/',
  '/mis-citas',
  '/links',
  '/aviso-de-privacidad',
];

const STATIC_ASSET_PREFIXES = [
  '/landing/',
  '/brand/',
  '/gallery/',
  '/_next/static/',
];

const STATIC_EXACT_PATHS = new Set([
  '/manifest.webmanifest',
  '/favicon.ico',
]);

function isNeverCachePath(pathname) {
  return (
    pathname === '/sw.js' ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/api/')
  );
}

function isCacheableNavigation(pathname) {
  return CACHEABLE_NAV_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

function isStaticAsset(pathname) {
  if (STATIC_EXACT_PATHS.has(pathname)) return true;
  return STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_ASSETS.map((url) =>
            fetch(url)
              .then((res) => {
                if (res && res.ok) {
                  return cache.put(url, res);
                }
                return undefined;
              })
              .catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !ALLOWED_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirstNavigation(request, pathname) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const exactMatch = await cache.match(request);
    if (exactMatch) return exactMatch;
    const pathMatch = await cache.match(pathname);
    if (pathMatch) return pathMatch;
    return new Response(
      '<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión · LAIKONA NAILS</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center;background:#fdf7f8;color:#1c1917"><h1>Sin conexión</h1><p>No pudimos cargar esta vista sin internet. Vuelve a intentarlo al reconectarte.</p></body></html>',
      {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  }
}

async function staleWhileRevalidateAsset(request, event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
        void cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }

  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (isNeverCachePath(url.pathname)) return;

  if (request.mode === 'navigate' && isCacheableNavigation(url.pathname)) {
    event.respondWith(networkFirstNavigation(request, url.pathname));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidateAsset(request, event));
  }
});
