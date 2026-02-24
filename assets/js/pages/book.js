import { getQueryParam, qs } from '../shared/dom.js';
import { registerServiceWorker } from '../shared/pwa.js';
import { initThemeToggle } from '../shared/theme.js';
import { loadBook } from './book/render.js';

initThemeToggle(qs('.theme-toggle'));
registerServiceWorker();

fetch('/api/settings')
  .then((r) => r.json())
  .then((d) => {
    const s = d.settings || {};
    if (s.site_name) qs('.navbar h1 a').textContent = '📚 ' + s.site_name;
  })
  .catch(() => {});

const bookId = getQueryParam('id');
if (!bookId || !/^\d+$/.test(bookId)) {
  qs('#content').innerHTML = '<div class="msg msg-error">无效的书籍ID</div>';
} else {
  loadBook(bookId);
}

