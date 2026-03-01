import { api } from './api.js';
import { auth, clearAuth, loadAuthFromSession, saveAuthToSession } from './state.js';
import { showMsg } from './ui.js';

let onAuthedCallback = () => {};

export function initAuth({ onAuthed } = {}) {
  onAuthedCallback = typeof onAuthed === 'function' ? onAuthed : () => {};

  loadAuthFromSession();

  document.getElementById('login-btn')?.addEventListener('click', doLogin);
  document.getElementById('login-pass')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });

  document.getElementById('change-password-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showChangePassword();
  });
  document.getElementById('logout-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    doLogout();
  });
  document.getElementById('deactivate-account-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    deactivateAccount();
  });

  document.getElementById('change-password-btn')?.addEventListener('click', doChangePassword);
  document.getElementById('change-password-cancel-btn')?.addEventListener('click', () => {
    const form = document.getElementById('pwd-form');
    if (form) form.style.display = 'none';
  });
}

export async function doLogin() {
  const username = document.getElementById('login-user')?.value?.trim() || '';
  const password = document.getElementById('login-pass')?.value || '';
  if (!username || !password) return showMsg('login-msg', '请输入用户名和密码', 'error');

  try {
    const res = await fetch('/api/auth?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    auth.token = data.token;
    auth.role = data.role || 'demo';
    auth.userId = data.userId || 0;
    auth.passwordLocked = !!data.passwordLocked;
    saveAuthToSession();

    showAdminPanel(data.username, auth.role);
    onAuthedCallback({ username: data.username, role: auth.role });
  } catch (e) {
    showMsg('login-msg', e.message, 'error');
  }
}

export async function checkSession() {
  try {
    const headers = auth.token ? { Authorization: `Bearer ${auth.token}` } : undefined;
    const res = await fetch('/api/auth?action=me', { headers, credentials: 'same-origin' });
    if (!res.ok) {
      clearAuth();
      return false;
    }
    const data = await res.json();
    if (!data.authenticated) {
      clearAuth();
      return false;
    }

    auth.role = data.role || 'demo';
    auth.userId = data.userId || 0;
    auth.passwordLocked = !!data.passwordLocked;
    saveAuthToSession();

    showAdminPanel(data.username, auth.role);
    onAuthedCallback({ username: data.username, role: auth.role });
    return true;
  } catch {
    clearAuth();
    return false;
  }
}

export async function doLogout() {
  try {
    const headers = auth.token ? { Authorization: `Bearer ${auth.token}` } : undefined;
    await fetch('/api/auth/logout', { method: 'POST', headers, credentials: 'same-origin' });
  } catch {}

  clearAuth();
  document.getElementById('login-panel')?.style && (document.getElementById('login-panel').style.display = 'block');
  document.getElementById('admin-panel')?.style && (document.getElementById('admin-panel').style.display = 'none');
  document.getElementById('user-info')?.style && (document.getElementById('user-info').style.display = 'none');
  const pass = document.getElementById('login-pass');
  if (pass) pass.value = '';
}

function showAdminPanel(username, role) {
  document.getElementById('login-panel').style.display = 'none';
  document.getElementById('admin-panel').style.display = 'block';
  document.getElementById('current-user').textContent = username;

  const badge = role === 'super_admin' ? ' (超管)' : role === 'admin' ? ' (管理)' : ' (演示)';
  const userInfo = document.getElementById('user-info');
  userInfo.textContent = username + badge;
  userInfo.style.display = 'inline';

  const pwdLink = document.getElementById('change-password-link');
  if (pwdLink) pwdLink.style.display = auth.passwordLocked || role === 'demo' ? 'none' : '';
  const deactivateLink = document.getElementById('deactivate-account-link');
  if (deactivateLink) deactivateLink.style.display = role === 'demo' ? '' : 'none';

  document.querySelectorAll('.super-admin-only').forEach((el) => {
    el.style.display = role === 'super_admin' ? '' : 'none';
  });
  document.querySelectorAll('.hide-for-demo').forEach((el) => {
    el.style.display = role === 'demo' ? 'none' : '';
  });
}

function showChangePassword() {
  if (auth.passwordLocked) {
    alert('该账号不允许修改密码');
    return;
  }
  const form = document.getElementById('pwd-form');
  if (form) form.style.display = 'block';
}

async function doChangePassword() {
  const oldPwd = document.getElementById('old-pwd')?.value || '';
  const newPwd = document.getElementById('new-pwd')?.value || '';
  const newPwd2 = document.getElementById('new-pwd2')?.value || '';

  if (!oldPwd || !newPwd) return showMsg('pwd-msg', '请填写所有字段', 'error');
  if (newPwd !== newPwd2) return showMsg('pwd-msg', '两次输入的新密码不一致', 'error');
  if (newPwd.length < 8) return showMsg('pwd-msg', '新密码至少 8 位', 'error');
  if (!/[a-zA-Z]/.test(newPwd) || !/\\d/.test(newPwd)) return showMsg('pwd-msg', '新密码需包含字母和数字', 'error');

  try {
    const res = await api('POST', '/api/auth?action=password', { oldPassword: oldPwd, newPassword: newPwd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showMsg('pwd-msg', '密码已修改，请重新登录', 'success');
    setTimeout(() => doLogout(), 2000);
  } catch (e) {
    showMsg('pwd-msg', e.message, 'error');
  }
}

async function deactivateAccount() {
  if (!confirm('确定要注销该账号吗？\n\n注销后：\n- 账号会被删除\n- 你创建的书籍会转交给超级管理员保管\n\n此操作不可撤销。')) return;

  try {
    const res = await api('DELETE', '/api/admin/account');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '注销失败');

    alert(data.message || '账号已注销');
    await doLogout();
  } catch (e) {
    alert(e.message || '注销失败');
  }
}
