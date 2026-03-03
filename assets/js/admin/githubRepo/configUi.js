import { showMsg } from '../ui.js';
import { fetchGitHubRepoSettings, saveGitHubRepoSettings } from './api.js';
import { getLastConfig, setBusy, setLastConfig } from './state.js';
import { inferBasePathHints, parseGitHubRepoInput } from './parseUrl.js';

export function initGitHubRepoConfigUi() {
  document.getElementById('save-gh-repo-config-btn')?.addEventListener('click', () => saveConfig());
  document.getElementById('gh-repo-clear-token-btn')?.addEventListener('click', () => clearToken());
  document.getElementById('gh-repo-parse-btn')?.addEventListener('click', () => parseRepoUrl());
  document.getElementById('gh-repo-url')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    parseRepoUrl();
  });
}

export async function loadGitHubRepoConfigUi() {
  try {
    const data = await fetchGitHubRepoSettings();
    setLastConfig(data);

    const enabledEl = document.getElementById('gh-repo-enabled');
    if (enabledEl) enabledEl.checked = !!data.enabled;

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = String(v ?? '');
    };
    setVal('gh-repo-owner', data.owner || '');
    setVal('gh-repo-name', data.repo || '');
    setVal('gh-repo-branch', data.branch || 'main');
    setVal('gh-repo-novels-path', data.novelsPath || 'novels/');
    setVal('gh-repo-comics-path', data.comicsPath || 'comics/');

    const tokenStatus = document.getElementById('gh-repo-token-status');
    if (tokenStatus) {
      tokenStatus.textContent = data.tokenFromEnv ? '（env ✓）' : data.hasToken ? '（已保存 ✓）' : '（未配置）';
    }

    const clearBtn = document.getElementById('gh-repo-clear-token-btn');
    if (clearBtn) clearBtn.style.display = !data.tokenFromEnv && data.hasToken ? '' : 'none';
  } catch (e) {
    showMsg('gh-repo-config-msg', e.message || '加载失败', 'error');
  }
}

function parseRepoUrl() {
  const urlEl = document.getElementById('gh-repo-url');
  const s = urlEl?.value?.trim() || '';
  if (!s) return showMsg('gh-repo-config-msg', '请粘贴 GitHub 仓库链接', 'error');

  try {
    const info = parseGitHubRepoInput(s);

    const enabledEl = document.getElementById('gh-repo-enabled');
    if (enabledEl && !enabledEl.checked) enabledEl.checked = true;

    setField('gh-repo-owner', info.owner);
    setField('gh-repo-name', info.repo);
    if (info.branch) setField('gh-repo-branch', info.branch);

    const hint = inferBasePathHints(info.subpath);
    if (hint.novelsPath) setFieldIfEmpty('gh-repo-novels-path', hint.novelsPath);
    if (hint.comicsPath) setFieldIfEmpty('gh-repo-comics-path', hint.comicsPath);
    const notes = [
      `已解析：${info.owner}/${info.repo}`,
      info.branch ? `分支：${info.branch}` : null,
      hint.note || null,
    ].filter(Boolean);
    showMsg('gh-repo-config-msg', notes.join('；'), 'success');
  } catch (e) {
    showMsg('gh-repo-config-msg', `仓库链接解析失败：${e.message || '未知错误'}`, 'error');
  }
}

function setField(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = String(value ?? '');
}

function setFieldIfEmpty(id, value) {
  const el = document.getElementById(id);
  if (el && !String(el.value || '').trim()) el.value = String(value ?? '');
}

async function saveConfig() {
  const enabled = !!document.getElementById('gh-repo-enabled')?.checked;
  const owner = document.getElementById('gh-repo-owner')?.value?.trim() || '';
  const repo = document.getElementById('gh-repo-name')?.value?.trim() || '';
  const branch = document.getElementById('gh-repo-branch')?.value?.trim() || 'main';
  const novelsPath = document.getElementById('gh-repo-novels-path')?.value?.trim() || 'novels/';
  const comicsPath = document.getElementById('gh-repo-comics-path')?.value?.trim() || 'comics/';
  const token = document.getElementById('gh-repo-token')?.value?.trim() || '';

  try {
    setBusy(true);
    showMsg('gh-repo-config-msg', '保存中...', '');
    await saveGitHubRepoSettings({
      enabled,
      owner,
      repo,
      branch,
      novelsPath,
      comicsPath,
      token: token || undefined,
    });
    showMsg('gh-repo-config-msg', '配置已保存', 'success');
    const tokenEl = document.getElementById('gh-repo-token');
    if (tokenEl) tokenEl.value = '';
    await loadGitHubRepoConfigUi();
  } catch (e) {
    showMsg('gh-repo-config-msg', e.message || '保存失败', 'error');
  } finally {
    setBusy(false);
  }
}

async function clearToken() {
  if (!confirm('确定清除已保存的 GitHub Token？（环境变量 GITHUB_REPO_TOKEN 不受影响）')) return;
  const cfg = getLastConfig() || {};
  try {
    setBusy(true);
    showMsg('gh-repo-config-msg', '清除中...', '');
    await saveGitHubRepoSettings({
      enabled: !!cfg.enabled,
      owner: cfg.owner || '',
      repo: cfg.repo || '',
      branch: cfg.branch || 'main',
      novelsPath: cfg.novelsPath || 'novels/',
      comicsPath: cfg.comicsPath || 'comics/',
      clearToken: true,
    });
    showMsg('gh-repo-config-msg', '已清除', 'success');
    await loadGitHubRepoConfigUi();
  } catch (e) {
    showMsg('gh-repo-config-msg', e.message || '清除失败', 'error');
  } finally {
    setBusy(false);
  }
}
