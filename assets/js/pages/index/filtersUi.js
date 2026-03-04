import { setCategoryViewMode, state } from './state.js';

export const UNCATEGORIZED_ID = -1;

export function renderCategoryViewToggle({ onChange } = {}) {
  const container = document.querySelector('#category-view-toggle');
  if (!container) return;

  container.innerHTML = '<div class="tag-filter-bar category-toggle-bar" id="category-view-bar"></div>';
  const bar = document.querySelector('#category-view-bar');

  const modes = [
    { key: 'filter', label: '筛选' },
    { key: 'group', label: '分组' },
  ];

  for (const m of modes) {
    const pill = document.createElement('span');
    pill.className = 'tag-pill view-pill' + (state.categoryViewMode === m.key ? ' active' : '');
    pill.textContent = m.label;
    pill.dataset.view = m.key;
    pill.style.background = 'var(--bg)';
    pill.style.color = 'var(--text)';
    pill.style.border = '1px solid var(--border)';
    bar.appendChild(pill);
  }

  bar.addEventListener('click', (e) => {
    const pill = e.target.closest('.tag-pill');
    if (!pill) return;
    setCategoryViewMode(pill.dataset.view === 'group' ? 'group' : 'filter');
    if (typeof onChange === 'function') onChange();
  });
}

export function renderCategoryFilter({ onChange } = {}) {
  const container = document.querySelector('#category-filter');
  if (!container) return;

  if (state.categoryViewMode !== 'filter') {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  container.innerHTML = '<div class="tag-filter-bar" id="category-bar"></div>';
  const bar = document.querySelector('#category-bar');

  const allPill = document.createElement('span');
  allPill.className = 'tag-pill category-pill' + (state.activeCategoryId === null ? ' active' : '');
  allPill.textContent = '全部';
  allPill.style.background = 'var(--bg)';
  allPill.style.color = 'var(--text)';
  allPill.style.border = '1px solid var(--border)';
  bar.appendChild(allPill);

  const uncatPill = document.createElement('span');
  uncatPill.className = 'tag-pill category-pill' + (state.activeCategoryId === UNCATEGORIZED_ID ? ' active' : '');
  uncatPill.textContent = '未分类';
  uncatPill.dataset.categoryId = 'uncategorized';
  uncatPill.style.background = 'var(--bg)';
  uncatPill.style.color = 'var(--text)';
  uncatPill.style.border = '1px solid var(--border)';
  bar.appendChild(uncatPill);

  for (const c of state.allCategories) {
    const pill = document.createElement('span');
    pill.className = 'tag-pill category-pill' + (state.activeCategoryId === c.id ? ' active' : '');
    pill.textContent = (c.is_special ? '★ ' : '') + c.name;
    pill.dataset.categoryId = String(c.id);
    pill.title = c.marks?.length ? `标记：${String(c.marks.join('、'))}` : '';
    pill.style.background = c.is_special ? 'rgba(226, 176, 122, 0.14)' : 'var(--bg)';
    pill.style.color = 'var(--text)';
    pill.style.border = '1px solid var(--border)';
    bar.appendChild(pill);
  }

  bar.addEventListener('click', (e) => {
    const pill = e.target.closest('.tag-pill');
    if (!pill) return;

    if (pill.dataset.categoryId === 'uncategorized') state.activeCategoryId = UNCATEGORIZED_ID;
    else if (pill.dataset.categoryId) {
      const id = Number(pill.dataset.categoryId);
      state.activeCategoryId = Number.isFinite(id) ? id : null;
    } else state.activeCategoryId = null;

    if (typeof onChange === 'function') onChange();
  });
}

export function renderTagFilter({ onChange } = {}) {
  const container = document.querySelector('#tag-filter');
  if (!container) return;

  if (state.allTags.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<div class="tag-filter-bar" id="tag-bar"></div>';
  const bar = document.querySelector('#tag-bar');

  const allPill = document.createElement('span');
  allPill.className = 'tag-pill' + (state.activeTagId === null ? ' active' : '');
  allPill.textContent = '全部';
  allPill.style.background = 'var(--bg)';
  allPill.style.color = 'var(--text)';
  allPill.style.border = '1px solid var(--border)';
  bar.appendChild(allPill);

  for (const tag of state.allTags) {
    const pill = document.createElement('span');
    pill.className = 'tag-pill' + (state.activeTagId === tag.id ? ' active' : '');
    pill.textContent = tag.name;
    pill.style.background = tag.color + '22';
    pill.style.color = tag.color;
    pill.dataset.tagId = tag.id;
    bar.appendChild(pill);
  }

  bar.addEventListener('click', (e) => {
    const pill = e.target.closest('.tag-pill');
    if (!pill) return;
    state.activeTagId = pill.dataset.tagId ? Number(pill.dataset.tagId) : null;
    if (typeof onChange === 'function') onChange();
  });
}

