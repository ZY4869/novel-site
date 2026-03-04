const CONFIG_CACHE_MS = 30_000;

let cachedState = null;
let cachedStateAt = 0;

function nowMs() {
  return Date.now();
}

function normalizeDir(dir, fallback) {
  const raw = String(dir ?? '').trim();
  const base = raw || fallback || '';
  const s = String(base).trim();
  if (!s) return '';
  if (s.includes('\\') || s.includes('\0')) return '';
  if (/^\/+$/.test(s) || s === '.' || s === './') return '/';

  const parts = s
    .replace(/^\/+/, '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  return parts.join('/') + '/';
}

function toIntOrNull(v) {
  const n = Number(String(v ?? '').trim());
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

async function loadState(env) {
  const ts = nowMs();
  if (cachedState && ts - cachedStateAt < CONFIG_CACHE_MS) return cachedState;

  const keys = [
    'github_repo_enabled',
    'github_repo_owner',
    'github_repo_name',
    'github_repo_branch',
    'github_repo_novels_path',
    'github_repo_comics_path',
    'github_repo_default_id',
  ];
  const placeholders = keys.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM site_settings WHERE key IN (${placeholders})`
  ).bind(...keys).all();

  const map = {};
  for (const row of results || []) map[row.key] = row.value;

  const globalEnabled = map.github_repo_enabled === 'true';
  const defaultRepoId = toIntOrNull(map.github_repo_default_id);

  const legacyOwner = String(map.github_repo_owner || '').trim();
  const legacyRepo = String(map.github_repo_name || '').trim();
  const legacyBranch = String(map.github_repo_branch || '').trim() || 'main';
  const legacyNovelsPath = normalizeDir(map.github_repo_novels_path, 'novels/');
  const legacyComicsPath = normalizeDir(map.github_repo_comics_path, 'comics/');

  let repos = [];
  try {
    const { results: rows } = await env.DB.prepare(
      `
        SELECT id, name, owner, repo, branch, novels_path, comics_path, enabled
        FROM github_repos
        ORDER BY id ASC
      `
    ).all();
    repos = (rows || []).map((r) => ({
      id: Number(r.id),
      name: String(r.name || '').trim(),
      owner: String(r.owner || '').trim(),
      repo: String(r.repo || '').trim(),
      branch: String(r.branch || '').trim() || 'main',
      novelsPath: normalizeDir(r.novels_path, 'novels/'),
      comicsPath: normalizeDir(r.comics_path, 'comics/'),
      enabled: r.enabled ? 1 : 0,
    }));
  } catch {
    repos = [];
  }

  cachedState = {
    globalEnabled,
    defaultRepoId,
    legacy: {
      owner: legacyOwner,
      repo: legacyRepo,
      branch: legacyBranch,
      novelsPath: legacyNovelsPath,
      comicsPath: legacyComicsPath,
    },
    repos,
  };
  cachedStateAt = ts;
  return cachedState;
}

export function invalidateGitHubReposCache() {
  cachedState = null;
  cachedStateAt = 0;
}

export async function getGitHubRepoGlobalEnabled(env) {
  const state = await loadState(env);
  return !!state.globalEnabled;
}

export async function getGitHubRepoDefaultId(env) {
  const state = await loadState(env);
  return state.defaultRepoId ?? null;
}

export async function listGitHubRepos(env, { enabledOnly = false } = {}) {
  const state = await loadState(env);
  const repos = state.repos || [];
  return enabledOnly ? repos.filter((r) => r.enabled) : repos;
}

export async function getGitHubRepoConfigById(env, repoId, { allowDisabled = false } = {}) {
  const id = Number(repoId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const state = await loadState(env);
  const found = (state.repos || []).find((r) => Number(r.id) === id);
  if (!found) return null;
  if (!allowDisabled && !found.enabled) return null;
  return found;
}

export async function getLegacyGitHubRepoConfig(env) {
  const state = await loadState(env);
  const legacy = state.legacy || {};
  if (!legacy.owner || !legacy.repo) return null;
  return {
    id: null,
    name: 'legacy',
    owner: legacy.owner,
    repo: legacy.repo,
    branch: legacy.branch || 'main',
    novelsPath: legacy.novelsPath || 'novels/',
    comicsPath: legacy.comicsPath || 'comics/',
    enabled: 1,
  };
}

export async function resolveGitHubRepoConfig(env, { repoId = null } = {}) {
  const state = await loadState(env);
  const enabledRepos = (state.repos || []).filter((r) => r.enabled);

  // explicit id
  const explicitId = toIntOrNull(repoId);
  if (explicitId) {
    return await getGitHubRepoConfigById(env, explicitId, { allowDisabled: false });
  }

  // legacy key / no repo_id: default id -> first enabled -> legacy
  const defId = state.defaultRepoId;
  if (defId) {
    const byId = enabledRepos.find((r) => Number(r.id) === defId);
    if (byId) return byId;
  }
  if (enabledRepos.length > 0) return enabledRepos[0];

  return await getLegacyGitHubRepoConfig(env);
}

export function normalizeGitHubRepoDir(input, fallback) {
  return normalizeDir(input, fallback);
}

