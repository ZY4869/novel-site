import { api } from './api.js';
import { auth, saveAuthToSession } from './state.js';
import { showMsg } from './ui.js';

export function initGitHubAuth({ onToken } = {}) {
  document.getElementById('github-login-btn')?.addEventListener('click', doGitHubLogin);

  const hash = location.hash || '';
  if (hash.startsWith('#github_token=')) {
    const token = hash.slice('#github_token='.length);
    if (token) {
      auth.token = token;
      saveAuthToSession();
      history.replaceState(null, '', location.pathname);
      if (typeof onToken === 'function') onToken();
    }
  } else if (hash === '#github_login=success') {
    history.replaceState(null, '', location.pathname);
    if (typeof onToken === 'function') onToken();
  } else if (hash.startsWith('#github_error=')) {
    const error = decodeURIComponent(hash.slice('#github_error='.length));
    history.replaceState(null, '', location.pathname);
    setTimeout(() => showMsg('login-msg', `GitHub 登录失败：${error}`, 'error'), 100);
  }

  fetch('/api/settings?check=github')
    .then((r) => r.json())
    .then((d) => {
      if (d.githubLoginEnabled) {
        const el = document.getElementById('github-login-section');
        if (el) el.style.display = '';
      }
    })
    .catch(() => {});
}

export function initGitHubConfig() {
  document.getElementById('gh-oauth-enabled')?.addEventListener('change', toggleGitHubConfig);
  document.getElementById('save-github-config-btn')?.addEventListener('click', saveGitHubConfig);
}

export function doGitHubLogin() {
  location.href = '/api/auth?action=github-login';
}

export function toggleGitHubConfig() {
  const enabled = !!document.getElementById('gh-oauth-enabled')?.checked;
  const box = document.getElementById('gh-oauth-config');
  if (box) box.style.display = enabled ? '' : 'none';
}

export async function loadGitHubConfig() {
  const homepage = document.getElementById('gh-homepage-url');
  const callback = document.getElementById('gh-callback-url');
  if (homepage) homepage.textContent = location.origin;
  if (callback) callback.textContent = `${location.origin}/api/auth/github/callback`;

  try {
    const res = await api('GET', '/api/admin/settings?section=github');
    const data = await res.json();
    if (!res.ok) return;

    const enabledEl = document.getElementById('gh-oauth-enabled');
    if (enabledEl) enabledEl.checked = !!data.enabled;
    const clientIdEl = document.getElementById('gh-client-id');
    if (clientIdEl) clientIdEl.value = data.clientId || '';
    const secretStatus = document.getElementById('gh-secret-status');
    if (secretStatus) secretStatus.textContent = data.hasSecret ? '（已配置 ✓）' : '（未配置）';
    toggleGitHubConfig();
  } catch {}
}

export async function saveGitHubConfig() {
  const enabled = !!document.getElementById('gh-oauth-enabled')?.checked;
  const clientId = document.getElementById('gh-client-id')?.value?.trim() || '';
  const clientSecret = document.getElementById('gh-client-secret')?.value?.trim() || '';

  if (enabled && !clientId) return showMsg('gh-config-msg', '请填写 Client ID', 'error');

  try {
    const res = await api('POST', '/api/admin/settings?section=github', {
      enabled,
      clientId,
      clientSecret: clientSecret || undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showMsg('gh-config-msg', '配置已保存', 'success');
    const secretEl = document.getElementById('gh-client-secret');
    if (secretEl) secretEl.value = '';
    loadGitHubConfig();
  } catch (e) {
    showMsg('gh-config-msg', e.message, 'error');
  }
}
