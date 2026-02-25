import { api, uploadBookSource } from './api.js';
import { auth } from './state.js';
import { esc, filenameToTitle, formatBytes, showMsg } from './ui.js';
import { openBookEditOverlay } from './bookEditModal.js';

let booksCache = [];
let booksPromise = null;

export function initBooks() {
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

    if (e.target.classList.contains('btn-delete-book')) {
      if (!confirm(`确定删除《${book.title}》以及其所有章节？此操作不可恢复！`)) return;
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

export async function refreshAllBooks() {
  const data = await fetchBooks();
  renderBookList(data);
  renderBookSelects(data);
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
  const el = document.getElementById('book-list');
  if (!el) return;

  try {
    const books = data.books || [];
    if (books.length === 0) {
      el.innerHTML = '<li style="padding:12px 0;color:var(--text-light)">暂无书籍</li>';
      booksCache = [];
      return;
    }

    booksCache = books;
    el.innerHTML = books
      .map((b) => {
        const isOwner = auth.role !== 'demo' || b.created_by === auth.userId;
        const canDelete = auth.role !== 'demo' || b.created_by === auth.userId;
        const hasSource = !!b.has_source;
        const downloadOnly = (b.chapter_count || 0) === 0 && hasSource;
        const sourceMode = downloadOnly ? getSourceReadMode(b) : null;
        const sourceInfo = hasSource ? ` / 源文件 ${formatBytes(b.source_size || 0)}` : '';
        return `
          <li data-id="${b.id}">
            <div class="item-info">
              <div class="item-title">${esc(b.title)}${
          downloadOnly
            ? ` <span style="font-size:11px;color:var(--text-light)">${sourceMode ? '(源文件可读)' : '(仅可下载)'}</span>`
            : ''
        }${auth.role === 'demo' && !isOwner ? ' <span style="font-size:11px;color:var(--text-light)">(他人)</span>' : ''}</div>
              <div class="item-meta">${b.author ? `${esc(b.author)} / ` : ''}${b.chapter_count} 章 / ${b.total_words} 字${sourceInfo}</div>
            </div>
            <div class="item-actions">
              ${sourceMode ? `<a class="btn btn-sm" href="/read?book=${b.id}" target="_blank" rel="noopener">在线读</a>` : ''}
              ${hasSource ? `<a class="btn btn-sm" href="/api/books/${b.id}/source" target="_blank" rel="noopener">下载</a>` : ''}
              ${isOwner ? '<button class="btn btn-sm btn-edit-book">编辑</button>' : ''}
              ${canDelete ? '<button class="btn btn-sm btn-danger btn-delete-book">删除</button>' : ''}
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

  try {
    const res = await api('POST', '/api/admin/books', { title, author, description });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showMsg('book-msg', `创建成功：${data.book.title}`, 'success');
    if (document.getElementById('book-title')) document.getElementById('book-title').value = '';
    if (document.getElementById('book-author')) document.getElementById('book-author').value = '';
    if (document.getElementById('book-desc')) document.getElementById('book-desc').value = '';
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

    showMsg('source-book-msg', '上传源文件中...', '');
    await uploadBookSource(createdBookId, file);

    showMsg('source-book-msg', `创建成功：${esc(title)}`, 'success');
    if (fileInput) fileInput.value = '';
    if (document.getElementById('source-book-title')) document.getElementById('source-book-title').value = '';
    if (document.getElementById('source-book-author')) document.getElementById('source-book-author').value = '';
    if (document.getElementById('source-book-desc')) document.getElementById('source-book-desc').value = '';
    refreshAllBooks();
  } catch (e) {
    let note = '';
    if (createdBookId) {
      try {
        await api('DELETE', `/api/admin/books/${createdBookId}`);
        note = '（已回滚创建的书籍）';
      } catch {
        note = '（回滚失败，请在书籍列表手动删除刚创建的空书）';
      }
    }
    showMsg('source-book-msg', `${e.message || '失败'}${note}`, 'error');
  }
}
