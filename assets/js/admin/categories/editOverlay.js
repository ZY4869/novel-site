import { showMsg } from '../ui.js';
import { updateCategory } from './api.js';
import { parseMarksInput, marksToText } from './marks.js';
import { loadCategories } from './state.js';

let editingCategoryId = null;

function openOverlay(id) {
  document.getElementById(id)?.classList.add('active');
}

function closeOverlay(id) {
  document.getElementById(id)?.classList.remove('active');
}

export function initCategoryEditOverlay() {
  const overlay = document.getElementById('category-edit-overlay');
  document.getElementById('close-category-edit')?.addEventListener('click', () => closeOverlay('category-edit-overlay'));
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay('category-edit-overlay');
  });

  document.getElementById('save-category-edit-btn')?.addEventListener('click', async () => {
    if (!editingCategoryId) return;
    const name = document.getElementById('edit-category-name')?.value?.trim() || '';
    const marksText = document.getElementById('edit-category-marks')?.value || '';
    const isSpecial = !!document.getElementById('edit-category-is-special')?.checked;
    if (!name) return showMsg('category-edit-msg', '名称不能为空', 'error');

    try {
      showMsg('category-edit-msg', '保存中...', '');
      await updateCategory({
        id: editingCategoryId,
        name,
        is_special: isSpecial,
        marks: parseMarksInput(marksText),
      });
      closeOverlay('category-edit-overlay');
      await loadCategories();
    } catch (e) {
      showMsg('category-edit-msg', e.message || '保存失败', 'error');
    }
  });
}

export function openCategoryEditOverlay(category) {
  editingCategoryId = Number(category?.id) || null;
  if (!editingCategoryId) return;

  const idEl = document.getElementById('edit-category-id');
  if (idEl) idEl.value = String(editingCategoryId);
  const nameEl = document.getElementById('edit-category-name');
  if (nameEl) nameEl.value = String(category?.name || '');
  const marksEl = document.getElementById('edit-category-marks');
  if (marksEl) marksEl.value = marksToText(category?.marks);
  const specialEl = document.getElementById('edit-category-is-special');
  if (specialEl) specialEl.checked = !!category?.is_special;

  showMsg('category-edit-msg', '', '');
  openOverlay('category-edit-overlay');
}

