import { api } from './api.js';
import { refreshAllBooks } from './books.js';
import { getToken } from './state.js';
import { esc } from './ui.js';
import { getAllTags, loadTagList } from './tags.js';

let editBookId = null;
let editBookTags = [];

export function initBookEditModal() {
  const overlay = document.getElementById('book-edit-overlay');
  document.getElementById('close-book-edit')?.addEventListener('click', () => overlay?.classList.remove('active'));
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });

  document.getElementById('remove-cover-btn')?.addEventListener('click', removeCover);
  document.getElementById('edit-cover-file')?.addEventListener('change', onCoverFileChange);
  document.getElementById('save-book-edit-btn')?.addEventListener('click', saveBookEdits);

  document.getElementById('edit-book-tags')?.addEventListener('click', (e) => {
    const label = e.target.closest('label[data-tag-id]');
    if (!label) return;
    const tagId = Number(label.dataset.tagId);
    if (editBookTags.includes(tagId)) editBookTags = editBookTags.filter((id) => id !== tagId);
    else editBookTags.push(tagId);
    renderEditBookTags();
  });
}

export async function openBookEditOverlay(book) {
  const overlay = document.getElementById('book-edit-overlay');
  if (!overlay) return;

  editBookId = book.id;
  setValue('edit-book-id', book.id);
  setValue('edit-book-title', book.title || '');
  setValue('edit-book-author', book.author || '');
  setValue('edit-book-desc', book.description || '');

  const preview = document.getElementById('edit-cover-preview');
  const removeBtn = document.getElementById('remove-cover-btn');
  if (book.cover_key) {
    if (preview) preview.innerHTML = `<img src="/api/covers/${book.id}" style="width:100%;height:100%;object-fit:cover">`;
    if (removeBtn) removeBtn.style.display = '';
  } else {
    if (preview) preview.innerHTML = '<span style="color:var(--text-light);font-size:12px">无封面</span>';
    if (removeBtn) removeBtn.style.display = 'none';
  }
  const coverFileEl = document.getElementById('edit-cover-file');
  if (coverFileEl) coverFileEl.value = '';

  if (getAllTags().length === 0) await loadTagList();
  try {
    const res = await fetch(`/api/books/${book.id}`);
    const data = await res.json();
    editBookTags = (data.book.tags || []).map((t) => t.id);
  } catch {
    editBookTags = [];
  }
  renderEditBookTags();

  overlay.classList.add('active');
}

function renderEditBookTags() {
  const container = document.getElementById('edit-book-tags');
  if (!container) return;
  const tags = getAllTags();
  container.innerHTML = tags
    .map((t) => {
      const checked = editBookTags.includes(t.id);
      const border = checked ? t.color : 'var(--border)';
      const bg = checked ? `${t.color}22` : 'transparent';
      const color = checked ? t.color : 'var(--text-light)';
      return `<label data-tag-id="${t.id}" style="display:flex;align-items:center;gap:4px;cursor:pointer;padding:4px 10px;border:1px solid ${border};border-radius:12px;font-size:13px;background:${bg};color:${color}">${esc(t.name)}</label>`;
    })
    .join('');
}

async function removeCover() {
  if (!editBookId) return;
  try {
    await api('DELETE', `/api/admin/covers?book_id=${editBookId}`);
    const preview = document.getElementById('edit-cover-preview');
    if (preview) preview.innerHTML = '<span style="color:var(--text-light);font-size:12px">无封面</span>';
    const removeBtn = document.getElementById('remove-cover-btn');
    if (removeBtn) removeBtn.style.display = 'none';
  } catch (e) {
    alert(`删除封面失败：${e.message}`);
  }
}

function onCoverFileChange() {
  const file = this.files?.[0];
  if (!file) return;
  const preview = document.getElementById('edit-cover-preview');
  if (!preview) return;
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover">`;
}

async function saveBookEdits() {
  if (!editBookId) return;
  const title = document.getElementById('edit-book-title')?.value?.trim() || '';
  const author = document.getElementById('edit-book-author')?.value?.trim() || '';
  const description = document.getElementById('edit-book-desc')?.value?.trim() || '';
  if (!title) return alert('书名不能为空');

  try {
    const res = await api('PUT', `/api/admin/books/${editBookId}`, { title, author, description });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const coverFile = document.getElementById('edit-cover-file')?.files?.[0];
    if (coverFile) {
      const compressed = await compressCoverImage(coverFile);
      const formData = new FormData();
      formData.append('file', compressed, 'cover.jpg');
      await fetch(`/api/admin/covers?book_id=${editBookId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
    }

    await api('PUT', '/api/admin/book-tags', { book_id: editBookId, tag_ids: editBookTags });

    document.getElementById('book-edit-overlay')?.classList.remove('active');
    refreshAllBooks();
  } catch (e) {
    alert(`保存失败：${e.message}`);
  }
}

async function compressCoverImage(file) {
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxW = 400;
      let w = img.width;
      let h = img.height;
      if (w > maxW) {
        h = Math.round((h * maxW) / w);
        w = maxW;
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  });
}

function setValue(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = String(v ?? '');
}

