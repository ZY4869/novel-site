import { fetchGitHubRepoSettings } from './api.js';
import { fetchGitHubRepos } from './repos/api.js';

let enabledRepos = [];
let repoById = new Map();
let legacyConfig = null;
let defaultRepoId = null;

export async function refreshGitHubRepoContext() {
  const [reposData, settingsData] = await Promise.all([
    fetchGitHubRepos().catch(() => ({ repos: [] })),
    fetchGitHubRepoSettings().catch(() => ({})),
  ]);

  const repos = Array.isArray(reposData?.repos) ? reposData.repos : [];
  enabledRepos = repos.filter((r) => r && r.enabled);
  repoById = new Map(enabledRepos.map((r) => [Number(r.id), r]));

  legacyConfig = settingsData?.legacy || null;
  defaultRepoId = settingsData?.defaultRepoId ?? null;

  return getGitHubRepoContext();
}

export function getGitHubRepoContext() {
  return { enabledRepos, repoById, legacyConfig, defaultRepoId };
}

export function parseRepoSelectValue(v) {
  const s = String(v || '').trim();
  if (!s || s === 'all') return { mode: 'all', repoId: null };
  if (s === 'default') return { mode: 'repo', repoId: null };
  if (/^\d+$/.test(s)) return { mode: 'repo', repoId: Number(s) };
  return { mode: 'all', repoId: null };
}

export function fillGitHubRepoSelect(selectEl) {
  if (!selectEl) return;
  const cur = String(selectEl.value || 'all');
  selectEl.innerHTML = '';

  const { legacyConfig: legacy, defaultRepoId: defId } = getGitHubRepoContext();

  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = '全部仓库';
  selectEl.appendChild(optAll);

  if (enabledRepos.length === 0) {
    const opt = document.createElement('option');
    opt.value = 'default';
    opt.textContent = legacy?.owner && legacy?.repo ? '默认仓库（旧配置）' : '默认仓库（未配置）';
    selectEl.appendChild(opt);
  } else {
    for (const r of enabledRepos) {
      const opt = document.createElement('option');
      opt.value = String(r.id);
      const base = String(r.name || '').trim() || `${r.owner}/${r.repo}`;
      opt.textContent = defId && Number(defId) === Number(r.id) ? `${base}（默认）` : base;
      selectEl.appendChild(opt);
    }
  }

  const values = Array.from(selectEl.options).map((o) => o.value);
  selectEl.value = values.includes(cur) ? cur : 'all';
}

export function repoLabel(repoId) {
  const { legacyConfig: legacy } = getGitHubRepoContext();

  if (!repoId) {
    if (legacy?.owner && legacy?.repo) return `${legacy.owner}/${legacy.repo}`;
    return '默认仓库';
  }
  const r = repoById.get(Number(repoId));
  if (!r) return `repo#${repoId}`;
  return String(r.name || '').trim() || `${r.owner}/${r.repo}`;
}

export function decorateItems(items) {
  for (const it of items || []) {
    it.repoLabel = repoLabel(it.repo_id ?? null);
  }
  return items || [];
}

export function sortByRepoThenName(items) {
  return (items || []).sort((a, b) => {
    const ra = String(a.repoLabel || '');
    const rb = String(b.repoLabel || '');
    if (ra !== rb) return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function getNovelsBaseByRepoId(repoId) {
  const { legacyConfig: legacy } = getGitHubRepoContext();
  if (!repoId) return legacy?.novelsPath || 'novels/';
  return repoById.get(Number(repoId))?.novelsPath || 'novels/';
}

export function getComicsBaseByRepoId(repoId) {
  const { legacyConfig: legacy } = getGitHubRepoContext();
  if (!repoId) return legacy?.comicsPath || 'comics/';
  return repoById.get(Number(repoId))?.comicsPath || 'comics/';
}

