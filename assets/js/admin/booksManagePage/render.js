import { auth } from '../state.js';
import { esc, formatBytes } from '../ui.js';
import { canSyncImportFromSource } from '../booksSync.js';

function normalizeCount(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

function canOperate(book) {
  return auth.role !== 'demo' || Number(book?.created_by) === Number(auth.userId);
}

function canSyncBook(book) {
  const status = String(book?.status || 'normal').toLowerCase();
  if (status === 'deleted' || status === 'purging') return false;
  if (!book?.source_is_github) return false;
  if (!canOperate(book)) return false;
  return canSyncImportFromSource(book);
}

function getSourceReadMode(book) {
  const type = String(book?.source_type || '').toLowerCase();
  const name = String(book?.source_name || book?.title || '').toLowerCase();
  if (type.includes('epub') || name.endsWith('.epub')) return 'epub';
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.text')) return 'text';
  return null;
}

function getFilteredBooks(books) {
  const q = String(document.getElementById('books-manage-search')?.value || '').trim().toLowerCase();
  const onlyGh = !!document.getElementById('books-manage-only-gh')?.checked;
  const onlyCanSync = !!document.getElementById('books-manage-only-can-sync')?.checked;

  return (books || []).filter((b) => {
    if (onlyGh && !b.source_is_github) return false;
    if (onlyCanSync && !canSyncBook(b)) return false;
    if (!q) return true;
    const hay = `${b.title || ''} ${b.author || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

export function renderBooksManageList(books) {
  const el = document.getElementById('books-manage-list');
  if (!el) return;

  const list = getFilteredBooks(books);
  if (list.length === 0) {
    el.innerHTML = '<li style="padding:12px 0;color:var(--text-light)">暂无书籍</li>';
    return;
  }

  el.innerHTML = list
    .map((b) => {
      const status = String(b.status || 'normal').toLowerCase();
      const isUnlisted = status === 'unlisted';
      const isDeleted = status === 'deleted';
      const isPurging = status === 'purging';

      const hasSource = !!b.has_source;
      const chapterCount = Number(b.chapter_count || 0) || 0;
      const downloadOnly = chapterCount === 0 && hasSource;
      const sourceMode = downloadOnly ? getSourceReadMode(b) : null;
      const sourceInfo = hasSource ? ` / 源文件 ${formatBytes(b.source_size || 0)}` : '';

      const sourceChapterCount = normalizeCount(b.source_chapter_count);
      const sourceWordCount = normalizeCount(b.source_word_count);
      const isUsingSourceStats = downloadOnly && (sourceChapterCount !== null || sourceWordCount !== null);
      const displayChapterCount = chapterCount > 0 ? chapterCount : sourceChapterCount ?? '—';
      const displayWordCount = chapterCount > 0 ? b.total_words : sourceWordCount ?? '—';
      const sourceStatsBadge = isUsingSourceStats ? ' <span style="font-size:11px;color:var(--text-light)">(源)</span>' : '';

      const statusBadge = (() => {
        if (isUnlisted) return ' <span style="font-size:11px;color:var(--text-light)">(下架)</span>';
        if (isDeleted) return ' <span style="font-size:11px;color:#e67e22">(回收站)</span>';
        if (isPurging) return ' <span style="font-size:11px;color:#e74c3c">(清理中)</span>';
        return '';
      })();

      const ghBadge = b.source_is_github ? ' <span style="font-size:11px;color:var(--text-light)">(直连)</span>' : '';
      const syncable = canSyncBook(b);

      return `
        <li data-id="${b.id}">
          <div style="display:flex;align-items:flex-start;gap:10px;flex:1">
            ${syncable ? '<input type="checkbox" class="book-sync-select" checked>' : '<span style="width:16px"></span>'}
            <div class="item-info">
              <div class="item-title">${esc(b.title)}${ghBadge}${downloadOnly ? ` <span style="font-size:11px;color:var(--text-light)">${sourceMode ? '(源文件可读)' : '(仅可下载)'}</span>` : ''}${statusBadge}</div>
              <div class="item-meta">${b.author ? `${esc(b.author)} / ` : ''}${displayChapterCount} 章 / ${displayWordCount} 字${sourceStatsBadge}${sourceInfo}</div>
            </div>
          </div>
          <div class="item-actions">
            ${sourceMode ? `<a class="btn btn-sm" href="/read?book=${b.id}" target="_blank" rel="noopener">在线读</a>` : ''}
            ${hasSource ? `<a class="btn btn-sm" href="/api/books/${b.id}/source" target="_blank" rel="noopener">下载</a>` : ''}
            ${syncable ? '<button class="btn btn-sm btn-sync-source-import">同步导入</button>' : ''}
          </div>
        </li>
      `;
    })
    .join('');
}

function getAllSelectableCheckboxes() {
  return Array.from(document.querySelectorAll('#books-manage-list input.book-sync-select') || []);
}

export function setAllSelected(checked) {
  for (const cb of getAllSelectableCheckboxes()) cb.checked = checked;
}

export function getSelectedBooks(books) {
  const ids = getAllSelectableCheckboxes()
    .filter((cb) => cb.checked)
    .map((cb) => Number(cb.closest('li[data-id]')?.dataset?.id || 0))
    .filter((id) => Number.isFinite(id) && id > 0);
  const set = new Set(ids);
  return (books || []).filter((b) => set.has(Number(b.id)) && canSyncBook(b));
}

export function refreshBooksManageToolbar({ busy } = {}) {
  const all = getAllSelectableCheckboxes();
  const selected = all.filter((cb) => cb.checked);

  const selectAllEl = document.getElementById('books-manage-select-all');
  if (selectAllEl) {
    selectAllEl.checked = all.length > 0 && selected.length === all.length;
    selectAllEl.indeterminate = selected.length > 0 && selected.length < all.length;
    selectAllEl.disabled = !!busy || all.length === 0;
  }

  const hintEl = document.getElementById('books-manage-selected-hint');
  if (hintEl) hintEl.textContent = all.length > 0 ? `已选 ${selected.length}/${all.length}` : '';

  const batchBtn = document.getElementById('books-manage-batch-sync-btn');
  if (batchBtn) batchBtn.disabled = !!busy || selected.length === 0;
}

