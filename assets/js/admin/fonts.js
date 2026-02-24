import { api } from './api.js';
import { getToken } from './state.js';
import { esc, showMsg } from './ui.js';

export function initFonts() {
  document.getElementById('upload-font-btn')?.addEventListener('click', uploadFont);

  document.getElementById('font-list')?.addEventListener('click', (e) => {
    if (!e.target.classList.contains('btn-delete-font')) return;
    const li = e.target.closest('li[data-font]');
    if (li) deleteFont(li.dataset.font);
  });
}

export async function loadFontList() {
  const el = document.getElementById('font-list');
  if (!el) return;
  try {
    const res = await fetch('/api/fonts');
    const data = await res.json();
    const fonts = data.fonts || [];
    if (fonts.length === 0) {
      el.innerHTML = '<li style="color:var(--text-light)">暂无自定义字体</li>';
      return;
    }
    el.innerHTML = fonts
      .map(
        (f) => `
          <li data-font="${esc(f)}">
            <span style="font-size:14px">${esc(f)}</span>
            <button class="btn btn-sm btn-danger btn-delete-font">删除</button>
          </li>
        `
      )
      .join('');
  } catch {
    el.innerHTML = '<li style="color:var(--text-light)">加载失败</li>';
  }
}

async function uploadFont() {
  const fileInput = document.getElementById('font-file');
  const file = fileInput?.files?.[0];
  if (!file) return showMsg('font-msg', '请选择字体文件', 'error');
  if (!/\\.woff2$/i.test(file.name)) return showMsg('font-msg', '只支持 .woff2 格式', 'error');
  if (file.size > 10 * 1024 * 1024) return showMsg('font-msg', '文件不能超过 10MB', 'error');

  showMsg('font-msg', '上传中...', '');
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/admin/fonts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showMsg('font-msg', '上传成功', 'success');
    if (fileInput) fileInput.value = '';
    loadFontList();
  } catch (e) {
    showMsg('font-msg', e.message, 'error');
  }
}

async function deleteFont(filename) {
  if (!confirm(`确定删除字体《${filename}》吗？`)) return;
  try {
    const res = await api('DELETE', '/api/admin/fonts', { filename });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loadFontList();
  } catch (e) {
    alert(`删除失败：${e.message}`);
  }
}

