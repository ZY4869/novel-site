import { showMsg } from '../ui.js';
import { fetchGitHubRepoSettings, saveGitHubRepoSettings } from './api.js';
import { setBusy } from './state.js';
import { initGitHubRepoReposUi, loadGitHubRepoReposUi } from './repos/page.js';

let lastSettings = null;

export function initGitHubRepoConfigUi() {
  document.getElementById('save-gh-repo-config-btn')?.addEventListener('click', () => saveConfig());
  document.getElementById('gh-repo-clear-token-btn')?.addEventListener('click', () => clearToken());

  initGitHubRepoReposUi({
    onSetDefault: async (repoId) => {
      await saveGitHubRepoSettings({ defaultRepoId: repoId });
      if (lastSettings) lastSettings.defaultRepoId = repoId;
    },
  });
}

export async function loadGitHubRepoConfigUi() {
  try {
    const data = await fetchGitHubRepoSettings();
    lastSettings = data || null;

    const enabledEl = document.getElementById('gh-repo-enabled');
    if (enabledEl) enabledEl.checked = !!data.enabled;

    const tokenStatus = document.getElementById('gh-repo-token-status');
    if (tokenStatus) {
      tokenStatus.textContent = data.tokenFromEnv ? '（env ✓）' : data.hasToken ? '（已保存 ✓）' : '（未配置）';
    }

    const clearBtn = document.getElementById('gh-repo-clear-token-btn');
    if (clearBtn) clearBtn.style.display = !data.tokenFromEnv && data.hasToken ? '' : 'none';

    await loadGitHubRepoReposUi({ defaultRepoId: data.defaultRepoId, legacy: data.legacy });
  } catch (e) {
    showMsg('gh-repo-config-msg', e.message || '加载失败', 'error');
  }
}

async function saveConfig() {
  const enabled = !!document.getElementById('gh-repo-enabled')?.checked;
  const token = document.getElementById('gh-repo-token')?.value?.trim() || '';

  try {
    setBusy(true);
    showMsg('gh-repo-config-msg', '保存中...', '');
    await saveGitHubRepoSettings({
      enabled,
      token: token || undefined,
    });
    showMsg('gh-repo-config-msg', '配置已保存', 'success');
    const tokenEl = document.getElementById('gh-repo-token');
    if (tokenEl) tokenEl.value = '';
    await loadGitHubRepoConfigUi();
    window.dispatchEvent(new CustomEvent('admin:github-repo-content-changed'));
  } catch (e) {
    showMsg('gh-repo-config-msg', e.message || '保存失败', 'error');
  } finally {
    setBusy(false);
  }
}

async function clearToken() {
  if (!confirm('确定清除已保存的 GitHub Token？（环境变量 GITHUB_REPO_TOKEN 不受影响）')) return;
  try {
    setBusy(true);
    showMsg('gh-repo-config-msg', '清除中...', '');
    await saveGitHubRepoSettings({
      clearToken: true,
    });
    showMsg('gh-repo-config-msg', '已清除', 'success');
    await loadGitHubRepoConfigUi();
    window.dispatchEvent(new CustomEvent('admin:github-repo-content-changed'));
  } catch (e) {
    showMsg('gh-repo-config-msg', e.message || '清除失败', 'error');
  } finally {
    setBusy(false);
  }
}
