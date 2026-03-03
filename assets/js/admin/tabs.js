import { applyDomOrder, bindDragReorder, getStoredOrder } from './tabOrder.js';
import {
  getSubtabFromUrl,
  getTabFromUrl,
  resolveInitialTab,
  setStateToUrl,
  SUBTAB_ORDER_PREFIX,
  syncFromUrl,
  VALID_TABS,
} from './tabsLogic.js';

const TAB_ORDER_KEY = 'admin_tab_order_v1';

export function initAdminTabs() {
  const root = document.getElementById('admin-tabs');
  if (!root) return;

  // Apply saved order for main tabs
  applyDomOrder(root, 'a[data-tab]', getStoredOrder(TAB_ORDER_KEY), (a) => a.dataset.tab);
  root.querySelectorAll('a[data-tab]').forEach((a) => {
    a.draggable = true;
  });

  const mainDnd = bindDragReorder({
    root,
    itemSelector: 'a[data-tab]',
    getKey: (a) => a.dataset.tab,
    isValidKey: (k) => VALID_TABS.includes(k),
    getStorageKey: () => TAB_ORDER_KEY,
  });

  const subRoot = document.getElementById('admin-subtabs');
  const subDnd = bindDragReorder({
    root: subRoot,
    itemSelector: 'a[data-subtab]',
    getKey: (a) => a.dataset.subtab,
    isValidKey: (k) => !!String(k || '').trim(),
    getStorageKey: () => {
      const tab = getTabFromUrl() || resolveInitialTab();
      if (tab !== 'novel' && tab !== 'comic') return null;
      return `${SUBTAB_ORDER_PREFIX}${tab}`;
    },
  });

  const initialTab = resolveInitialTab();
  if (!getTabFromUrl()) setStateToUrl({ tab: initialTab, sub: getSubtabFromUrl() }, { replace: true });
  syncFromUrl({ replace: true });

  root.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-tab]');
    if (!a) return;
    e.preventDefault();
    if (mainDnd.isClickSuppressed()) return;

    const tab = String(a.dataset.tab || '').trim();
    if (!VALID_TABS.includes(tab)) return;

    setStateToUrl({ tab, sub: null });
    syncFromUrl({ replace: true });
  });

  document.getElementById('admin-subtabs')?.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-subtab]');
    if (!a) return;
    e.preventDefault();
    if (subDnd.isClickSuppressed()) return;

    const tab = getTabFromUrl() || resolveInitialTab();
    if (tab !== 'novel' && tab !== 'comic') return;

    const sub = String(a.dataset.subtab || '').trim();
    if (!sub) return;

    if (getSubtabFromUrl() === sub) return;
    setStateToUrl({ tab, sub });
    syncFromUrl({ replace: true });
  });

  window.addEventListener('popstate', () => {
    syncFromUrl({ replace: true });
  });

  window.addEventListener('admin:role-changed', () => {
    syncFromUrl({ replace: true });
  });
}
