import { esc, formatBytes } from '../ui.js';

export function renderNovelList(items) {
  const el = document.getElementById('gh-repo-novels-list');
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = '<li style="padding:12px 0;color:var(--text-light)">目录下未找到 TXT/EPUB</li>';
    return;
  }
  el.innerHTML = items
    .map(
      (it) => `
        <li data-path="${esc(it.path)}" data-name="${esc(it.name)}">
          <div class="item-info">
            <div class="item-title">${esc(it.name)}</div>
            <div class="item-meta">${formatBytes(it.size || 0)} / ${esc(it.path)}</div>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-gh-bind-novel">直连绑定</button>
            <button class="btn btn-sm btn-gh-sync-novel">同步导入</button>
          </div>
        </li>
      `
    )
    .join('');
}

export function renderComicList(items) {
  const el = document.getElementById('gh-repo-comics-list');
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = '<li style="padding:12px 0;color:var(--text-light)">目录下未找到漫画内容</li>';
    return;
  }
  el.innerHTML = items
    .map((it) => {
      const isDir = it.kind === 'dir';
      const title = isDir ? `📁 ${esc(it.name)}` : `📦 ${esc(it.name)}`;
      const meta = isDir ? `${esc(it.path)}` : `${formatBytes(it.size || 0)} / ${esc(it.path)}`;
      const actions = isDir
        ? '<button class="btn btn-sm btn-gh-comic-pages">扫描页数</button><button class="btn btn-sm btn-gh-bind-comic-dir">直连绑定</button>'
        : '<button class="btn btn-sm btn-gh-sync-comic-cbz">同步导入</button>';

      return `
        <li data-kind="${esc(it.kind)}" data-path="${esc(it.path)}" data-name="${esc(it.name)}">
          <div class="item-info">
            <div class="item-title">${title}</div>
            <div class="item-meta">${meta} <span class="gh-pages-hint" style="margin-left:6px"></span></div>
          </div>
          <div class="item-actions">${actions}</div>
        </li>
      `;
    })
    .join('');
}

