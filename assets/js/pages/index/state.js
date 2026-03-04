export const state = {
  allBooks: [],
  allTags: [],
  allCategories: [],
  activeTagId: null,
  activeCategoryId: null,
  categoryViewMode: (() => {
    try {
      const v = localStorage.getItem('index_category_view_mode_v1');
      return v === 'group' ? 'group' : 'filter';
    } catch {
      return 'filter';
    }
  })(),
};

export function setCategoryViewMode(mode) {
  const next = mode === 'group' ? 'group' : 'filter';
  state.categoryViewMode = next;
  try {
    localStorage.setItem('index_category_view_mode_v1', next);
  } catch {}
}
