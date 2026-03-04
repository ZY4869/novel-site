import { api, uploadBookSource } from './api.js';
import { auth } from './state.js';
import { esc, filenameToTitle, formatBytes, showMsg } from './ui.js';
import { openBookEditOverlay } from './bookEditModal.js';
import { initBooksManagePage, updateBooksManagePage } from './booksManagePage.js';
import { canSyncImportFromSource, syncImportFromBookSource } from './booksSync.js';
import { computeSourceMetaFromArrayBuffer, computeSourceMetaFromFile, saveSourceMeta, uploadCoverIfEmpty } from './sourceMeta.js';
import { createCategoryPicker } from './categories/picker.js';

let booksCache = [];
let booksPromise = null;
let syncingSourceImport = false;
let bookSearchQuery = '';
let bookCreateCategoryPicker = null;

export function initBooks() {
  initBooksManagePage();

  const pickerEl = document.getElementById('book-category-picker');
  if (pickerEl) bookCreateCategoryPicker = createCategoryPicker({ container: pickerEl });

  const search = document.getElementById('book-search');
  search?.addEventListener('input', () => {
    bookSearchQuery = String(search.value || '')
      .trim()
      .toLowerCase();
    renderBookListFromCache();
  });

  document.addEventListener('books:refresh', async (e) => {
    await refreshAllBooks();
    const bookId = Number(e?.detail?.bookId || 0) || null;
    if (!bookId) return;
    const manageBook = document.getElementById('manage-book');
    if (manageBook && String(manageBook.value || '') === String(bookId)) {
      manageBook.dispatchEvent(new Event('change'));
    }
  });

  document.getElementById('create-book-btn')?.addEventListener('click', createBook);
  document.getElementById('create-book-from-source-btn')?.addEventListener('click', createBookFromSource);

  document.getElementById('source-file')?.addEventListener('change', function () {
    const file = this.files?.[0];
    if (!file) return;
    const titleEl = document.getElementById('source-book-title');
    if (titleEl && !titleEl.value.trim()) titleEl.value = filenameToTitle(file.name);
  });

  document.getElementById('book-list')?.addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = Number(li.dataset.id);
    const book = booksCache.find((b) => b.id === id);
    if (!book) return;

	    if (e.target.classList.contains('btn-edit-book')) {
	      openBookEditOverlay(book);
	      return;
	    }

	    if (e.target.classList.contains('btn-fix-source-meta')) {
	      await fixSourceMeta(book);
	      return;
	    }

	    if (e.target.classList.contains('btn-sync-source-import')) {
	      await syncImportFromSourceToLocal(book);
	      return;
	    }

	    if (e.target.classList.contains('btn-unlist-book')) {
	      if (!confirm(`确定下架《${book.title}》？下架后将对外隐藏，可随时恢复。`)) return;
	      await runBookStatusAction(id, 'unlist');
	      return;
	    }

    if (e.target.classList.contains('btn-restore-book')) {
      if (!confirm(`确定恢复《${book.title}》？`)) return;
      await runBookStatusAction(id, 'restore');
      return;
    }

    if (e.target.classList.contains('btn-purge-book')) {
      if (
        !confirm(
          `彻底清理《${book.title}》？\n\n这会删除：书籍、章节、封面、源文件、批注与举报等数据，且不可恢复！`
        )
      ) {
        return;
      }
      await runBookStatusAction(id, 'purge');
      return;
    }

    if (e.target.classList.contains('btn-delete-book')) {
      if (
        !confirm(
          `确定删除《${book.title}》？\n\n将进入回收站（软删除），30 天后自动清理。\n你可在此期间恢复；超级管理员可“彻底清理”。`
        )
      ) {
        return;
      }
      try {
        const res = await api('DELETE', `/api/admin/books/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await refreshAllBooks();

        const chapterSelect = document.getElementById('chapter-book');
        if (chapterSelect && Number(chapterSelect.value) === id) {
          chapterSelect.value = '';
          const chapterList = document.getElementById('chapter-list');
          if (chapterList) chapterList.innerHTML = '';
        }
      } catch (err) {
        alert(`删除失败：${err.message}`);
      }
    }
  });
}

async function runBookStatusAction(bookId, action) {
  try {
    const res = await api('POST', `/api/admin/books/${bookId}`, { action });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '操作失败');
    await refreshAllBooks();
  } catch (e) {
    alert(e.message || '操作失败');
  }
}

function normalizeCount(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

async function fixSourceMeta(book) {
  const size = Number(book?.source_size || 0);
  if (Number.isFinite(size) && size > 50 * 1024 * 1024) {
    alert('源文件超过 50MB，无法在浏览器内解析回填。请重新上传较小源文件。');
    return;
  }

  if (!confirm(`修复《${book.title}》的源信息？\n\n将下载并解析源文件，用于回填章数/字数与封面（如无封面）。`)) return;

  try {
    const res = await fetch(`/api/books/${book.id}/source`);
    if (!res.ok) throw new Error(res.status === 404 ? '源文件不存在' : '源文件下载失败');
    const ab = await res.arrayBuffer();

    const meta = await computeSourceMetaFromArrayBuffer(
      ab,
      { name: book.source_name || book.title || 'book', type: book.source_type || '' },
      globalThis.JSZip
    );
    if (!meta) throw new Error('该源文件格式暂不支持在线解析');

    await saveSourceMeta(book.id, meta);

    let coverErr = null;
    if (meta.coverBlob) {
      try {
        await uploadCoverIfEmpty(book.id, meta.coverBlob);
      } catch (e) {
        coverErr = e;
      }
    }

    await refreshAllBooks();
    alert(coverErr ? `章数/字数已回填，但封面提取失败：${coverErr.message || '未知错误'}` : '修复完成');
  } catch (e) {
    alert(`修复失败：${e.message || '未知错误'}`);
  }
}

async function syncImportFromSourceToLocal(book) {
  if (syncingSourceImport) return;
  if (!book?.source_is_github) return alert('仅支持直连绑定（GitHub）的书籍同步导入');
  if (!canSyncImportFromSource(book)) return alert('该书籍不满足同步导入条件（需 TXT/EPUB 且未生成章节，且 ≤50MB）');

  if (
    !confirm(
      `确定把《${book.title}》改为“同步导入”吗？\n\n将下载源文件并导入为章节，同时把源文件保存到 R2。`
    )
  ) {
    return;
  }

  try {
    syncingSourceImport = true;
    await syncImportFromBookSource(book, {
      onStatus: (t) => showMsg('book-list-msg', t, ''),
      onProgress: ({ done, total, pct }) => showMsg('book-list-msg', `${done}/${total} 章（${pct}%）`, ''),
    });
    showMsg('book-list-msg', `同步导入完成：《${book.title}》`, 'success');
    document.dispatchEvent(new CustomEvent('books:refresh', { detail: { bookId: Number(book.id) } }));
  } catch (e) {
    showMsg('book-list-msg', e.message || '同步导入失败', 'error');
  } finally {
    syncingSourceImport = false;
  }
}

export async function refreshAllBooks() {
  const data = await fetchBooks();
  renderBookList(data);
  renderBookSelects(data);
  updateBooksManagePage(data.books || []);
}

export async function loadBookSelects() {
  const data = await fetchBooks();
  renderBookSelects(data);
}

async function fetchBooks() {
  if (!booksPromise) {
    booksPromise = fetch('/api/books')
      .then((r) => r.json())
      .then((d) => {
        booksPromise = null;
        return d;
      })
      .catch((e) => {
        booksPromise = null;
        throw e;
      });
  }
  return booksPromise;
}

function renderBookList(data) {
  const books = data.books || [];
  booksCache = Array.isArray(books) ? books : [];
  renderBookListFromCache();
}

function renderBookListFromCache() {
  const el = document.getElementById('book-list');
  if (!el) return;

  try {
    const all = Array.isArray(booksCache) ? booksCache : [];
    if (all.length === 0) {
      el.innerHTML = '<li style="padding:12px 0;color:var(--text-light)">暂无书籍</li>';
      return;
    }

    const q = String(bookSearchQuery || '').trim();
    const books = q
      ? all.filter((b) => {
          const t = String(b?.title || '').toLowerCase();
          const a = String(b?.author || '').toLowerCase();
          return t.includes(q) || a.includes(q);
        })
      : all;

    if (books.length === 0) {
      el.innerHTML = '<li style="padding:12px 0;color:var(--text-light)">无匹配结果</li>';
      return;
    }

    el.innerHTML = books
      .map((b) => {
        const status = String(b.status || 'normal').toLowerCase();
        const isNormal = !status || status === 'normal';
        const isUnlisted = status === 'unlisted';
        const isDeleted = status === 'deleted';
        const isPurging = status === 'purging';

        const isOwner = auth.role !== 'demo' || b.created_by === auth.userId;
        const canOperate = auth.role !== 'demo' || b.created_by === auth.userId;
        const hasSource = !!b.has_source;
        const downloadOnly = (b.chapter_count || 0) === 0 && hasSource;
        const sourceMode = downloadOnly ? getSourceReadMode(b) : null;
        const canSyncFromSource = downloadOnly && canOperate && !!b.source_is_github && canSyncImportFromSource(b);

        const sourceChapterCount = normalizeCount(b.source_chapter_count);
        const sourceWordCount = normalizeCount(b.source_word_count);
        const isUsingSourceStats = downloadOnly && (sourceChapterCount !== null || sourceWordCount !== null);
        const displayChapterCount = (b.chapter_count || 0) > 0 ? b.chapter_count : sourceChapterCount ?? '—';
        const displayWordCount = (b.chapter_count || 0) > 0 ? b.total_words : sourceWordCount ?? '—';

        const chapterText =
          typeof displayChapterCount === 'number' ? displayChapterCount.toLocaleString('zh-CN') : String(displayChapterCount);
        const wordText = typeof displayWordCount === 'number' ? displayWordCount.toLocaleString('zh-CN') : String(displayWordCount);

        const badges = [];
        if (b.pinned_at) badges.push('<span class="badge badge-pinned">置顶</span>');
        if (downloadOnly) badges.push(`<span class="badge badge-source-mode">${sourceMode ? '源文件可读' : '仅可下载'}</span>`);
        if (downloadOnly && b.source_is_github) badges.push('<span class="badge badge-gh">直连</span>');
        if (isUsingSourceStats) badges.push('<span class="badge badge-source-stats">源</span>');
        if (isUnlisted) badges.push('<span class="badge badge-warn">下架</span>');
        if (isDeleted) badges.push('<span class="badge badge-warn">回收站</span>');
        if (isPurging) badges.push('<span class="badge badge-danger">清理中</span>');
        if (auth.role === 'demo' && !isOwner) badges.push('<span class="badge">他人</span>');

        const deleteAtText = (() => {
          if (!b.delete_at) return '';
          const d = new Date(b.delete_at);
          if (!Number.isFinite(d.getTime())) return '';
          const ds = d.toLocaleDateString('zh-CN');
          return `预计清理 ${ds}`;
        })();

        const chips = [];
        if (b.author) chips.push(`<span class="chip chip-author">作者：${esc(b.author)}</span>`);
        chips.push(`<span class="chip chip-chapters">${esc(chapterText)} 章</span>`);
        chips.push(`<span class="chip chip-words">${esc(wordText)} 字</span>`);
        if (hasSource) chips.push(`<span class="chip chip-source">源文件 ${esc(formatBytes(b.source_size || 0))}</span>`);
        if (isDeleted && deleteAtText) chips.push(`<span class="chip chip-muted chip-delete-at">${esc(deleteAtText)}</span>`);

        const categories = Array.isArray(b.categories) ? b.categories : [];
        for (const c of categories) {
          const isSpecial = !!c?.is_special;
          const cls = ['chip', 'chip-category', isSpecial ? 'chip-category-special' : ''].filter(Boolean).join(' ');
          chips.push(`<span class="${cls}">分类：${esc(c?.name || '')}</span>`);
        }

        const inlineParts = [`<span class="item-title book-inline-title">${esc(b.title)}</span>`]
          .concat(badges)
          .concat(chips);

        return `
          <li data-id="${b.id}" class="book-item">
            <div class="item-info">
              <div class="book-inline-row">${inlineParts.join('')}</div>
            </div>
            <div class="item-actions">
              ${sourceMode ? `<a class="btn btn-sm" href="/read?book=${b.id}" target="_blank" rel="noopener">在线读</a>` : ''}
              ${hasSource ? `<a class="btn btn-sm" href="/api/books/${b.id}/source" target="_blank" rel="noopener">下载</a>` : ''}
              ${downloadOnly && canOperate ? '<button class="btn btn-sm btn-fix-source-meta">修复源信息</button>' : ''}
              ${canSyncFromSource ? '<button class="btn btn-sm btn-sync-source-import">同步导入</button>' : ''}
              ${isOwner ? '<button class="btn btn-sm btn-edit-book">编辑</button>' : ''}
              ${canOperate && isNormal ? '<button class="btn btn-sm btn-unlist-book">下架</button>' : ''}
              ${canOperate && (isUnlisted || isDeleted) ? '<button class="btn btn-sm btn-restore-book">恢复</button>' : ''}
              ${
                canOperate && isDeleted && auth.role === 'super_admin'
                  ? '<button class="btn btn-sm btn-danger btn-purge-book">彻底清理</button>'
                  : ''
              }
              ${canOperate && (isNormal || isUnlisted) ? '<button class="btn btn-sm btn-danger btn-delete-book">删除</button>' : ''}
            </div>
          </li>
        `;
      })
      .join('');
  } catch (e) {
    el.innerHTML = `<li class="msg msg-error">${esc(e.message)}</li>`;
  }
}

function getSourceReadMode(book) {
  const type = String(book?.source_type || '').toLowerCase();
  const name = String(book?.source_name || book?.title || '').toLowerCase();
  if (type.includes('epub') || name.endsWith('.epub')) return 'epub';
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.text')) return 'text';
  return null;
}

function renderBookSelects(data) {
  try {
    const allBooks = data.books || [];
    const myBooks = auth.role === 'demo' ? allBooks.filter((b) => b.created_by === auth.userId) : allBooks;
    const opts =
      myBooks.length === 0
        ? '<option value="">请先创建一本书</option>'
        : myBooks.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join('');

    const chapterBook = document.getElementById('chapter-book');
    if (chapterBook) chapterBook.innerHTML = opts;
    const importBook = document.getElementById('import-book');
    if (importBook) importBook.innerHTML = opts;
    const manageBook = document.getElementById('manage-book');
    if (manageBook) manageBook.innerHTML = `<option value=\"\">选择书籍...</option>${opts}`;
  } catch {}
}

async function createBook() {
  const title = document.getElementById('book-title')?.value?.trim() || '';
  const author = document.getElementById('book-author')?.value?.trim() || '';
  const description = document.getElementById('book-desc')?.value?.trim() || '';
  if (!title) return showMsg('book-msg', '请输入书名', 'error');
  const category_ids = bookCreateCategoryPicker?.getSelectedIds?.() || [];

  try {
    const res = await api('POST', '/api/admin/books', { title, author, description, category_ids });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showMsg('book-msg', `创建成功：${data.book.title}`, 'success');
    if (document.getElementById('book-title')) document.getElementById('book-title').value = '';
    if (document.getElementById('book-author')) document.getElementById('book-author').value = '';
    if (document.getElementById('book-desc')) document.getElementById('book-desc').value = '';
    bookCreateCategoryPicker?.setSelectedIds?.([]);
    refreshAllBooks();
  } catch (e) {
    showMsg('book-msg', e.message, 'error');
  }
}

async function createBookFromSource() {
  const fileInput = document.getElementById('source-file');
  const file = fileInput?.files?.[0];
  if (!file) return showMsg('source-book-msg', '请选择文件', 'error');
  if (file.size > 200 * 1024 * 1024) return showMsg('source-book-msg', '文件超过 200MB 限制', 'error');

  const title =
    (document.getElementById('source-book-title')?.value?.trim() || filenameToTitle(file.name)).slice(0, 200);
  const author = (document.getElementById('source-book-author')?.value?.trim() || '').slice(0, 100);
  const description = (document.getElementById('source-book-desc')?.value?.trim() || '').slice(0, 2000);
  if (!title) return showMsg('source-book-msg', '请输入书名', 'error');

  showMsg('source-book-msg', '创建中...', '');
  let createdBookId = null;
  try {
    const res = await api('POST', '/api/admin/books', { title, author, description });
    const data = await res.json();
	    if (!res.ok) throw new Error(data.error);
	    createdBookId = data.book.id;

	    let meta = null;
	    let note = '';
	    try {
	      showMsg('source-book-msg', '解析源文件中...', '');
	      meta = await computeSourceMetaFromFile(file, globalThis.JSZip);
	    } catch (e) {
	      note = `（源文件解析失败：${e.message || '未知错误'}）`;
	      meta = null;
	    }

	    showMsg('source-book-msg', '上传源文件中...', '');
	    await uploadBookSource(
	      createdBookId,
	      file,
	      meta ? { chapterCount: meta.chapterCount, wordCount: meta.wordCount } : undefined
	    );

	    if (meta?.coverBlob) {
	      try {
	        await uploadCoverIfEmpty(createdBookId, meta.coverBlob);
	      } catch (e) {
	        note += note ? `；封面提取失败：${e.message || '未知错误'}` : `（封面提取失败：${e.message || '未知错误'}）`;
	      }
	    }

	    showMsg('source-book-msg', `创建成功：${esc(title)}${note}`, 'success');
	    if (fileInput) fileInput.value = '';
	    if (document.getElementById('source-book-title')) document.getElementById('source-book-title').value = '';
	    if (document.getElementById('source-book-author')) document.getElementById('source-book-author').value = '';
	    if (document.getElementById('source-book-desc')) document.getElementById('source-book-desc').value = '';
	    refreshAllBooks();
	  } catch (e) {
    let note = '';
    if (createdBookId) {
      try {
        const delRes = await api('DELETE', `/api/admin/books/${createdBookId}`);
        if (!delRes.ok) throw new Error('delete failed');
        let purged = false;
        if (delRes.ok && auth.role === 'super_admin') {
          try {
            const purgeRes = await api('POST', `/api/admin/books/${createdBookId}`, { action: 'purge' });
            purged = purgeRes.ok;
          } catch {}
        }
        note = purged ? '（已彻底清理创建的书籍）' : '（已标记删除创建的书籍，可在回收站恢复或等待自动清理）';
      } catch {
        note = '（清理失败，请在书籍列表手动删除刚创建的空书）';
      }
    }
    showMsg('source-book-msg', `${e.message || '失败'}${note}`, 'error');
  }
}
