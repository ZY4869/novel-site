function safeParseOrder(raw) {
  try {
    const v = JSON.parse(String(raw || ''));
    return Array.isArray(v) ? v.map((x) => String(x)) : null;
  } catch {
    return null;
  }
}

export function getStoredOrder(storageKey) {
  if (!storageKey) return null;
  try {
    return safeParseOrder(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

export function setStoredOrder(storageKey, order) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.isArray(order) ? order : []));
  } catch {}
}

export function sortItemsByOrder(items, order) {
  const list = Array.isArray(items) ? items : [];
  const ord = Array.isArray(order) ? order : [];
  if (ord.length === 0 || list.length === 0) return list.slice();

  const map = new Map(list.map((it) => [String(it.key), it]));
  const out = [];
  for (const k of ord) {
    const key = String(k);
    if (!map.has(key)) continue;
    out.push(map.get(key));
    map.delete(key);
  }
  for (const it of list) {
    if (map.has(String(it.key))) out.push(it);
  }
  return out;
}

export function applyDomOrder(root, itemSelector, order, getKey) {
  if (!root) return;
  const ord = Array.isArray(order) ? order : [];
  if (ord.length === 0) return;
  const keyFn = typeof getKey === 'function' ? getKey : (el) => el?.dataset?.key;

  const items = Array.from(root.querySelectorAll(itemSelector));
  const map = new Map();
  for (const el of items) {
    const key = String(keyFn(el) || '').trim();
    if (!key) continue;
    map.set(key, el);
  }

  const frag = document.createDocumentFragment();
  for (const key of ord) {
    const el = map.get(String(key));
    if (!el) continue;
    frag.appendChild(el);
    map.delete(String(key));
  }
  for (const el of items) {
    const key = String(keyFn(el) || '').trim();
    if (!key) continue;
    if (!map.has(key)) continue;
    frag.appendChild(el);
    map.delete(key);
  }
  root.appendChild(frag);
}

export function bindDragReorder({
  root,
  itemSelector,
  getKey,
  isValidKey,
  getStorageKey,
  onOrderChanged,
} = {}) {
  if (!root) return { isClickSuppressed: () => false };

  let draggingEl = null;
  let draggingKey = '';
  let suppressUntil = 0;

  function suppressClick(ms = 350) {
    suppressUntil = Date.now() + ms;
  }

  function isClickSuppressed() {
    return Date.now() < suppressUntil;
  }

  function computeOrderFromDom() {
    const els = Array.from(root.querySelectorAll(itemSelector));
    const keys = [];
    for (const el of els) {
      const k = String(getKey(el) || '').trim();
      if (!k) continue;
      if (typeof isValidKey === 'function' && !isValidKey(k)) continue;
      keys.push(k);
    }
    return keys;
  }

  function saveOrder() {
    const storageKey = typeof getStorageKey === 'function' ? getStorageKey() : null;
    if (!storageKey) return;
    const order = computeOrderFromDom();
    setStoredOrder(storageKey, order);
    if (typeof onOrderChanged === 'function') onOrderChanged(order);
  }

  root.addEventListener('dragstart', (e) => {
    const el = e.target.closest(itemSelector);
    if (!el) return;
    const k = String(getKey(el) || '').trim();
    if (!k) return;
    if (typeof isValidKey === 'function' && !isValidKey(k)) return;

    draggingEl = el;
    draggingKey = k;
    el.classList.add('admin-tab-dragging');
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggingKey);
    } catch {}
  });

  root.addEventListener('dragend', () => {
    draggingEl?.classList.remove('admin-tab-dragging');
    draggingEl = null;
    draggingKey = '';
  });

  root.addEventListener('dragover', (e) => {
    if (!draggingEl) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {}
  });

  root.addEventListener('drop', (e) => {
    if (!draggingEl) return;
    e.preventDefault();

    const target = e.target.closest(itemSelector);
    if (!target) {
      root.appendChild(draggingEl);
    } else if (target !== draggingEl) {
      root.insertBefore(draggingEl, target);
    }

    draggingEl.classList.remove('admin-tab-dragging');
    suppressClick();
    saveOrder();
  });

  return { isClickSuppressed };
}
