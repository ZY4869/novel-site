// Service Worker for 我的书架 PWA
const CACHE_NAME = 'novel-site-v6';

// 预缓存使用 .html 版本，避免本地/其他静态托管环境没有 pretty URL 时安装失败
const APP_SHELL = [
  '/',
  '/index.html',
  '/book.html',
  '/read.html',
  '/comics.html',
  '/comic-read.html',
  '/style.css',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

// 运行时允许缓存 pretty URL 与 .html 两种访问方式
const APP_PAGE_PATHS = new Set([
  '/',
  '/index', '/index.html',
  '/book', '/book.html',
  '/read', '/read.html',
  '/comics', '/comics.html',
  '/comic-read', '/comic-read.html',
]);

function isAppPage(pathname) {
  return APP_PAGE_PATHS.has(pathname);
}

function isSourceDownload(pathname) {
  return /^\/api\/books\/\d+\/source$/.test(pathname) || /^\/api\/comics\/\d+\/source$/.test(pathname);
}

function shouldCacheApiResponse(url, res) {
  if (isSourceDownload(url.pathname)) return false;
  const cd = (res.headers.get('Content-Disposition') || '').toLowerCase();
  if (cd.includes('attachment')) return false;
  const ct = (res.headers.get('Content-Type') || '').toLowerCase();
  if (ct.startsWith('image/')) return false;
  return true;
}

// Install: cache app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategies
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET
  if (e.request.method !== 'GET') return;

  // Skip non-HTTP(S) and cross-origin requests (e.g. browser extensions / CDNs)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;

  // Admin API: always network (no caching)
  if (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/api/auth')) return;

  // Cover images: Cache First
  if (url.pathname.startsWith('/api/covers/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        });
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // API requests: Network First + Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok && shouldCacheApiResponse(url, res)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell & static: Cache First
  // 对带 query 的页面（book/read/comic-read）按 pathname 归一化，避免缓存膨胀
  const cacheKey = (isAppPage(url.pathname) || url.pathname.endsWith('.html'))
    ? new Request(url.origin + url.pathname)
    : e.request;

  e.respondWith(
    caches.match(cacheKey).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('.html') || isAppPage(url.pathname))) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, clone));
        }
        return res;
      });
    }).catch(() => caches.match('/'))
  );
});
