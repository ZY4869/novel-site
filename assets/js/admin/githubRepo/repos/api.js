import { api } from '../../api.js';

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchGitHubRepos() {
  const res = await api('GET', '/api/admin/github-repos');
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '加载仓库列表失败');
  return data;
}

export async function createGitHubRepo(payload) {
  const res = await api('POST', '/api/admin/github-repos', payload);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '创建仓库失败');
  return data;
}

export async function updateGitHubRepo(payload) {
  const res = await api('PUT', '/api/admin/github-repos', payload);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '更新仓库失败');
  return data;
}

export async function deleteGitHubRepo(id) {
  const res = await api('DELETE', '/api/admin/github-repos', { id });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '删除仓库失败');
  return data;
}

