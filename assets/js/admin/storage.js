import { api, authHeaders } from './api.js';
import { esc, formatBytes, showMsg } from './ui.js';

let storageCursor = null;

export function initStorage() {
  document.getElementById('save-storage-limit-btn')?.addEventListener('click', saveStorageLimit);
  document.getElementById('clear-storage-limit-btn')?.addEventListener('click', clearStorageLimit);
  document.getElementById('storage-refresh-btn')?.addEventListener('click', () => loadStorageObjects(true));
  document.getElementById('storage-load-more')?.addEventListener('click', () => loadStorageObjects(false));
}

export async function loadStorageSummary() {
  try {
    const res = await api('GET', '/api/admin/storage/summary');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const s = data.summary || {};

    setText('storage-used', formatBytes(s.usedBytes || 0));
    setText('storage-objects', (s.objectsCount || 0).toLocaleString());
    setText(
      'storage-remaining',
      s.remainingBytes === null || s.remainingBytes === undefined ? '未配置' : formatBytes(s.remainingBytes)
    );

    const bc = s.byCategory || {};
    const lines = [
      `sources：${formatBytes(bc.sources || 0)}`,
      `novels：${formatBytes(bc.novels || 0)}`,
      `comics：${formatBytes(bc.comics || 0)}`,
      `covers：${formatBytes(bc.covers || 0)}`,
      `fonts：${formatBytes(bc.fonts || 0)}`,
      `derived：${formatBytes(bc.derived || 0)}`,
      `other：${formatBytes(bc.other || 0)}`,
    ];

    const computedAt = s.computedAt ? `（计算于 ${String(s.computedAt).slice(0, 19).replace('T', ' ')}）` : '';
    setText('storage-breakdown', `${lines.join(' / ')}${computedAt}`);

    const gbInput = document.getElementById('storage-limit-gb');
    if (gbInput) {
      if (s.limitBytes) gbInput.value = (Number(s.limitBytes) / (1024 * 1024 * 1024)).toFixed(2).replace(/\\.?0+$/, '');
      else gbInput.value = '';
    }
  } catch (e) {
    setText('storage-breakdown', `加载失败：${e.message}`);
  }
}

async function saveStorageLimit() {
  const input = document.getElementById('storage-limit-gb');
  const v = (input?.value || '').trim();
  if (!v) return clearStorageLimit();

  const gb = Number(v);
  if (!Number.isFinite(gb) || gb <= 0) return showMsg('storage-limit-msg', '请输入有效的 GB 数值', 'error');

  const limitBytes = Math.floor(gb * 1024 * 1024 * 1024);
  try {
    const res = await api('PUT', '/api/admin/storage/summary', { limitBytes });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showMsg('storage-limit-msg', '已保存', 'success');
    loadStorageSummary();
  } catch (e) {
    showMsg('storage-limit-msg', e.message, 'error');
  }
}

async function clearStorageLimit() {
  try {
    const res = await api('PUT', '/api/admin/storage/summary', { limitBytes: 0 });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showMsg('storage-limit-msg', '已清除', 'success');
    loadStorageSummary();
  } catch (e) {
    showMsg('storage-limit-msg', e.message, 'error');
  }
}

export async function loadStorageObjects(reset) {
  try {
    const prefix = document.getElementById('storage-prefix')?.value || '';
    if (reset) {
      storageCursor = null;
      const list = document.getElementById('storage-objects-list');
      if (list) list.innerHTML = '';
      setText('storage-objects-msg', '');
    }

    const url = new URL('/api/admin/storage/objects', location.origin);
    if (prefix.trim()) url.searchParams.set('prefix', prefix.trim());
    if (storageCursor) url.searchParams.set('cursor', storageCursor);
    url.searchParams.set('limit', '200');

    const res = await fetch(url.toString(), { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '加载失败');

    const list = document.getElementById('storage-objects-list');
    const items = data.objects || [];
    if (!list) return;

    if (reset && items.length === 0) {
      list.innerHTML = '<li style="padding:12px 0;color:var(--text-light)">暂无对象</li>';
    } else {
      const html = items
        .map((o) => {
          const owner = o.ownerType && o.ownerId ? `${o.ownerType}#${o.ownerId}` : '';
          const meta = [o.category, owner, o.kind].filter(Boolean).join(' / ');
          const time = o.uploaded ? String(o.uploaded).slice(0, 19).replace('T', ' ') : '';
          return `
            <li>
              <div class="item-info">
                <div class="item-title" style="font-size:13px;word-break:break-all">${esc(o.key)}</div>
                <div class="item-meta">${formatBytes(o.size || 0)}${time ? ' / ' + esc(time) : ''}${meta ? ' / ' + esc(meta) : ''}</div>
              </div>
            </li>
          `;
        })
        .join('');
      list.insertAdjacentHTML('beforeend', html);
    }

    storageCursor = data.cursor || null;
    const moreBtn = document.getElementById('storage-load-more');
    if (moreBtn) moreBtn.style.display = storageCursor ? '' : 'none';
    setText('storage-objects-msg', storageCursor ? '已加载一部分，可继续加载更多' : '已加载完毕');
  } catch (e) {
    setText('storage-objects-msg', `加载失败：${e.message}`);
  }
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v ?? '');
}

