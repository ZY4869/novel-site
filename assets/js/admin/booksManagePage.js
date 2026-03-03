import { showMsg } from './ui.js';
import { renderBooksManageList, refreshBooksManageToolbar, setAllSelected, getSelectedBooks } from './booksManagePage/render.js';
import { syncBatchBooks, syncOneBook } from './booksManagePage/sync.js';

let booksCache = [];
let busy = false;
let abortRequested = false;

export function initBooksManagePage() {
  const overlay = document.getElementById('books-manage-overlay');
  document.getElementById('open-books-manage-btn')?.addEventListener('click', () => openOverlay());
  document.getElementById('close-books-manage')?.addEventListener('click', () => closeOverlay());
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });

  document.getElementById('books-manage-search')?.addEventListener('input', () => render());
  document.getElementById('books-manage-only-gh')?.addEventListener('change', () => render());
  document.getElementById('books-manage-only-can-sync')?.addEventListener('change', () => render());

  document.getElementById('books-manage-select-all')?.addEventListener('change', (e) => {
    if (busy) return;
    setAllSelected(!!e.target.checked);
    refreshBooksManageToolbar({ busy });
  });

  document.getElementById('books-manage-list')?.addEventListener('change', (e) => {
    if (!e.target?.classList?.contains('book-sync-select')) return;
    refreshBooksManageToolbar({ busy });
  });

  document.getElementById('books-manage-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn || busy) return;
    if (!btn.classList.contains('btn-sync-source-import')) return;

    const li = btn.closest('li[data-id]');
    if (!li) return;
    const id = Number(li.dataset.id);
    const book = booksCache.find((b) => Number(b.id) === id);
    if (!book) return;

    if (!confirm(`确定把《${book.title}》改为“同步导入”吗？\n将下载源文件并导入为章节，同时把源文件保存到 R2。`)) return;
    await runSyncOne(book);
  });

  document.getElementById('books-manage-batch-sync-btn')?.addEventListener('click', async () => {
    if (busy) return;
    const selected = getSelectedBooks(booksCache);
    if (selected.length === 0) return showMsg('books-manage-msg', '请先勾选要同步导入的书籍', 'error');

    if (
      !confirm(
        `确定批量同步导入 ${selected.length} 本书吗？\n将逐本下载源文件并导入为章节，同时把源文件保存到 R2。`
      )
    ) {
      return;
    }
    await runSyncBatch(selected);
  });

  document.getElementById('books-manage-batch-cancel-btn')?.addEventListener('click', () => {
    abortRequested = true;
    showMsg('books-manage-msg', '正在停止...', '');
  });
}

export function updateBooksManagePage(books) {
  booksCache = Array.isArray(books) ? books : [];
  if (isOpen()) render();
}

function isOpen() {
  return document.getElementById('books-manage-overlay')?.classList.contains('active');
}

function openOverlay() {
  document.getElementById('books-manage-overlay')?.classList.add('active');
  render();
}

function closeOverlay() {
  if (busy) return;
  document.getElementById('books-manage-overlay')?.classList.remove('active');
}

function setBusy(v) {
  busy = !!v;

  const disable = busy;
  ['books-manage-search', 'books-manage-only-gh', 'books-manage-only-can-sync', 'books-manage-select-all'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = disable;
  });

  document.querySelectorAll('#books-manage-list button, #books-manage-list input.book-sync-select').forEach((el) => {
    el.disabled = disable;
  });

  refreshBooksManageToolbar({ busy });
}

function showCancelBtn(visible) {
  const el = document.getElementById('books-manage-batch-cancel-btn');
  if (!el) return;
  el.style.display = visible ? '' : 'none';
}

function render() {
  renderBooksManageList(booksCache);
  refreshBooksManageToolbar({ busy });
}

async function runSyncOne(book) {
  abortRequested = false;
  showCancelBtn(true);
  setBusy(true);

  try {
    await syncOneBook(book, {
      onStatus: (t) => showMsg('books-manage-msg', t, ''),
      onProgress: ({ done, total, pct }) => showMsg('books-manage-msg', `${done}/${total} 章（${pct}%）`, ''),
    });
    showMsg('books-manage-msg', `同步导入完成：《${book.title}》`, 'success');
    document.dispatchEvent(new CustomEvent('books:refresh', { detail: { bookId: Number(book.id) } }));
  } catch (e) {
    showMsg('books-manage-msg', e.message || '同步导入失败', 'error');
  } finally {
    showCancelBtn(false);
    setBusy(false);
  }
}

async function runSyncBatch(books) {
  abortRequested = false;
  showCancelBtn(true);
  setBusy(true);

  try {
    const result = await syncBatchBooks(books, {
      shouldAbort: () => abortRequested,
      onStatus: ({ idx, total, title, status }) =>
        showMsg('books-manage-msg', `(${idx}/${total}) ${title} - ${status}`, ''),
      onProgress: ({ idx, total, title, done, totalChapters, pct }) =>
        showMsg('books-manage-msg', `(${idx}/${total}) ${title} - ${done}/${totalChapters} 章（${pct}%）`, ''),
    });

    const stopped = result.aborted ? '（已停止）' : '';
    showMsg('books-manage-msg', `批量同步导入完成${stopped}：成功 ${result.ok}，失败 ${result.fail}`, result.fail ? 'error' : 'success');
    if (result.ok > 0) document.dispatchEvent(new CustomEvent('books:refresh', { detail: { bookId: result.lastOkId } }));
  } finally {
    showCancelBtn(false);
    setBusy(false);
  }
}

