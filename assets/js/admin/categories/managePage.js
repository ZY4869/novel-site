import { esc, showMsg } from '../ui.js';
import { createCategory, deleteCategory } from './api.js';
import { openCategoryBooksOverlay } from './booksOverlay.js';
import { openCategoryEditOverlay } from './editOverlay.js';
import { parseMarksInput } from './marks.js';
import { getAllCategories, loadCategories, subscribeCategories } from './state.js';

function renderCategoryList() {
  const el = document.getElementById('category-list');
  if (!el) return;

  const cats = getAllCategories();
  if (!Array.isArray(cats) || cats.length === 0) {
    el.innerHTML = '<li style="color:var(--text-light)">暂无分类</li>';
    return;
  }

  el.innerHTML = cats
    .map((c) => {
      const marks = Array.isArray(c.marks) ? c.marks : [];
      const marksHtml = marks
        .slice(0, 8)
        .map((m) => `<span class="chip chip-mark">${esc(m)}</span>`)
        .join('');
      const more = marks.length > 8 ? `<span class="chip chip-muted">+${marks.length - 8}</span>` : '';
      const special = c.is_special ? '<span class="badge badge-special">特殊</span>' : '';
      const count = Number(c.book_count || 0) || 0;

      return `
        <li data-id="${c.id}">
          <div class="item-info">
            <div class="category-title-row">
              <span class="item-title">${esc(c.name)}</span>
              ${special}
              <span class="item-meta">${count} 本书</span>
            </div>
            <div class="category-marks-row">${marksHtml}${more}</div>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-edit-category">编辑</button>
            <button class="btn btn-sm btn-manage-category-books">管理书籍</button>
            <button class="btn btn-sm btn-danger btn-delete-category">删除</button>
          </div>
        </li>
      `;
    })
    .join('');
}

async function onCreateCategory() {
  const name = document.getElementById('category-name')?.value?.trim() || '';
  const marksText = document.getElementById('category-marks')?.value || '';
  const isSpecial = !!document.getElementById('category-is-special')?.checked;
  if (!name) return showMsg('category-msg', '请输入分类名', 'error');

  try {
    showMsg('category-msg', '创建中...', '');
    await createCategory({ name, is_special: isSpecial, marks: parseMarksInput(marksText) });
    if (document.getElementById('category-name')) document.getElementById('category-name').value = '';
    if (document.getElementById('category-marks')) document.getElementById('category-marks').value = '';
    if (document.getElementById('category-is-special')) document.getElementById('category-is-special').checked = false;
    showMsg('category-msg', '创建成功', 'success');
    await loadCategories();
  } catch (e) {
    showMsg('category-msg', e.message || '创建失败', 'error');
  }
}

async function onDeleteCategory(category) {
  const ok = confirm(`确定删除分类《${category.name}》吗？\n\n将同时删除该分类下的所有关联（书籍不会被删除）。`);
  if (!ok) return;

  try {
    await deleteCategory({ id: category.id });
    await loadCategories();
  } catch (e) {
    alert(`删除失败：${e.message || '未知错误'}`);
  }
}

function bindCategoryPage() {
  document.getElementById('create-category-btn')?.addEventListener('click', () => onCreateCategory());
  document.getElementById('category-list')?.addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = Number(li.dataset.id);
    const category = getAllCategories().find((c) => Number(c.id) === id);
    if (!category) return;

    if (e.target.classList.contains('btn-edit-category')) {
      openCategoryEditOverlay(category);
      return;
    }
    if (e.target.classList.contains('btn-manage-category-books')) {
      await openCategoryBooksOverlay(category);
      return;
    }
    if (e.target.classList.contains('btn-delete-category')) {
      await onDeleteCategory(category);
    }
  });

  subscribeCategories(() => renderCategoryList());
}

export function initCategoriesManagePage() {
  bindCategoryPage();
  renderCategoryList();
}

export async function loadCategoriesOrShowError() {
  try {
    await loadCategories();
  } catch (e) {
    showMsg('category-msg', e.message || '加载失败', 'error');
  }
}

