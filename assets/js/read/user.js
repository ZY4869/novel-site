import { esc } from '../shared/dom.js';
import { dom } from './state.js';

let currentUser = null;
let currentUserPromise = null;

export async function getCurrentUser() {
  if (currentUserPromise) return currentUserPromise;
  currentUserPromise = (async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (!res.ok) {
        currentUser = null;
        return null;
      }
      currentUser = await res.json();
      return currentUser;
    } catch {
      currentUser = null;
      return null;
    } finally {
      currentUserPromise = null;
    }
  })();
  return currentUserPromise;
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {}
  currentUser = null;
}

export async function initNavUser() {
  const el = dom.navUser || document.getElementById('nav-user');
  if (!el) return;

  const user = await getCurrentUser();
  if (!user) {
    el.innerHTML = '<a href="/admin.html">管理</a>';
    return;
  }

  const roleMap = {
    super_admin: '超管',
    admin: '管理',
    editor: '管理',
    demo: '用户',
  };
  const role = roleMap[user.role] || '用户';
  el.innerHTML = `<a href="/admin.html">${esc(user.username || '')}（${esc(role)}）</a> <a href="#" class="nav-logout">退出</a>`;

  el.querySelector('.nav-logout')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
    location.reload();
  });
}

