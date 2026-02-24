import { api } from './api.js';
import { refreshAllBooks } from './books.js';
import { loadChapters } from './chapters.js';
import { showMsg } from './ui.js';

export function initBatch() {
  document.getElementById('select-all')?.addEventListener('change', function () {
    toggleSelectAll(this.checked);
  });

  document.getElementById('chapter-list')?.addEventListener('change', (e) => {
    if (e.target.classList.contains('ch-select')) updateSelectedCount();
  });

  document.getElementById('batch-delete-btn')?.addEventListener('click', batchDelete);
}

function toggleSelectAll(checked) {
  document.querySelectorAll('.ch-select').forEach((cb) => (cb.checked = checked));
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = document.querySelectorAll('.ch-select:checked').length;
  const el = document.getElementById('selected-count');
  if (el) el.textContent = `已选 ${count} 章`;
}

async function batchDelete() {
  const ids = [...document.querySelectorAll('.ch-select:checked')].map((cb) => Number(cb.dataset.id));
  if (ids.length === 0) return showMsg('manage-msg', '请先勾选要删除的章节', 'error');
  if (!confirm(`确定删除选中的 ${ids.length} 个章节？此操作不可恢复！`)) return;

  let deleted = 0;
  const errors = [];
  for (const id of ids) {
    try {
      const res = await api('DELETE', `/api/admin/chapters/${id}`);
      if (!res.ok) {
        const d = await res.json();
        errors.push(d.error);
      } else {
        deleted++;
      }
    } catch (e) {
      errors.push(e.message);
    }
  }

  if (errors.length > 0) showMsg('manage-msg', `删除 ${deleted} 章，${errors.length} 章失败`, 'error');
  else showMsg('manage-msg', `成功删除 ${deleted} 章`, 'success');

  loadChapters();
  refreshAllBooks();
}

