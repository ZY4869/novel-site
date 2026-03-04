import { getStoredOrder, sortItemsByOrder } from './tabOrder.js';

const STORAGE_KEY = 'admin_active_tab_v1';
const SUBTAB_STORAGE_PREFIX = 'admin_active_subtab_v1:';

export const SUBTAB_ORDER_PREFIX = 'admin_subtab_order_v1:';
export const VALID_TABS = ['dashboard', 'novel', 'comic'];

const DEFAULT_SUBTAB = {
  novel: 'book_manage',
  comic: 'comic_manage',
};

function parseTabAttr(value) {
  return String(value || '')
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getTabFromUrl() {
  const url = new URL(location.href);
  const v = url.searchParams.get('tab');
  return VALID_TABS.includes(v) ? v : null;
}

export function getSubtabFromUrl() {
  const url = new URL(location.href);
  const v = url.searchParams.get('sub');
  return v ? String(v).trim() : null;
}

export function setStateToUrl({ tab, sub }, { replace = false } = {}) {
  const url = new URL(location.href);
  url.searchParams.set('tab', tab);
  if (tab === 'dashboard') url.searchParams.delete('sub');
  else if (sub) url.searchParams.set('sub', sub);
  else url.searchParams.delete('sub');
  if (replace) history.replaceState(null, '', url.toString());
  else history.pushState(null, '', url.toString());
}

function setActiveTabStyle(tab) {
  document.querySelectorAll('#admin-tabs a[data-tab]').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === tab);
  });
}

function getStoredTab() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID_TABS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function getSubtabStorageKey(tab) {
  return `${SUBTAB_STORAGE_PREFIX}${tab}`;
}

function getStoredSubtab(tab) {
  try {
    const v = localStorage.getItem(getSubtabStorageKey(tab));
    return v ? String(v) : null;
  } catch {
    return null;
  }
}

function setStoredSubtab(tab, subtab) {
  try {
    localStorage.setItem(getSubtabStorageKey(tab), subtab);
  } catch {}
}

function applyTab(tab) {
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {}

  setActiveTabStyle(tab);

  document.querySelectorAll('#admin-panel .admin-section').forEach((section) => {
    const attrs = parseTabAttr(section.getAttribute('data-admin-tab'));
    const shouldShow = attrs.length === 0 || attrs.includes('all') || attrs.includes(tab);
    section.classList.toggle('admin-tab-hidden', !shouldShow);
  });
}

export function resolveInitialTab() {
  return getTabFromUrl() || getStoredTab() || 'dashboard';
}

function getSubtabSectionsForCurrentTab(tab) {
  const sections = Array.from(document.querySelectorAll('#admin-panel .admin-section[data-admin-subtab]'));
  const filtered = sections.filter((section) => {
    if (section.classList.contains('admin-tab-hidden')) return false;
    const attrs = parseTabAttr(section.getAttribute('data-admin-tab'));
    const inTab = attrs.length === 0 || attrs.includes('all') || attrs.includes(tab);
    if (!inTab) return false;
    if (section.classList.contains('super-admin-only') && section.style.display === 'none') return false;
    if (section.classList.contains('admin-only') && section.style.display === 'none') return false;
    return true;
  });

  const map = new Map();
  for (const section of filtered) {
    const key = String(section.getAttribute('data-admin-subtab') || '').trim();
    if (!key || map.has(key)) continue;
    const label = String(section.getAttribute('data-admin-subtab-label') || key).trim();
    const order = Number(section.getAttribute('data-admin-subtab-order') || 0);
    map.set(key, { key, label, order });
  }

  return Array.from(map.values()).sort((a, b) => {
    const ao = Number.isFinite(a.order) ? a.order : 0;
    const bo = Number.isFinite(b.order) ? b.order : 0;
    if (ao !== bo) return ao - bo;
    return String(a.label || '').localeCompare(String(b.label || ''));
  });
}

function renderSubtabs(tab, activeSubtab, items) {
  const root = document.getElementById('admin-subtabs');
  if (!root) return;

  if (tab !== 'novel' && tab !== 'comic') {
    root.style.display = 'none';
    root.innerHTML = '';
    return;
  }

  if (!items || items.length === 0) {
    root.style.display = 'none';
    root.innerHTML = '';
    return;
  }

  root.innerHTML = '';
  for (const it of items) {
    const a = document.createElement('a');
    a.href = `?tab=${encodeURIComponent(tab)}&sub=${encodeURIComponent(it.key)}`;
    a.dataset.subtab = it.key;
    a.textContent = it.label || it.key;
    a.draggable = true;
    if (it.key === activeSubtab) a.classList.add('active');
    root.appendChild(a);
  }
  root.style.display = '';
}

function applySubtab(tab, subtab) {
  if (tab !== 'novel' && tab !== 'comic') return;
  const all = document.querySelectorAll('#admin-panel .admin-section[data-admin-subtab]');
  all.forEach((section) => {
    if (section.classList.contains('admin-tab-hidden')) return;
    const attrs = parseTabAttr(section.getAttribute('data-admin-tab'));
    const inTab = attrs.length === 0 || attrs.includes('all') || attrs.includes(tab);
    if (!inTab) return;
    section.classList.toggle('admin-subtab-hidden', section.getAttribute('data-admin-subtab') !== subtab);
  });

  document.querySelectorAll('#admin-subtabs a[data-subtab]').forEach((a) => {
    a.classList.toggle('active', a.dataset.subtab === subtab);
  });
}

export function syncFromUrl({ replace = true } = {}) {
  const url = new URL(location.href);
  const rawTab = url.searchParams.get('tab');
  const tab = VALID_TABS.includes(rawTab) ? rawTab : resolveInitialTab();

  applyTab(tab);

  if (tab !== 'novel' && tab !== 'comic') {
    renderSubtabs(tab, null, []);

    let changed = false;
    if (rawTab !== tab) {
      url.searchParams.set('tab', tab);
      changed = true;
    }
    if (url.searchParams.has('sub')) {
      url.searchParams.delete('sub');
      changed = true;
    }
    if (changed && replace) history.replaceState(null, '', url.toString());
    return;
  }

  const items = getSubtabSectionsForCurrentTab(tab);
  const subtabOrder = getStoredOrder(`${SUBTAB_ORDER_PREFIX}${tab}`);
  const orderedItems = sortItemsByOrder(items, subtabOrder);
  const valid = new Set(orderedItems.map((x) => x.key));

  const urlSub = getSubtabFromUrl();
  const storedSub = getStoredSubtab(tab);
  const defaultSub = DEFAULT_SUBTAB[tab];

  let subtab = null;
  if (urlSub && valid.has(urlSub)) subtab = urlSub;
  else if (storedSub && valid.has(storedSub)) subtab = storedSub;
  else if (defaultSub && valid.has(defaultSub)) subtab = defaultSub;
  else subtab = orderedItems[0]?.key || null;

  renderSubtabs(tab, subtab, orderedItems);
  if (subtab) applySubtab(tab, subtab);
  if (subtab) setStoredSubtab(tab, subtab);

  let changed = false;
  if (rawTab !== tab) {
    url.searchParams.set('tab', tab);
    changed = true;
  }
  if (subtab && url.searchParams.get('sub') !== subtab) {
    url.searchParams.set('sub', subtab);
    changed = true;
  }
  if (!subtab && url.searchParams.has('sub')) {
    url.searchParams.delete('sub');
    changed = true;
  }
  if (changed && replace) history.replaceState(null, '', url.toString());
}
