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

export async function scanGitHubRepo(type) {
  const res = await api('GET', `/api/admin/github-repo/scan?type=${encodeURIComponent(type)}`);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '扫描失败');
  return data;
}

export async function fetchGitHubRepoScanCache(type) {
  const res = await api('GET', `/api/admin/github-repo/cache?type=${encodeURIComponent(type)}`);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '读取缓存失败');
  return data;
}

export async function listGitHubComicPages(dir) {
  const res = await api('GET', `/api/admin/github-repo/comic-pages?dir=${encodeURIComponent(dir)}`);
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

export async function fetchGitHubRawBlob(path) {
  const res = await fetch(`/api/admin/github-repo/raw?path=${encodeURIComponent(path)}`, {
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
