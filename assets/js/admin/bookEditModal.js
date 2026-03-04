import { api, authHeaders } from './api.js';
import { refreshAllBooks } from './books.js';
import { esc } from './ui.js';
import { getAllTags, loadTagList } from './tags.js';
import { createCategoryPicker } from './categories/picker.js';

let editBookId = null;
let editBookTags = [];
let bookCategoryPicker = null;

export function initBookEditModal() {
  const overlay = document.getElementById('book-edit-overlay');
  document.getElementById('close-book-edit')?.addEventListener('click', () => overlay?.classList.remove('active'));
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });

  const pickerEl = document.getElementById('edit-book-category-picker');
  if (pickerEl) bookCategoryPicker = createCategoryPicker({ container: pickerEl });

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

  const pinnedEl = document.getElementById('edit-book-pinned');
  if (pinnedEl) pinnedEl.checked = !!book?.pinned_at;
  bookCategoryPicker?.setSelectedIds?.((book?.categories || []).map((c) => c.id));

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
    if (pinnedEl) pinnedEl.checked = !!data?.book?.pinned_at;
    bookCategoryPicker?.setSelectedIds?.((data?.book?.categories || []).map((c) => c.id));
  } catch {
    editBookTags = [];
    if (pinnedEl) pinnedEl.checked = false;
    bookCategoryPicker?.setSelectedIds?.([]);
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

  const pinned = !!document.getElementById('edit-book-pinned')?.checked;
  const category_ids = bookCategoryPicker?.getSelectedIds?.() || [];

  try {
    const res = await api('PUT', `/api/admin/books/${editBookId}`, { title, author, description });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '保存失败');

    const coverFile = document.getElementById('edit-cover-file')?.files?.[0];
    if (coverFile) {
      const compressed = await compressCoverImage(coverFile);
      const formData = new FormData();
      formData.append('file', compressed, 'cover.jpg');
      await fetch(`/api/admin/covers?book_id=${editBookId}`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'same-origin',
        body: formData,
      });
    }

    const tagRes = await api('PUT', '/api/admin/book-tags', { book_id: editBookId, tag_ids: editBookTags });
    const tagData = await tagRes.json().catch(() => ({}));
    if (!tagRes.ok) throw new Error(tagData.error || '保存标签失败');

    const catRes = await api('PUT', '/api/admin/book-categories', { book_id: editBookId, category_ids });
    const catData = await catRes.json().catch(() => ({}));
    if (!catRes.ok) throw new Error(catData.error || '保存分类失败');

    const pinRes = await api('PUT', '/api/admin/book-pin', { book_id: editBookId, pinned });
    const pinData = await pinRes.json().catch(() => ({}));
    if (!pinRes.ok) throw new Error(pinData.error || '保存置顶失败');

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
