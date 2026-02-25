// Service Worker for 我的书架 PWA
const CACHE_NAME = 'novel-site-v9';

// 预缓存优先使用 pretty URL（Cloudflare Pages 默认会将 *.html 308 到无扩展名）
const APP_SHELL = [
  '/',
  '/book',
  '/read',
  '/comics',
  '/comic-read',
  '/style.css',
  '/assets/css/base.css',
  '/assets/css/theme.css',
  '/assets/css/components.css',
  '/assets/css/components/navbar.css',
  '/assets/css/components/buttons.css',
  '/assets/css/components/books.css',
  '/assets/css/components/reader.css',
  '/assets/css/components/messages.css',
  '/assets/css/components/search.css',
  '/assets/css/components/tags.css',
  '/assets/css/pages/read.css',
  '/assets/css/pages/read-base.css',
  '/assets/css/pages/read-modes.css',
  '/assets/css/pages/admin.css',
  '/assets/css/responsive.css',
  '/assets/js/shared/dom.js',
  '/assets/js/shared/theme.js',
  '/assets/js/shared/pwa.js',
  '/assets/js/shared/cover.js',
  '/assets/js/shared/format.js',
  '/assets/js/shared/highlight.js',
  '/assets/js/shared/text.js',
  '/assets/js/shared/epub.js',
  '/assets/js/pages/index.js',
  '/assets/js/pages/index/state.js',
  '/assets/js/pages/index/books.js',
  '/assets/js/pages/index/reading.js',
  '/assets/js/pages/index/search.js',
  '/assets/js/pages/index/siteSettings.js',
  '/assets/js/pages/book.js',
  '/assets/js/pages/book/state.js',
  '/assets/js/pages/book/chapters.js',
  '/assets/js/pages/book/render.js',
  '/assets/js/pages/book/export.js',
  '/assets/js/pages/read.js',
  '/assets/js/read/state.js',
  '/assets/js/read/settings.js',
  '/assets/js/read/pager.js',
  '/assets/js/read/bottomBar.js',
  '/assets/js/read/progress.js',
  '/assets/js/read/shortcuts.js',
  '/assets/js/read/siteSettings.js',
  '/assets/js/read/fonts.js',
  '/assets/js/read/preload.js',
  '/assets/js/read/chapter.js',
  '/assets/js/read/source.js',
  '/assets/js/read/bookmarks.js',
  '/assets/js/read/stats.js',
  '/assets/js/read/immersive.js',
  '/assets/js/pages/comics.js',
  '/assets/js/pages/comic-read.js',
  '/assets/js/pages/404.js',
  '/assets/js/pages/admin.js',
  '/assets/js/admin/index.js',
  '/assets/js/admin/state.js',
  '/assets/js/admin/ui.js',
  '/assets/js/admin/api.js',
  '/assets/js/admin/auth.js',
  '/assets/js/admin/github.js',
  '/assets/js/admin/siteSettings.js',
  '/assets/js/admin/books.js',
  '/assets/js/admin/txtImport.js',
  '/assets/js/admin/txtExport.js',
  '/assets/js/admin/comics.js',
  '/assets/js/admin/chapters.js',
  '/assets/js/admin/batch.js',
  '/assets/js/admin/stats.js',
  '/assets/js/admin/storage.js',
  '/assets/js/admin/users.js',
  '/assets/js/admin/backup.js',
  '/assets/js/admin/fonts.js',
  '/assets/js/admin/epubImport.js',
  '/assets/js/admin/tags.js',
  '/assets/js/admin/bookEditModal.js',
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

const CANONICAL_PAGE = new Map([
  ['/index', '/'],
  ['/index.html', '/'],
  ['/book.html', '/book'],
  ['/read.html', '/read'],
  ['/comics.html', '/comics'],
  ['/comic-read.html', '/comic-read'],
]);

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

  // Admin UI: always network (no caching)
  if (url.pathname === '/admin.html' || url.pathname === '/admin') return;

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
  const canonicalPath = CANONICAL_PAGE.get(url.pathname) || url.pathname;
  const cacheKey = (isAppPage(url.pathname) || isAppPage(canonicalPath) || url.pathname.endsWith('.html'))
    ? new Request(url.origin + canonicalPath)
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
