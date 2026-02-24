import { api } from './api.js';
import { esc, showMsg } from './ui.js';

let adminsCache = [];

export function initAdminUsers() {
  document.getElementById('create-admin-btn')?.addEventListener('click', createAdmin);

  const list = document.getElementById('admin-users-list');
  if (!list) return;

  list.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = Number(tr.dataset.id);
    const name = tr.dataset.name || '';
    const locked = Number(tr.dataset.lock) === 1;

    if (e.target.classList.contains('btn-toggle-pwd-lock')) togglePwdLock(id, locked ? 0 : 1);
    else if (e.target.classList.contains('btn-delete-admin')) deleteAdmin(id, name);
  });

  list.addEventListener('change', (e) => {
    if (!e.target.classList.contains('admin-role-select')) return;
    const id = Number(e.target.dataset.id);
    changeRole(id, e.target.value);
  });
}

export async function loadAdminUsers() {
  try {
    const res = await api('GET', '/api/admin/users');
    const data = await res.json();
    const admins = data.admins || [];
    adminsCache = admins;

    const el = document.getElementById('admin-users-list');
    if (!el) return;
    if (admins.length === 0) {
      el.innerHTML = '<p style="color:var(--text-light);font-size:13px">暂无管理员</p>';
      return;
    }

    el.innerHTML =
      '<table style="width:100%;font-size:14px;border-collapse:collapse"><thead><tr style="border-bottom:2px solid var(--border)"><th style="text-align:left;padding:6px">用户名</th><th style="text-align:left;padding:6px">角色</th><th style="text-align:left;padding:6px">来源</th><th style="text-align:left;padding:6px">密码</th><th style="text-align:left;padding:6px">创建时间</th><th style="text-align:right;padding:6px">操作</th></tr></thead><tbody>' +
      admins
        .map((a) => {
          const isGH = !!a.github_id;
          const ghInfo = isGH
            ? `<span title="GitHub: ${esc(a.github_login || '')}">${a.avatar_url ? `<img src="${esc(a.avatar_url)}" style="width:16px;height:16px;border-radius:50%;vertical-align:middle;margin-right:3px">` : ''}🐙 ${esc(a.github_login || '')}</span>`
            : '<span style="color:var(--text-light)">本地</span>';
          const lockTitle = a.password_locked ? '密码已锁定' : '密码可修改';
          const lockIcon = a.password_locked ? '🔒' : '🔓';
          const lockBtnText = a.password_locked ? '解锁' : '锁定';
          return `<tr data-id="${a.id}" data-name="${esc(a.username)}" data-lock="${a.password_locked ? 1 : 0}" style="border-bottom:1px solid var(--border)"><td style="padding:6px">${esc(a.username)}</td><td style="padding:6px"><select class="admin-role-select" data-id="${a.id}" style="padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:13px"><option value="super_admin"${a.role === 'super_admin' ? ' selected' : ''}>超级管理员</option><option value="admin"${a.role === 'admin' ? ' selected' : ''}>管理员</option><option value="demo"${a.role === 'demo' ? ' selected' : ''}>演示</option></select></td><td style="padding:6px;font-size:12px">${ghInfo}</td><td style="padding:6px"><span title="${lockTitle}">${lockIcon}</span> <button class="btn btn-sm btn-toggle-pwd-lock" style="font-size:11px;padding:1px 6px">${lockBtnText}</button></td><td style="padding:6px;color:var(--text-light);font-size:12px">${a.created_at ? a.created_at.slice(0, 10) : '-'}</td><td style="padding:6px;text-align:right"><button class="btn btn-sm btn-danger btn-delete-admin">删除</button></td></tr>`;
        })
        .join('') +
      '</tbody></table>';
  } catch {}
}

async function createAdmin() {
  const username = document.getElementById('new-admin-user')?.value?.trim() || '';
  const password = document.getElementById('new-admin-pass')?.value || '';
  const role = document.getElementById('new-admin-role')?.value || 'demo';
  const pwdLock = !!document.getElementById('new-admin-pwd-lock')?.checked;

  if (!username || !password) return showMsg('admin-user-msg', '请填写用户名和密码', 'error');

  try {
    const res = await api('POST', '/api/admin/users', { username, password, role, password_locked: pwdLock ? 1 : 0 });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showMsg('admin-user-msg', data.message || '创建成功', 'success');
    if (document.getElementById('new-admin-user')) document.getElementById('new-admin-user').value = '';
    if (document.getElementById('new-admin-pass')) document.getElementById('new-admin-pass').value = '';
    if (document.getElementById('new-admin-pwd-lock')) document.getElementById('new-admin-pwd-lock').checked = false;
    loadAdminUsers();
  } catch (e) {
    showMsg('admin-user-msg', e.message, 'error');
  }
}

async function deleteAdmin(id, username) {
  if (!confirm(`确定删除管理员 ${username} 吗？`)) return;
  try {
    const res = await api('DELETE', '/api/admin/users', { id });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loadAdminUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function changeRole(id, role) {
  try {
    const res = await api('PUT', '/api/admin/users', { id, role });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loadAdminUsers();
  } catch (e) {
    alert(e.message);
    loadAdminUsers();
  }
}

async function togglePwdLock(id, newValue) {
  try {
    const res = await api('PUT', '/api/admin/users', { id, password_locked: newValue });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loadAdminUsers();
  } catch (e) {
    alert(e.message);
    loadAdminUsers();
  }
}

