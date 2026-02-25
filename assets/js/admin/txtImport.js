import { api, concurrentUpload, uploadBookSource } from './api.js';
import { refreshAllBooks } from './books.js';
import { filenameToTitle, showMsg } from './ui.js';
import { decodeText, splitTextBySize, splitTextChapters } from '../shared/text.js';

let txtImportFile = null;
let parsedChapters = [];

export function initTxtImport() {
  document.querySelectorAll('input[name=\"txt-import-mode\"]').forEach((radio) => {
    radio.addEventListener('change', toggleTxtImportMode);
  });
  toggleTxtImportMode();

  document.getElementById('import-file')?.addEventListener('change', onFileChange);
  document.getElementById('start-import-btn')?.addEventListener('click', startImport);
  document.getElementById('cancel-import-btn')?.addEventListener('click', cancelImport);

  document.getElementById('import-chapters')?.addEventListener('change', () => updateImportSummary());
}

function toggleTxtImportMode() {
  const mode = document.querySelector('input[name=\"txt-import-mode\"]:checked')?.value || 'existing';
  const existing = document.getElementById('txt-existing-book');
  const newBox = document.getElementById('txt-new-book');
  if (existing) existing.style.display = mode === 'existing' ? '' : 'none';
  if (newBox) newBox.style.display = mode === 'new' ? '' : 'none';

  if (mode === 'new') {
    const titleEl = document.getElementById('txt-book-title');
    if (titleEl && !titleEl.value.trim() && txtImportFile) titleEl.value = filenameToTitle(txtImportFile.name);
  }
}

async function onFileChange() {
  const file = this.files?.[0];
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    txtImportFile = null;
    this.value = '';
    return showMsg('import-msg', '文件超过 50MB 限制', 'error');
  }

  txtImportFile = file;
  showMsg('import-msg', '正在解析文件...', '');

  try {
    const buffer = await file.arrayBuffer();
    const text = decodeText(buffer);
    parsedChapters = splitTextChapters(text) || splitTextBySize(text, 6000);
    renderPreview();
    showMsg('import-msg', '', '');
    toggleTxtImportMode();
  } catch (e) {
    parsedChapters = [];
    showMsg('import-msg', `文件解析失败：${e.message}`, 'error');
  }
}

function renderPreview() {
  const preview = document.getElementById('import-preview');
  const list = document.getElementById('import-chapters');
  if (!preview || !list) return;

  preview.style.display = 'block';

  if (parsedChapters.length === 0) {
    list.innerHTML = '<div style=\"padding:12px;color:var(--text-light)\">未识别到章节</div>';
  } else {
    list.innerHTML = parsedChapters
      .map(
        (c, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border)">
            <input type="checkbox" class="import-chk" data-idx="${i}" ${c.checked ? 'checked' : ''}>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.title}</div>
              <div style="font-size:12px;color:var(--text-light)">${(c.content || '').length.toLocaleString()} 字</div>
            </div>
          </div>
        `
      )
      .join('');

    list.querySelectorAll('input.import-chk').forEach((cb) => {
      cb.addEventListener('change', () => {
        const idx = Number(cb.dataset.idx);
        if (parsedChapters[idx]) parsedChapters[idx].checked = cb.checked;
        updateImportSummary();
      });
    });
  }

  updateImportSummary();
}

function updateImportSummary() {
  const total = parsedChapters.length;
  const checked = parsedChapters.filter((c) => c.checked);
  const words = checked.reduce((s, c) => s + (c.content || '').length, 0);

  const totalEl = document.getElementById('import-total');
  const wordsEl = document.getElementById('import-words');
  if (totalEl) totalEl.textContent = String(total);
  if (wordsEl) wordsEl.textContent = words.toLocaleString();
}

function cancelImport() {
  parsedChapters = [];
  txtImportFile = null;
  const preview = document.getElementById('import-preview');
  if (preview) preview.style.display = 'none';
  const fileInput = document.getElementById('import-file');
  if (fileInput) fileInput.value = '';
  const progress = document.querySelector('.import-progress');
  if (progress) progress.style.display = 'none';
  const bar = document.getElementById('import-bar');
  if (bar) bar.style.width = '0%';
  const status = document.getElementById('import-status');
  if (status) status.textContent = '';
}

async function startImport() {
  const mode = document.querySelector('input[name=\"txt-import-mode\"]:checked')?.value || 'existing';
  const isNewBook = mode === 'new';

  let bookId;
  if (mode === 'new') {
    const title = document.getElementById('txt-book-title')?.value?.trim() || '';
    if (!title) return showMsg('import-msg', '请输入书名', 'error');
    const author = document.getElementById('txt-book-author')?.value?.trim() || '';
    const description = document.getElementById('txt-book-desc')?.value?.trim() || '';
    try {
      const res = await api('POST', '/api/admin/books', { title, author, description });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      bookId = data.book.id;
    } catch (e) {
      return showMsg('import-msg', `创建书籍失败：${e.message}`, 'error');
    }
  } else {
    bookId = document.getElementById('import-book')?.value || '';
    if (!bookId) return showMsg('import-msg', '请选择目标书籍', 'error');
    bookId = Number(bookId);
  }

  if (!txtImportFile) return showMsg('import-msg', '请先选择 TXT 文件', 'error');
  const chapters = parsedChapters.filter((c) => c.checked);
  if (chapters.length === 0) return showMsg('import-msg', '没有选中任何章节', 'error');

  const bar = document.getElementById('import-bar');
  const status = document.getElementById('import-status');
  const progress = document.querySelector('.import-progress');
  if (progress) progress.style.display = 'block';
  if (bar) bar.style.width = '0%';
  if (status) status.textContent = '上传源文件...';

  try {
    await uploadBookSource(bookId, txtImportFile);
  } catch (e) {
    let note = '';
    if (isNewBook) {
      try {
        await api('DELETE', `/api/admin/books/${bookId}`);
        note = '（已回滚创建的书籍）';
      } catch {
        note = '（回滚失败，请在书籍列表手动删除刚创建的空书）';
      }
    }
    return showMsg('import-msg', `源文件上传失败：${e.message}${note}`, 'error');
  }

  let uploaded = 0;
  const errors = [];
  const tasks = chapters.map((ch) => () =>
    api('POST', '/api/admin/chapters', { book_id: Number(bookId), title: ch.title, content: ch.content })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json();
          errors.push(`${ch.title}: ${d.error}`);
        }
      })
      .catch((e) => {
        errors.push(`${ch.title}: ${e.message}`);
      })
      .finally(() => {
        uploaded++;
        const pct = Math.round((uploaded / chapters.length) * 100);
        if (bar) bar.style.width = `${pct}%`;
        if (status) status.textContent = `${uploaded}/${chapters.length} 章（${pct}%）`;
      })
  );

  await concurrentUpload(tasks, 3);
  if (errors.length > 0) {
    showMsg('import-msg', `导入完成，${errors.length} 章失败：${errors.slice(0, 3).join('；')}`, 'error');
  } else {
    showMsg('import-msg', `成功导入 ${uploaded} 章`, 'success');
  }

  cancelImport();
  refreshAllBooks();
}
