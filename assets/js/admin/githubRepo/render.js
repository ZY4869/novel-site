import { esc, formatBytes } from '../ui.js';

export function renderNovelList(items) {
  const el = document.getElementById('gh-repo-novels-list');
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = '<li style="padding:12px 0;color:var(--text-light)">目录下未找到 TXT/EPUB</li>';
    return;
  }
  el.innerHTML = items
    .map((it) => {
      const kind = String(it.kind || 'file');
      const repoId = it.repo_id ?? it.repoId ?? '';
      const repoPill = it.repoLabel ? `<span class="tag-pill" style="margin-left:6px">${esc(it.repoLabel)}</span>` : '';

      if (kind === 'dir') {
        return `
          <li data-kind="dir" data-repo-id="${esc(repoId)}" data-path="${esc(it.path)}" data-name="${esc(it.name)}">
            <div class="item-info">
              <div class="item-title">📁 ${esc(it.name)}${repoPill}</div>
              <div class="item-meta">${esc(it.path)}</div>
            </div>
            <div class="item-actions">
              <button class="btn btn-sm btn-gh-enter-dir">进入</button>
            </div>
          </li>
        `;
      }

      return `
        <li data-kind="file" data-repo-id="${esc(repoId)}" data-path="${esc(it.path)}" data-name="${esc(it.name)}" data-size="${Number(it.size || 0) || 0}">
          <div class="item-info">
            <label class="gh-select-row">
              <input type="checkbox" class="gh-novel-select" checked>
              <div>
                <div class="item-title">${esc(it.name)}${repoPill}</div>
                <div class="item-meta">${formatBytes(it.size || 0)} / ${esc(it.path)}</div>
              </div>
            </label>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-gh-bind-novel">直连绑定</button>
            <button class="btn btn-sm btn-gh-sync-novel">同步导入</button>
          </div>
        </li>
      `;
    })
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
      const repoId = it.repo_id ?? it.repoId ?? '';
      const repoPill = it.repoLabel ? `<span class="tag-pill" style="margin-left:6px">${esc(it.repoLabel)}</span>` : '';
      const title = isDir ? `📁 ${esc(it.name)}` : `📦 ${esc(it.name)}`;
      const meta = isDir ? `${esc(it.path)}` : `${formatBytes(it.size || 0)} / ${esc(it.path)}`;
      const actions = isDir
        ? '<button class="btn btn-sm btn-gh-comic-pages">扫描页数</button><button class="btn btn-sm btn-gh-bind-comic-dir">直连绑定</button>'
        : '<button class="btn btn-sm btn-gh-sync-comic-cbz">同步导入</button>';

      return `
        <li data-kind="${esc(it.kind)}" data-repo-id="${esc(repoId)}" data-path="${esc(it.path)}" data-name="${esc(it.name)}">
          <div class="item-info">
            <div class="item-title">${title}${repoPill}</div>
            <div class="item-meta">${meta} <span class="gh-pages-hint" style="margin-left:6px"></span></div>
          </div>
          <div class="item-actions">${actions}</div>
        </li>
      `;
    })
    .join('');
}
