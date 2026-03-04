import { esc } from '../ui.js';
import { getAllCategories, subscribeCategories } from './state.js';

function toIdArray(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function createCategoryPicker({ container, initialSelectedIds = [], onChange } = {}) {
  if (!container) return null;

  let selected = new Set(toIdArray(initialSelectedIds));

  const onClick = (e) => {
    const btn = e.target.closest('button[data-category-id]');
    if (!btn || !container.contains(btn)) return;
    const id = Number(btn.dataset.categoryId);
    if (!Number.isFinite(id) || id <= 0) return;

    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    render();

    if (typeof onChange === 'function') onChange(getSelectedIds());
  };

  const filterSelectedToExisting = (cats) => {
    const valid = new Set((cats || []).map((c) => Number(c?.id)).filter((n) => Number.isFinite(n) && n > 0));
    let changed = false;
    for (const id of Array.from(selected)) {
      if (!valid.has(id)) {
        selected.delete(id);
        changed = true;
      }
    }
    if (changed && typeof onChange === 'function') onChange(getSelectedIds());
  };

  const getSelectedIds = () => Array.from(selected);

  const render = () => {
    const cats = getAllCategories();
    filterSelectedToExisting(cats);

    if (!Array.isArray(cats) || cats.length === 0) {
      container.innerHTML = '<span class="chip chip-muted">暂无分类</span>';
      return;
    }

    container.innerHTML = cats
      .map((c) => {
        const id = Number(c.id);
        const isSpecial = !!c.is_special;
        const isSelected = selected.has(id);
        const cls = [
          'chip',
          'chip-clickable',
          'chip-category',
          isSpecial ? 'chip-category-special' : '',
          isSelected ? 'is-selected' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const title = c.marks?.length ? `标记：${String(c.marks.join('、'))}` : '';
        const special = isSpecial ? '★ ' : '';
        return `<button type="button" class="${cls}" data-category-id="${id}" title="${esc(title)}">${special}${esc(c.name)}</button>`;
      })
      .join('');
  };

  container.addEventListener('click', onClick);
  const unsubscribe = subscribeCategories(() => render());

  render();

  return {
    getSelectedIds,
    setSelectedIds: (ids) => {
      selected = new Set(toIdArray(ids));
      render();
      if (typeof onChange === 'function') onChange(getSelectedIds());
    },
    destroy: () => {
      try {
        container.removeEventListener('click', onClick);
      } catch {}
      try {
        unsubscribe?.();
      } catch {}
    },
  };
}

