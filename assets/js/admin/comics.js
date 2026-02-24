import { api, concurrentUpload, uploadComicPage, uploadComicSource } from './api.js';
import { esc, filenameToTitle, formatBytes, showMsg } from './ui.js';

let cbzImportFile = null;
let cbzZip = null;
let cbzImageNames = [];

export function initComics() {
  document.getElementById('comic-list')?.addEventListener('click', onComicListClick);
  document.getElementById('cbz-file')?.addEventListener('change', onCbzFileChange);
  document.getElementById('start-cbz-import-btn')?.addEventListener('click', startCbzImport);
  document.getElementById('cancel-cbz-import-btn')?.addEventListener('click', () => cancelCbzImport(true));
}

export async function loadComicList() {
  const el = document.getElementById('comic-list');
  if (!el) return;
  try {
    const res = await api('GET', '/api/admin/comics');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const comics = data.comics || [];
    if (comics.length === 0) {
      el.innerHTML = '<li style="padding:12px 0;color:var(--text-light)">暂无漫画</li>';
      return;
    }
    el.innerHTML = comics
      .map(
        (c) => `
        <li data-id="${c.id}">
          <div class="item-info">
            <div class="item-title">${esc(c.title || '')}</div>
            <div class="item-meta">${(c.page_count || 0)} 页${c.source_size ? ' / 源文件 ' + formatBytes(c.source_size) : ''}${c.updated_at ? ' / ' + esc(String(c.updated_at).slice(0, 10)) : ''}</div>
          </div>
          <div class="item-actions">
            <a class="btn btn-sm" href="/comic-read.html?id=${c.id}" target="_blank" rel="noopener">阅读</a>
            <button class="btn btn-sm btn-danger btn-delete-comic">删除</button>
          </div>
        </li>
      `
      )
      .join('');
  } catch (e) {
    el.innerHTML = `<li class="msg msg-error">${esc(e.message)}</li>`;
  }
}

async function onComicListClick(e) {
  if (!e.target.classList.contains('btn-delete-comic')) return;
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const id = Number(li.dataset.id);
  if (!confirm('确定删除该漫画以及其所有页面？此操作不可恢复！')) return;
  try {
    const res = await api('DELETE', `/api/admin/comics/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loadComicList();
  } catch (err) {
    alert(`删除失败：${err.message}`);
  }
}

async function onCbzFileChange() {
  const file = this.files?.[0];
  if (!file) return;
  if (file.size > 200 * 1024 * 1024) {
    cbzImportFile = null;
    this.value = '';
    return showMsg('cbz-msg', '文件超过 200MB 限制', 'error');
  }
  if (!/\\.(cbz|zip)$/i.test(file.name || '')) {
    cbzImportFile = null;
    this.value = '';
    return showMsg('cbz-msg', '请选择 .cbz 文件', 'error');
  }

  cbzImportFile = file;
  cbzZip = null;
  cbzImageNames = [];
  setDisplay('cbz-preview', 'none');
  setDisplay('cbz-parsing-msg', '');
  setDisplay('cbz-progress', 'none');
  showMsg('cbz-msg', '', '');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const names = [];
    zip.forEach((relativePath, entry) => {
      if (entry.dir) return;
      if (relativePath.startsWith('__MACOSX/')) return;
      if (!isSupportedImage(relativePath)) return;
      names.push(relativePath);
    });

    names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    if (names.length === 0) throw new Error('未找到图片文件（仅支持 jpg/png/webp/gif/avif/bmp）');
    if (names.length > 2000) throw new Error('页数过多（超过 2000 页），请拆分导入');

    cbzZip = zip;
    cbzImageNames = names;

    const titleEl = document.getElementById('cbz-title');
    if (titleEl && !titleEl.value.trim()) titleEl.value = filenameToTitle(file.name);

    setText(
      'cbz-summary',
      `检测到 ${names.length} 张图片：${names.slice(0, 6).join(', ')}${names.length > 6 ? ' ...' : ''}`
    );

    setDisplay('cbz-parsing-msg', 'none');
    setDisplay('cbz-preview', '');
  } catch (e) {
    setDisplay('cbz-parsing-msg', 'none');
    cbzImportFile = null;
    cbzZip = null;
    cbzImageNames = [];
    showMsg('cbz-msg', `解析失败：${e.message}`, 'error');
  }
}

function cancelCbzImport(clearMsg = true) {
  cbzImportFile = null;
  cbzZip = null;
  cbzImageNames = [];
  setDisplay('cbz-preview', 'none');
  setDisplay('cbz-parsing-msg', 'none');
  setDisplay('cbz-progress', 'none');
  const fileEl = document.getElementById('cbz-file');
  if (fileEl) fileEl.value = '';
  const bar = document.getElementById('cbz-bar');
  if (bar) bar.style.width = '0%';
  setText('cbz-status', '');
  if (clearMsg) showMsg('cbz-msg', '', '');
}

async function startCbzImport() {
  if (!cbzImportFile || !cbzZip || cbzImageNames.length === 0) return showMsg('cbz-msg', '请先选择 CBZ 文件', 'error');

  const title = document.getElementById('cbz-title')?.value?.trim() || '';
  if (!title) return showMsg('cbz-msg', '请输入标题', 'error');
  const description = document.getElementById('cbz-desc')?.value?.trim() || '';

  let comicId;
  showMsg('cbz-msg', '创建漫画中...', '');
  try {
    const res = await api('POST', '/api/admin/comics', { title, description });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    comicId = data.comic.id;
  } catch (e) {
    return showMsg('cbz-msg', `创建失败：${e.message}`, 'error');
  }

  const bar = document.getElementById('cbz-bar');
  const status = document.getElementById('cbz-status');
  setDisplay('cbz-progress', '');
  if (bar) bar.style.width = '0%';
  if (status) status.textContent = '上传源文件...';

  try {
    await uploadComicSource(comicId, cbzImportFile);
  } catch (e) {
    try {
      await api('DELETE', `/api/admin/comics/${comicId}`);
    } catch {}
    return showMsg('cbz-msg', `源文件上传失败：${e.message}`, 'error');
  }

  let done = 0;
  const errors = [];
  let totalExtracted = 0;
  const MAX_EXTRACTED = 1024 * 1024 * 1024;

  const tasks = cbzImageNames.map((name, idx) => async () => {
    try {
      const entry = cbzZip.file(name);
      if (!entry) throw new Error('找不到文件');
      const ab = await entry.async('arraybuffer');
      totalExtracted += ab.byteLength;
      if (totalExtracted > MAX_EXTRACTED) throw new Error('解压内容过大（超过 1GB），可能是异常文件');
      if (ab.byteLength > 20 * 1024 * 1024) throw new Error('单页图片超过 20MB 限制');
      const blob = new Blob([ab], { type: guessImageMime(name) });
      await uploadComicPage(comicId, idx + 1, blob, name);
    } catch (err) {
      errors.push(`${idx + 1}: ${name} - ${err.message}`);
    } finally {
      done++;
      const pct = Math.round((done / cbzImageNames.length) * 100);
      if (bar) bar.style.width = `${pct}%`;
      if (status) status.textContent = `${done}/${cbzImageNames.length} 页（${pct}%）`;
    }
  });

  await concurrentUpload(tasks, 2);
  try {
    await api('POST', `/api/admin/comics/${comicId}/finalize`, {});
  } catch {}

  if (errors.length > 0) showMsg('cbz-msg', `导入完成，${errors.length} 页失败：${errors.slice(0, 3).join('；')}`, 'error');
  else showMsg('cbz-msg', `导入完成：${cbzImageNames.length} 页`, 'success');

  cancelCbzImport(false);
  loadComicList();
}

function isSupportedImage(name) {
  return /\\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(name || '');
}

function guessImageMime(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'avif') return 'image/avif';
  if (ext === 'bmp') return 'image/bmp';
  return 'application/octet-stream';
}

function setDisplay(id, v) {
  const el = document.getElementById(id);
  if (el) el.style.display = v;
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v ?? '');
}

