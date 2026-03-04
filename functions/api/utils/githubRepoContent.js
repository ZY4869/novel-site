const CONFIG_CACHE_MS = 30_000;
let cachedToken = null;
let cachedTokenAt = 0;

function nowMs() {
  return Date.now();
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
  cachedToken = null;
  cachedTokenAt = 0;
}

export function sanitizeRepoPath(inputPath, allowedPrefixes = []) {
  const raw = String(inputPath ?? '').trim();
  if (!raw) throw new Error('Empty path');
  if (raw.includes('\\') || raw.includes('\0')) throw new Error('Invalid path');

  const allowRoot = (allowedPrefixes || []).some((p) => String(p ?? '').trim() === '/');
  if (allowRoot && (/^\/+$/.test(raw) || raw === '.' || raw === './')) return '';

  const parts = raw
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) throw new Error('Invalid path');
  if (parts.some((p) => p === '.' || p === '..')) throw new Error('Invalid path');

  const clean = parts.join('/');

  if (allowRoot) return clean;

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

function throwGitHubApiError({ status, message, token }) {
  const msg = String(message || 'GitHub API error');
  const isRateLimit = status === 403 && /rate limit exceeded/i.test(msg);
  if (isRateLimit) {
    const hint = token
      ? '（已使用 Token 仍被限流，请稍后重试或更换 Token）'
      : '（匿名请求限额很低，建议配置 GITHUB_REPO_TOKEN 或在后台保存 Token）';
    const err = new Error(`GitHub API 触发限流：${msg}${hint}`);
    err.status = status;
    throw err;
  }

  const isBadRef = status === 404 && /No commit found for the ref/i.test(msg);
  if (isBadRef) {
    const err = new Error(`GitHub 分支/标签不存在：${msg}（请检查后台配置的 Branch，常见为 main 或 master）`);
    err.status = status;
    throw err;
  }

  const isNotFound = status === 404 && /not found/i.test(msg);
  if (isNotFound) {
    const hint = token
      ? '（已使用 Token 仍 404：请检查 owner/repo、目录路径是否存在，或 Token 是否对该仓库有权限）'
      : '（可能原因：仓库不存在 / 目录路径不存在 / 私有仓库未配置 Token）';
    const err = new Error(`GitHub 资源不存在或无权限：${msg}${hint}`);
    err.status = status;
    throw err;
  }

  const err = new Error(`GitHub API 请求失败：${status} ${msg}`);
  err.status = status;
  throw err;
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
    throwGitHubApiError({ status: res.status, message: msg, token });
  }

  return data;
}

export async function githubApiRaw(env, urlPath, { ref } = {}) {
  const token = await getRepoToken(env);
  const url = buildGitHubApiUrl(urlPath, { ref });

  const headers = {
    Accept: 'application/vnd.github.raw',
    'User-Agent': 'novel-site',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    let msg = res.statusText || 'GitHub API error';
    try {
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (data?.message) msg = String(data.message);
    } catch {}
    throwGitHubApiError({ status: res.status, message: msg, token });
  }
  return res;
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
    try {
      return await githubApiRaw(env, `/repos/${owner}/${repo}/contents/${apiPath}`, { ref: branch });
    } catch {}

    const meta = await githubApiJson(env, `/repos/${owner}/${repo}/contents/${apiPath}`, { ref: branch });
    if (!meta || meta.type !== 'file' || !meta.download_url) throw e;
    return await githubRawFetch(env, meta.download_url);
  }
}
