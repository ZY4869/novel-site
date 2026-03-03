import { esc as escHtml } from '../shared/dom.js';
export { filenameToTitle } from '../shared/title.js';

export function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = type ? `msg msg-${type}` : '';
  el.textContent = text || '';
  if (type === 'success') {
    setTimeout(() => {
      el.className = '';
      el.textContent = '';
    }, 5000);
  }
}

export function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v.toFixed(0) : v.toFixed(v >= 10 ? 1 : 2)} ${units[i]}`;
}

export const esc = escHtml;
