import { api, authHeaders } from '../api.js';

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchGitHubRepoSettings() {
  const res = await api('GET', '/api/admin/settings?section=github_repo');
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '加载 GitHub 仓库配置失败');
  return data;
}

export async function saveGitHubRepoSettings(payload) {
  const res = await api('POST', '/api/admin/settings?section=github_repo', payload);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '保存 GitHub 仓库配置失败');
  return data;
}

export async function scanGitHubRepo(type, { repoId = null, dir = undefined } = {}) {
  const params = new URLSearchParams();
  params.set('type', String(type || ''));
  if (repoId) params.set('repo_id', String(repoId));
  if (dir !== undefined) params.set('dir', String(dir ?? ''));
  const res = await api('GET', `/api/admin/github-repo/scan?${params.toString()}`);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '扫描失败');
  return data;
}

export async function fetchGitHubRepoScanCache(type, { repoId = null, dir = undefined } = {}) {
  const params = new URLSearchParams();
  params.set('type', String(type || ''));
  if (repoId) params.set('repo_id', String(repoId));
  if (dir !== undefined) params.set('dir', String(dir ?? ''));
  const res = await api('GET', `/api/admin/github-repo/cache?${params.toString()}`);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '读取缓存失败');
  return data;
}

export async function listGitHubComicPages(dir, { repoId = null } = {}) {
  const params = new URLSearchParams();
  params.set('dir', String(dir || ''));
  if (repoId) params.set('repo_id', String(repoId));
  const res = await api('GET', `/api/admin/github-repo/comic-pages?${params.toString()}`);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '读取页列表失败');
  return data;
}

export async function bindGitHubNovel(payload) {
  const res = await api('POST', '/api/admin/github-repo/bind-book', payload);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '绑定失败');
  return data;
}

export async function bindGitHubComicDir(payload) {
  const res = await api('POST', '/api/admin/github-repo/bind-comic-dir', payload);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '绑定失败');
  return data;
}

export async function resolveGitHubRepoCategories(items, { autoCategory = true } = {}) {
  const payload = {
    type: 'novels',
    auto_category: autoCategory,
    items: Array.isArray(items) ? items : [],
  };
  const res = await api('POST', '/api/admin/github-repo/resolve-categories', payload);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '解析分类失败');
  return data;
}

export async function backfillGitHubRepoCategories({ repo_id, after_id = 0, limit = 200, dry_run = false } = {}) {
  const payload = { after_id, limit, dry_run };
  if (repo_id !== undefined) payload.repo_id = repo_id;
  const res = await api('POST', '/api/admin/github-repo/backfill-categories', payload);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '回填失败');
  return data;
}

export async function fetchGitHubRawBlob(path, { repoId = null } = {}) {
  const params = new URLSearchParams();
  params.set('path', String(path || ''));
  if (repoId) params.set('repo_id', String(repoId));
  const res = await fetch(`/api/admin/github-repo/raw?${params.toString()}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await readJson(res);
    throw new Error(data.error || '下载失败');
  }
  return await res.blob();
}
