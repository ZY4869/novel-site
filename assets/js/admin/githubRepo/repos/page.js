import { showMsg, esc } from '../../ui.js';
import { createGitHubRepo, deleteGitHubRepo, fetchGitHubRepos } from './api.js';
import { initGitHubRepoEditOverlay, openGitHubRepoEditOverlay } from './overlay.js';

let onSetDefaultRepoId = null;
let cachedDefaultRepoId = null;
let cachedLegacy = null;

export function initGitHubRepoReposUi({ onSetDefault } = {}) {
  onSetDefaultRepoId = typeof onSetDefault === 'function' ? onSetDefault : null;

  initGitHubRepoEditOverlay({
    onSaved: async () => {
      await loadGitHubRepoReposUi({ defaultRepoId: cachedDefaultRepoId, legacy: cachedLegacy });
      showMsg('gh-repo-repos-msg', '已保存', 'success');
      window.dispatchEvent(new CustomEvent('admin:github-repo-content-changed'));
    },
  });

  document.getElementById('gh-repo-add-repo-btn')?.addEventListener('click', () => openGitHubRepoEditOverlay(null));
  document.getElementById('gh-repo-import-legacy-btn')?.addEventListener('click', () => importLegacy());

  document.getElementById('gh-repo-repos-list')?.addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-repo-id]');
    if (!li) return;
    const id = Number(li.dataset.repoId);
    if (!Number.isFinite(id) || id <= 0) return;

    if (e.target.classList.contains('btn-gh-repo-edit')) {
      const repo = (await safeLoadRepos()).find((r) => Number(r.id) === id) || null;
      openGitHubRepoEditOverlay(repo);
      return;
    }

    if (e.target.classList.contains('btn-gh-repo-delete')) {
      if (!confirm('确定删除该仓库配置？（不会删除已导入/已绑定的书籍记录）')) return;
      try {
        await deleteGitHubRepo(id);
        showMsg('gh-repo-repos-msg', '已删除', 'success');
        await loadGitHubRepoReposUi({ defaultRepoId: cachedDefaultRepoId, legacy: cachedLegacy });
        window.dispatchEvent(new CustomEvent('admin:github-repo-content-changed'));
      } catch (err) {
        showMsg('gh-repo-repos-msg', err.message || '删除失败', 'error');
      }
      return;
    }

    if (e.target.classList.contains('btn-gh-repo-default')) {
      if (!onSetDefaultRepoId) return;
      try {
        await onSetDefaultRepoId(id);
        cachedDefaultRepoId = id;
        showMsg('gh-repo-repos-msg', '已设置为默认仓库', 'success');
        await loadGitHubRepoReposUi({ defaultRepoId: cachedDefaultRepoId, legacy: cachedLegacy });
        window.dispatchEvent(new CustomEvent('admin:github-repo-content-changed'));
      } catch (err) {
        showMsg('gh-repo-repos-msg', err.message || '设置失败', 'error');
      }
    }
  });

}

export async function loadGitHubRepoReposUi({ defaultRepoId, legacy } = {}) {
  cachedDefaultRepoId = defaultRepoId ?? null;
  cachedLegacy = legacy || null;

  const importBtn = document.getElementById('gh-repo-import-legacy-btn');
  if (importBtn) {
    const hasLegacy = !!(legacy && legacy.owner && legacy.repo);
    importBtn.style.display = hasLegacy ? '' : 'none';
  }

  const repos = await safeLoadRepos();
  renderRepoList(repos, { defaultRepoId: cachedDefaultRepoId });

  if (importBtn) {
    const hasLegacy = !!(legacy && legacy.owner && legacy.repo);
    importBtn.style.display = hasLegacy && repos.length === 0 ? '' : 'none';
  }
}

async function safeLoadRepos() {
  try {
    const data = await fetchGitHubRepos();
    return Array.isArray(data.repos) ? data.repos : [];
  } catch (err) {
    showMsg('gh-repo-repos-msg', err.message || '加载失败', 'error');
    return [];
  }
}

function renderRepoList(repos, { defaultRepoId } = {}) {
  const el = document.getElementById('gh-repo-repos-list');
  if (!el) return;

  if (!repos || repos.length === 0) {
    el.innerHTML = '<li style="padding:12px 0;color:var(--text-light)">暂无仓库配置</li>';
    return;
  }

  el.innerHTML = repos
    .map((r) => {
      const id = Number(r.id);
      const name = String(r.name || '').trim() || `${r.owner}/${r.repo}`;
      const enabled = r.enabled ? 1 : 0;
      const isDefault = defaultRepoId && Number(defaultRepoId) === id;
      const badges = [
        isDefault ? '<span class="tag-pill" style="margin-left:6px">默认</span>' : '',
        enabled ? '' : '<span class="tag-pill" style="margin-left:6px;background:#555">停用</span>',
      ].join('');

      const meta = [
        `${esc(r.owner)}/${esc(r.repo)} @ ${esc(r.branch || 'main')}`,
        `novels: ${esc(r.novelsPath || '')}`,
        `comics: ${esc(r.comicsPath || '')}`,
      ].join('；');

      return `
        <li data-repo-id="${id}">
          <div class="item-info">
            <div class="item-title">${esc(name)}${badges}</div>
            <div class="item-meta">${meta}</div>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-gh-repo-default">设为默认</button>
            <button class="btn btn-sm btn-gh-repo-edit">编辑</button>
            <button class="btn btn-sm btn-danger btn-gh-repo-delete">删除</button>
          </div>
        </li>
      `;
    })
    .join('');
}

async function importLegacy() {
  if (!cachedLegacy || !cachedLegacy.owner || !cachedLegacy.repo) return;
  const ok = confirm(`导入旧配置为一个仓库记录？\n${cachedLegacy.owner}/${cachedLegacy.repo} @ ${cachedLegacy.branch || 'main'}`);
  if (!ok) return;

  try {
    const payload = {
      name: `${cachedLegacy.owner}/${cachedLegacy.repo}`,
      owner: cachedLegacy.owner,
      repo: cachedLegacy.repo,
      branch: cachedLegacy.branch || 'main',
      novelsPath: cachedLegacy.novelsPath || 'novels/',
      comicsPath: cachedLegacy.comicsPath || 'comics/',
      enabled: 1,
    };
    const created = await createGitHubRepo(payload);
    const newId = created?.repo?.id;
    if (newId && onSetDefaultRepoId) {
      await onSetDefaultRepoId(newId);
      cachedDefaultRepoId = Number(newId);
    }
    showMsg('gh-repo-repos-msg', '已导入旧配置', 'success');
    await loadGitHubRepoReposUi({ defaultRepoId: cachedDefaultRepoId, legacy: cachedLegacy });
    window.dispatchEvent(new CustomEvent('admin:github-repo-content-changed'));
  } catch (err) {
    showMsg('gh-repo-repos-msg', err.message || '导入失败', 'error');
  }
}
