const STORAGE_KEY = 'admin_active_tab_v1';
const VALID_TABS = ['novel', 'comic'];

function parseTabAttr(value) {
  return String(value || '')
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getTabFromUrl() {
  const url = new URL(location.href);
  const v = url.searchParams.get('tab');
  return VALID_TABS.includes(v) ? v : null;
}

function setTabToUrl(tab, { replace = false } = {}) {
  const url = new URL(location.href);
  url.searchParams.set('tab', tab);
  if (replace) history.replaceState(null, '', url.toString());
  else history.pushState(null, '', url.toString());
}

function setActiveTabStyle(tab) {
  document.querySelectorAll('#admin-tabs a[data-tab]').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === tab);
  });
}

function applyTab(tab) {
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {}

  setActiveTabStyle(tab);

  document.querySelectorAll('#admin-panel .admin-section').forEach((section) => {
    const attrs = parseTabAttr(section.getAttribute('data-admin-tab'));
    const isCommon = attrs.length === 0 || attrs.includes('common') || attrs.includes('all');
    const shouldShow = isCommon || attrs.includes(tab);
    section.classList.toggle('admin-tab-hidden', !shouldShow);
  });
}

function resolveInitialTab() {
  const fromUrl = getTabFromUrl();
  if (fromUrl) return fromUrl;

  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (VALID_TABS.includes(v)) return v;
  } catch {}

  return 'novel';
}

export function initAdminTabs() {
  const root = document.getElementById('admin-tabs');
  if (!root) return;

  const initialTab = resolveInitialTab();
  if (!getTabFromUrl()) setTabToUrl(initialTab, { replace: true });
  applyTab(initialTab);

  root.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-tab]');
    if (!a) return;
    e.preventDefault();

    const tab = String(a.dataset.tab || '').trim();
    if (!VALID_TABS.includes(tab)) return;

    setTabToUrl(tab);
    applyTab(tab);
  });

  window.addEventListener('popstate', () => {
    applyTab(resolveInitialTab());
  });
}

