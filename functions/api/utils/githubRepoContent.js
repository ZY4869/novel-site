const CONFIG_CACHE_MS = 30_000;
let cachedConfig = null;
let cachedConfigAt = 0;
let cachedToken = null;
let cachedTokenAt = 0;

function nowMs() {
  return Date.now();
}

function normalizeBaseDir(dir, fallback) {
  const raw = String(dir ?? '').trim();
  const val = raw || fallback || '';
  const s = String(val).trim();
  if (!s) return '';
  if (s.includes('\\') || s.includes('\0')) return '';

  const parts = s
    .replace(/^\/+/, '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';

  return parts.join('/') + '/';
}

function normalizePathNoTrailingSlash(path) {
  const raw = String(path ?? '').trim();
  if (!raw) return '';
  const parts = raw
    .replace(/^\/+/, '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.join('/');
}

export async function getRepoConfig(env) {
  const ts = nowMs();
  if (cachedConfig && ts - cachedConfigAt < CONFIG_CACHE_MS) return cachedConfig;

  const keys = [
    'github_repo_enabled',
    'github_repo_owner',
    'github_repo_name',
    'github_repo_branch',
    'github_repo_novels_path',
    'github_repo_comics_path',
  ];

  const placeholders = keys.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM site_settings WHERE key IN (${placeholders})`
  ).bind(...keys).all();

  const map = {};
  for (const row of results || []) map[row.key] = row.value;

  const enabled = map.github_repo_enabled === 'true';
  const owner = String(map.github_repo_owner || '').trim();
  const repo = String(map.github_repo_name || '').trim();
  const branch = String(map.github_repo_branch || '').trim() || 'main';
  const novelsPath = normalizeBaseDir(map.github_repo_novels_path, 'novels/');
  const comicsPath = normalizeBaseDir(map.github_repo_comics_path, 'comics/');

  cachedConfig = { enabled, owner, repo, branch, novelsPath, comicsPath };
  cachedConfigAt = ts;
  return cachedConfig;
}

export async function getRepoToken(env) {
  const ts = nowMs();
  if (cachedToken !== null && ts - cachedTokenAt < CONFIG_CACHE_MS) return cachedToken;

  const fromEnv = String(env.GITHUB_REPO_TOKEN || '').trim();
  if (fromEnv) {
    cachedToken = fromEnv;
    cachedTokenAt = ts;
    return fromEnv;
  }

  const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'github_repo_token'").first();
  const token = String(row?.value || '').trim() || null;
  cachedToken = token;
  cachedTokenAt = ts;
  return token;
}

export function invalidateGitHubRepoCache() {
  cachedConfig = null;
  cachedConfigAt = 0;
  cachedToken = null;
  cachedTokenAt = 0;
}

export function sanitizeRepoPath(inputPath, allowedPrefixes = []) {
  const raw = String(inputPath ?? '').trim();
  if (!raw) throw new Error('Empty path');
  if (raw.includes('\\') || raw.includes('\0')) throw new Error('Invalid path');

  const parts = raw
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) throw new Error('Invalid path');
  if (parts.some((p) => p === '.' || p === '..')) throw new Error('Invalid path');

  const clean = parts.join('/');

  const allowed = (allowedPrefixes || [])
    .map((p) => normalizePathNoTrailingSlash(p))
    .filter(Boolean);
  if (allowed.length === 0) throw new Error('Invalid allowed prefixes');

  const ok = allowed.some((prefix) => clean === prefix || clean.startsWith(prefix + '/'));
  if (!ok) throw new Error('Path outside base directory');

  return clean;
}

function encodePathSegments(path) {
  return String(path || '')
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

export function buildGitHubApiUrl(urlPath, { ref } = {}) {
  const u = new URL(`https://api.github.com${urlPath}`);
  if (ref) u.searchParams.set('ref', ref);
  return u;
}

export function buildGitHubRawUrl({ owner, repo, branch }, path) {
  const safeOwner = String(owner || '').trim();
  const safeRepo = String(repo || '').trim();
  const safeBranch = String(branch || '').trim();
  const safePath = String(path || '').trim();
  return new URL(
    `https://raw.githubusercontent.com/${encodeURIComponent(safeOwner)}/${encodeURIComponent(safeRepo)}/${encodePathSegments(safeBranch)}/${encodePathSegments(safePath)}`
  );
}

export async function githubApiJson(env, urlPath, { ref } = {}) {
  const token = await getRepoToken(env);
  const url = buildGitHubApiUrl(urlPath, { ref });

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'novel-site',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), { headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = String(data?.message || res.statusText || 'GitHub API error');
    const isRateLimit = res.status === 403 && /rate limit exceeded/i.test(msg);
    if (isRateLimit) {
      const hint = token
        ? '（已使用 Token 仍被限流，请稍后重试或更换 Token）'
        : '（匿名请求限额很低，建议配置 GITHUB_REPO_TOKEN 或在后台保存 Token）';
      const err = new Error(`GitHub API 触发限流：${msg}${hint}`);
      err.status = res.status;
      throw err;
    }

    const err = new Error(`GitHub API 请求失败：${res.status} ${msg}`);
    err.status = res.status;
    throw err;
  }

  return data;
}

export async function githubRawFetch(env, rawUrl) {
  const token = await getRepoToken(env);
  const headers = { 'User-Agent': 'novel-site' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(String(rawUrl), { headers });
  if (!res.ok) {
    const err = new Error(`GitHub Raw 拉取失败：${res.status} ${res.statusText || 'error'}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

export async function githubRawFetchByPath(env, { owner, repo, branch }, cleanPath) {
  const rawUrl = buildGitHubRawUrl({ owner, repo, branch }, cleanPath);
  try {
    return await githubRawFetch(env, rawUrl.toString());
  } catch (e) {
    const apiPath = encodePathSegments(cleanPath);
    const meta = await githubApiJson(env, `/repos/${owner}/${repo}/contents/${apiPath}`, { ref: branch });
    if (!meta || meta.type !== 'file' || !meta.download_url) throw e;
    return await githubRawFetch(env, meta.download_url);
  }
}
