import { api } from './api.js';
import { esc, showMsg } from './ui.js';

let allTags = [];

export function initTags() {
  document.getElementById('create-tag-btn')?.addEventListener('click', createTag);
  document.getElementById('tag-list')?.addEventListener('click', onTagListClick);
}

export function getAllTags() {
  return allTags;
}

export async function loadTagList() {
  try {
    const res = await api('GET', '/api/admin/tags');
    const data = await res.json();
    allTags = data.tags || [];

    const el = document.getElementById('tag-list');
    if (!el) return;

    if (allTags.length === 0) {
      el.innerHTML = '<li style="color:var(--text-light)">暂无标签</li>';
      return;
    }

    el.innerHTML = allTags
      .map(
        (t) => `
          <li data-id="${t.id}">
            <div class="item-info" style="display:flex;align-items:center;gap:8px">
              <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${esc(t.color)}"></span>
              <span class="item-title">${esc(t.name)}</span>
              <span class="item-meta" style="margin-left:4px">${t.book_count || 0} 本书</span>
            </div>
            <div class="item-actions">
              <button class="btn btn-sm btn-edit-tag">编辑</button>
              <button class="btn btn-sm btn-danger btn-delete-tag">删除</button>
            </div>
          </li>
        `
      )
      .join('');
  } catch {
    const el = document.getElementById('tag-list');
    if (el) el.innerHTML = '<li style="color:var(--text-light)">加载失败</li>';
  }
}

async function createTag() {
  const name = document.getElementById('tag-name')?.value?.trim() || '';
  const color = document.getElementById('tag-color')?.value || '';
  if (!name) return showMsg('tag-msg', '请输入标签名', 'error');

  try {
    const res = await api('POST', '/api/admin/tags', { name, color });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (document.getElementById('tag-name')) document.getElementById('tag-name').value = '';
    showMsg('tag-msg', '创建成功', 'success');
    loadTagList();
  } catch (e) {
    showMsg('tag-msg', e.message, 'error');
  }
}

async function onTagListClick(e) {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const id = Number(li.dataset.id);
  const tag = allTags.find((t) => t.id === id);
  if (!tag) return;

  if (e.target.classList.contains('btn-edit-tag')) {
    const newName = prompt('标签名：', tag.name);
    if (newName === null) return;
    const newColor = prompt('颜色（如 #3498db）：', tag.color);
    try {
      const res = await api('PUT', '/api/admin/tags', { id, name: newName || tag.name, color: newColor || tag.color });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      loadTagList();
    } catch (err) {
      alert(`编辑失败：${err.message}`);
    }
    return;
  }

  if (e.target.classList.contains('btn-delete-tag')) {
    if (!confirm(`确定删除标签《${tag.name}》吗？`)) return;
    try {
      const res = await api('DELETE', '/api/admin/tags', { id });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      loadTagList();
    } catch (err) {
      alert(`删除失败：${err.message}`);
    }
  }
}

