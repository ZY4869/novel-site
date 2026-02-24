import { api } from './api.js';
import { refreshAllBooks } from './books.js';
import { exportBook, exportChapter } from './txtExport.js';
import { esc, showMsg } from './ui.js';

let chaptersCache = [];

export function initChapters() {
  document.getElementById('create-chapter-btn')?.addEventListener('click', createChapter);

  document.getElementById('manage-book')?.addEventListener('change', loadChapters);

  document.getElementById('chapter-content')?.addEventListener('input', function () {
    const wc = document.getElementById('word-count');
    if (wc) wc.textContent = String(this.value.trim().length);
  });

  document.getElementById('chapter-list')?.addEventListener('click', onChapterListClick);
}

export async function loadChapters() {
  const bookId = document.getElementById('manage-book')?.value || '';
  const el = document.getElementById('chapter-list');
  const exportArea = document.getElementById('export-area');
  const batchBar = document.getElementById('batch-bar');

  if (!bookId) {
    if (el) el.innerHTML = '';
    if (exportArea) exportArea.innerHTML = '';
    chaptersCache = [];
    if (batchBar) batchBar.style.display = 'none';
    return;
  }

  try {
    const res = await fetch(`/api/books/${bookId}`);
    const data = await res.json();
    const chapters = data.chapters || [];
    chaptersCache = chapters;

    if (!el) return;
    if (chapters.length === 0) {
      el.innerHTML = '<li style="padding:12px 0;color:var(--text-light)">暂无章节</li>';
      if (exportArea) exportArea.innerHTML = '';
      if (batchBar) batchBar.style.display = 'none';
      return;
    }

    el.innerHTML = chapters
      .map(
        (c, i) => `
          <li data-id="${c.id}" data-idx="${i}">
            <div style="display:flex;align-items:center;gap:8px;flex:1">
              <input type="checkbox" class="ch-select" data-id="${c.id}">
              <div class="item-info">
                <div class="item-title">${esc(c.title)}</div>
                <div class="item-meta">第 ${c.sort_order} 章 / ${c.word_count} 字</div>
              </div>
            </div>
            <div class="item-actions">
              ${i > 0 ? '<button class="btn btn-sm btn-move-up">↑</button>' : ''}
              ${i < chapters.length - 1 ? '<button class="btn btn-sm btn-move-down">↓</button>' : ''}
              <button class="btn btn-sm btn-export-ch">导出</button>
              <button class="btn btn-sm btn-edit-ch">编辑</button>
              <button class="btn btn-sm btn-danger btn-delete-ch">删除</button>
            </div>
          </li>
        `
      )
      .join('');

    if (batchBar) batchBar.style.display = 'flex';
    const selectAll = document.getElementById('select-all');
    if (selectAll) selectAll.checked = false;
    const selectedCount = document.getElementById('selected-count');
    if (selectedCount) selectedCount.textContent = '已选 0 章';

    if (exportArea) {
      exportArea.innerHTML =
        '<a href="#" id="export-book-link" style="font-size:13px;color:var(--text-light);text-decoration:none;border-bottom:1px dashed var(--text-light)">导出全书 TXT</a>';
      document.getElementById('export-book-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        exportBook(bookId);
      });
    }
  } catch (e) {
    if (el) el.innerHTML = `<li class="msg msg-error">${esc(e.message)}</li>`;
  }
}

async function createChapter() {
  const bookId = document.getElementById('chapter-book')?.value || '';
  const title = document.getElementById('chapter-title')?.value?.trim() || '';
  const content = document.getElementById('chapter-content')?.value?.trim() || '';

  if (!bookId) return showMsg('chapter-msg', '请选择书籍', 'error');
  if (!title) return showMsg('chapter-msg', '请输入章节标题', 'error');
  if (!content) return showMsg('chapter-msg', '请输入章节内容', 'error');

  try {
    const res = await api('POST', '/api/admin/chapters', { book_id: Number(bookId), title, content });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showMsg('chapter-msg', `发布成功：${data.chapter.title}（${data.chapter.word_count} 字）`, 'success');
    if (document.getElementById('chapter-title')) document.getElementById('chapter-title').value = '';
    if (document.getElementById('chapter-content')) document.getElementById('chapter-content').value = '';
    if (document.getElementById('word-count')) document.getElementById('word-count').textContent = '0';

    refreshAllBooks();
    const manageBook = document.getElementById('manage-book');
    if (manageBook && manageBook.value === bookId) loadChapters();
  } catch (e) {
    showMsg('chapter-msg', e.message, 'error');
  }
}

async function onChapterListClick(e) {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const id = Number(li.dataset.id);
  const idx = Number(li.dataset.idx);
  const ch = chaptersCache[idx];
  if (!ch) return;

  if (e.target.classList.contains('btn-move-up') && idx > 0) {
    const prev = chaptersCache[idx - 1];
    try {
      const res = await api('POST', '/api/admin/chapters/swap', { id1: id, id2: prev.id });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      loadChapters();
    } catch (err) {
      showMsg('manage-msg', `排序失败：${err.message}`, 'error');
    }
    return;
  }

  if (e.target.classList.contains('btn-move-down') && idx < chaptersCache.length - 1) {
    const next = chaptersCache[idx + 1];
    try {
      const res = await api('POST', '/api/admin/chapters/swap', { id1: next.id, id2: id });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      loadChapters();
    } catch (err) {
      showMsg('manage-msg', `排序失败：${err.message}`, 'error');
    }
    return;
  }

  if (e.target.classList.contains('btn-export-ch')) {
    exportChapter(id, ch.title);
    return;
  }

  if (e.target.classList.contains('btn-edit-ch')) {
    const newTitle = prompt('章节标题：', ch.title);
    if (newTitle === null) return;
    const editContent = confirm('是否修改正文内容？');
    const body = {};
    if (newTitle.trim()) body.title = newTitle.trim();
    if (editContent) {
      const c = prompt('输入新的正文内容（会完全替换原内容）：', '');
      if (c !== null && c !== undefined && c !== '') body.content = c;
    }
    if (!body.title && !body.content) return;

    try {
      const res = await api('PUT', `/api/admin/chapters/${id}`, body);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      showMsg('manage-msg', '编辑成功', 'success');
      loadChapters();
      refreshAllBooks();
    } catch (err) {
      showMsg('manage-msg', `编辑失败：${err.message}`, 'error');
    }
    return;
  }

  if (e.target.classList.contains('btn-delete-ch')) {
    if (!confirm(`确定删除章节《${ch.title}》吗？`)) return;
    try {
      const res = await api('DELETE', `/api/admin/chapters/${id}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      loadChapters();
      refreshAllBooks();
    } catch (err) {
      showMsg('manage-msg', `删除失败：${err.message}`, 'error');
    }
  }
}

