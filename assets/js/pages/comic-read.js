import { esc, getQueryParam, qs } from '../shared/dom.js';
import { registerServiceWorker } from '../shared/pwa.js';
import { initThemeToggle } from '../shared/theme.js';

initThemeToggle(qs('.theme-toggle'));
registerServiceWorker();
loadSiteSettings();

const comicId = getQueryParam('id');
if (!comicId || !/^\d+$/.test(comicId)) {
  qs('#loading').textContent = '无效的漫画ID';
} else {
  init();
}

let comic = null;
let currentPage = 1;

const ADMIN_PROGRESS_MIN_INTERVAL_MS = 5000;
let lastAdminProgressAt = 0;
let lastAdminProgressKey = '';

function showMsg(text, type) {
  const el = qs('#msg');
  el.className = type ? `msg msg-${type}` : '';
  el.textContent = text || '';
}

function getSavedPage(id) {
  try {
    const v = JSON.parse(localStorage.getItem('comic_reading_' + id));
    return v && v.page ? Number(v.page) : null;
  } catch {
    return null;
  }
}

function saveProgress(id, page, title) {
  try {
    localStorage.setItem('comic_reading_' + id, JSON.stringify({ page, title, time: Date.now() }));
  } catch {}

  reportAdminProgress(id, page);
}

function reportAdminProgress(id, page) {
  const now = Date.now();
  const key = `${id}:${page}`;
  if (key === lastAdminProgressKey && now - lastAdminProgressAt < ADMIN_PROGRESS_MIN_INTERVAL_MS) return;
  lastAdminProgressAt = now;
  lastAdminProgressKey = key;

  try {
    fetch('/api/admin/progress', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'comic', comicId: Number(id), page: Number(page) }),
    }).catch(() => {});
  } catch {}
}

async function init() {
  try {
    const res = await fetch(`/api/comics/${comicId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '加载失败');
    comic = data.comic;
    document.title = (comic.title || '漫画阅读') + ' - 我的书架';
    qs('#breadcrumb').innerHTML = `<a href="/comics">漫画</a><span>›</span><span>${esc(comic.title || '未命名')}</span>`;

    const pageParam = getQueryParam('page');
    const saved = getSavedPage(comicId);
    currentPage = pageParam && /^\d+$/.test(pageParam) ? Number(pageParam) : saved || 1;
    if (currentPage < 1) currentPage = 1;
    if (comic.page_count && currentPage > comic.page_count) currentPage = comic.page_count;

    bindControls();
    await loadPage(currentPage, true);
  } catch (e) {
    showMsg(e.message, 'error');
    qs('#loading').textContent = '加载失败';
  }
}

function bindControls() {
  qs('#prev-btn').addEventListener('click', () => goPage(currentPage - 1));
  qs('#next-btn').addEventListener('click', () => goPage(currentPage + 1));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') goPage(currentPage - 1);
    if (e.key === 'ArrowRight') goPage(currentPage + 1);
  });
}

async function goPage(page) {
  if (!comic) return;
  if (page < 1) return;
  if (comic.page_count && page > comic.page_count) return;
  await loadPage(page, false);
}

async function loadPage(page, replaceState) {
  showMsg('', '');
  const img = qs('#page-img');
  const loading = qs('#loading');
  img.style.display = 'none';
  loading.style.display = '';
  loading.textContent = '加载中...';

  const pageCount = comic?.page_count || 0;
  qs('#page-indicator').textContent = pageCount ? `第 ${page} / ${pageCount} 页` : `第 ${page} 页`;
  qs('#prev-btn').disabled = page <= 1;
  qs('#next-btn').disabled = pageCount ? page >= pageCount : false;

  const url = new URL(location.href);
  url.searchParams.set('id', String(comicId));
  url.searchParams.set('page', String(page));
  if (replaceState) history.replaceState(null, '', url.toString());
  else history.pushState(null, '', url.toString());

  img.alt = comic?.title ? comic.title + ' - ' + page : 'page ' + page;
  img.src = `/api/comics/${comicId}/pages/${page}`;
  currentPage = page;

  const ok = await new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
  });

  loading.style.display = 'none';
  if (!ok) {
    showMsg('加载图片失败，可能该页不存在或网络异常。', 'error');
    return;
  }

  img.style.display = '';
  saveProgress(comicId, page, comic?.title || '');
}

function loadSiteSettings() {
  fetch('/api/settings')
    .then((r) => r.json())
    .then((d) => {
      const s = d.settings || {};
      if (s.site_name) qs('.navbar h1 a').textContent = '📚 ' + s.site_name;
    })
    .catch(() => {});
}
