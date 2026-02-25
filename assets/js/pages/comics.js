import { coverColor } from '../shared/cover.js';
import { esc, qs } from '../shared/dom.js';
import { registerServiceWorker } from '../shared/pwa.js';
import { initThemeToggle } from '../shared/theme.js';

initThemeToggle(qs('.theme-toggle'));
registerServiceWorker();
loadSiteSettings();
loadComics();

async function loadComics() {
  const el = qs('#content');
  try {
    const res = await fetch('/api/comics');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '加载失败');
    const comics = data.comics || [];
    if (comics.length === 0) {
      el.className = '';
      el.innerHTML = '<div class="empty"><p>🖼️ 暂无漫画</p><p>去<a href="/admin">管理后台</a>导入一本 CBZ 吧</p></div>';
      return;
    }
    el.className = 'book-grid-cover';
    el.innerHTML = comics
      .map((c) => {
        const title = c.title || '未命名';
        const meta = `${c.page_count || 0} 页`;
        if (c.cover_url) {
          return `<a class="book-card-cover" href="/comic-read?id=${c.id}">
            <img class="cover-img" src="${esc(c.cover_url)}" alt="${esc(title)}" loading="lazy">
            <div class="card-body">
              <h3>${esc(title)}</h3>
              <div class="meta">${esc(meta)}</div>
            </div>
          </a>`;
        }
        const color = coverColor(title);
        const firstChar = (title || '?')[0];
        return `<a class="book-card-cover" href="/comic-read?id=${c.id}">
          <div class="cover-placeholder" style="background:${color}">${esc(firstChar)}</div>
          <div class="card-body">
            <h3>${esc(title)}</h3>
            <div class="meta">${esc(meta)}</div>
          </div>
        </a>`;
      })
      .join('');
  } catch (e) {
    el.className = '';
    el.innerHTML = `<div class="msg msg-error">${esc(e.message)}</div>`;
  }
}

function loadSiteSettings() {
  fetch('/api/settings')
    .then((r) => r.json())
    .then((d) => {
      const s = d.settings || {};
      if (s.site_name) qs('.navbar h1 a').textContent = '📚 ' + s.site_name;
      if (s.site_desc) qs('meta[name="description"]').content = s.site_desc;
      document.title = s.site_name ? '漫画 - ' + s.site_name : '漫画 - 我的书架';
    })
    .catch(() => {});
}
