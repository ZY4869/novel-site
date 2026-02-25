import { api, concurrentUpload, uploadBookSource } from './api.js';
import { refreshAllBooks } from './books.js';
import { auth } from './state.js';
import { showMsg } from './ui.js';
import { parseEpubArrayBuffer } from '../shared/epub.js';

let epubImportFile = null;
let epubChapters = [];

export function initEpubImport() {
  document.getElementById('epub-file')?.addEventListener('change', onEpubFileChange);
  document.getElementById('start-epub-import-btn')?.addEventListener('click', startEpubImport);
  document.getElementById('cancel-epub-import-btn')?.addEventListener('click', () => resetEpub(true));

  document.querySelectorAll('input[name=\"epub-import-mode\"]').forEach((radio) => {
    radio.addEventListener('change', function () {
      const box = document.getElementById('epub-existing-book');
      if (box) box.style.display = this.value === 'existing' ? '' : 'none';
      if (this.value === 'existing') refreshEpubBookSelect();
    });
  });
}

async function refreshEpubBookSelect() {
  try {
    const res = await fetch('/api/books');
    const data = await res.json();
    const sel = document.getElementById('epub-book-select');
    if (!sel) return;
    const allBooks = data.books || [];
    const myBooks = auth.role === 'demo' ? allBooks.filter((b) => b.created_by === auth.userId) : allBooks;
    sel.innerHTML =
      myBooks.length === 0
        ? '<option value=\"\">请先创建一本书</option>'
        : myBooks.map((b) => `<option value=\"${b.id}\">${escapeHtml(b.title)}</option>`).join('');
  } catch {}
}

async function onEpubFileChange() {
  const file = this.files?.[0];
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    epubImportFile = null;
    this.value = '';
    return showMsg('epub-msg', '文件超过 50MB 限制', 'error');
  }
  if (!String(file.name || '').toLowerCase().endsWith('.epub')) {
    epubImportFile = null;
    this.value = '';
    return showMsg('epub-msg', '请选择 .epub 文件', 'error');
  }

  epubImportFile = file;
  setDisplay('epub-preview', 'none');
  setDisplay('epub-parsing-msg', '');
  setDisplay('epub-progress', 'none');
  showMsg('epub-msg', '', '');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const { meta, chapters } = await parseEpubArrayBuffer(arrayBuffer, file.name, JSZip);
    epubChapters = chapters;

    setValue('epub-book-title', meta.title);
    setValue('epub-book-author', meta.author);
    setValue('epub-book-desc', meta.description);

    renderEpubChapters();
    setDisplay('epub-parsing-msg', 'none');
    setDisplay('epub-preview', '');
  } catch (e) {
    setDisplay('epub-parsing-msg', 'none');
    resetEpub(false);
    showMsg('epub-msg', `解析失败：${e.message}`, 'error');
  }
}

function renderEpubChapters() {
  const container = document.getElementById('epub-chapters');
  if (!container) return;

  container.innerHTML = epubChapters
    .map(
      (c, i) => `
        <div style="display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border)">
          <input type="checkbox" class="epub-chk" data-idx="${i}" ${c.checked ? 'checked' : ''}>
          <input type="text" class="epub-title" data-idx="${i}" value="${escapeAttr(c.title)}" style="flex:1;min-width:0;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px">
          <span style="font-size:12px;color:var(--text-light)">${(c.content || '').length.toLocaleString()} 字</span>
        </div>
      `
    )
    .join('');

  container.querySelectorAll('input.epub-chk').forEach((cb) => {
    cb.addEventListener('change', () => {
      const idx = Number(cb.dataset.idx);
      if (epubChapters[idx]) epubChapters[idx].checked = cb.checked;
      updateEpubSummary();
    });
  });

  container.querySelectorAll('input.epub-title').forEach((inp) => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.idx);
      if (epubChapters[idx]) epubChapters[idx].title = inp.value;
    });
  });

  updateEpubSummary();
}

function updateEpubSummary() {
  const checked = epubChapters.filter((c) => c.checked);
  const words = checked.reduce((s, c) => s + (c.content || '').length, 0);
  setText('epub-total', String(checked.length));
  setText('epub-words', words.toLocaleString());
}

async function startEpubImport() {
  const chapters = epubChapters.filter((c) => c.checked);
  if (chapters.length === 0) return showMsg('epub-msg', '没有选中任何章节', 'error');

  const mode = document.querySelector('input[name=\"epub-import-mode\"]:checked')?.value || 'new';
  let bookId;
  if (mode === 'new') {
    const title = document.getElementById('epub-book-title')?.value?.trim() || '';
    if (!title) return showMsg('epub-msg', '请输入书名', 'error');
    const author = document.getElementById('epub-book-author')?.value?.trim() || '';
    const description = document.getElementById('epub-book-desc')?.value?.trim() || '';
    try {
      const res = await api('POST', '/api/admin/books', { title, author, description });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      bookId = data.book.id;
    } catch (e) {
      return showMsg('epub-msg', `创建书籍失败：${e.message}`, 'error');
    }
  } else {
    const v = document.getElementById('epub-book-select')?.value || '';
    if (!v) return showMsg('epub-msg', '请选择目标书籍', 'error');
    bookId = Number(v);
  }

  const bar = document.getElementById('epub-bar');
  const status = document.getElementById('epub-status');
  setDisplay('epub-progress', '');
  if (bar) bar.style.width = '0%';
  if (status) status.textContent = '上传源文件...';

  if (!epubImportFile) return showMsg('epub-msg', '请先选择 EPUB 文件', 'error');
  try {
    await uploadBookSource(bookId, epubImportFile);
  } catch (e) {
    return showMsg('epub-msg', `源文件上传失败：${e.message}`, 'error');
  }

  let done = 0;
  const errors = [];
  const tasks = chapters.map((ch) => () =>
    api('POST', '/api/admin/chapters', { book_id: Number(bookId), title: ch.title, content: ch.content })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json();
          errors.push(`${ch.title}: ${d.error}`);
        }
      })
      .catch((e) => errors.push(`${ch.title}: ${e.message}`))
      .finally(() => {
        done++;
        const pct = Math.round((done / chapters.length) * 100);
        if (bar) bar.style.width = `${pct}%`;
        if (status) status.textContent = `${done}/${chapters.length} 章（${pct}%）`;
      })
  );

  await concurrentUpload(tasks, 3);

  if (errors.length > 0) showMsg('epub-msg', `导入完成，${errors.length} 章失败：${errors.slice(0, 3).join('；')}`, 'error');
  else showMsg('epub-msg', `成功导入 ${chapters.length} 章`, 'success');

  resetEpub(false);
  refreshAllBooks();
}

function resetEpub(clearMsg) {
  epubImportFile = null;
  epubChapters = [];
  setDisplay('epub-preview', 'none');
  setDisplay('epub-parsing-msg', 'none');
  setDisplay('epub-progress', 'none');
  const input = document.getElementById('epub-file');
  if (input) input.value = '';
  const bar = document.getElementById('epub-bar');
  if (bar) bar.style.width = '0%';
  setText('epub-status', '');
  if (clearMsg) showMsg('epub-msg', '', '');
}

function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s) {
  return escapeAttr(s).replace(/'/g, '&#39;');
}

function setDisplay(id, v) {
  const el = document.getElementById(id);
  if (el) el.style.display = v;
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v ?? '');
}

function setValue(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v || '';
}
