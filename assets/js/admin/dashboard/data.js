import { api } from '../api.js';

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchBooks() {
  const res = await fetch('/api/books', { credentials: 'same-origin' });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '加载书籍失败');
  return data.books || [];
}

export async function fetchComics() {
  const res = await fetch('/api/comics', { credentials: 'same-origin' });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '加载漫画失败');
  return data.comics || [];
}

export async function fetchAdminStats() {
  const res = await api('GET', '/api/admin/stats');
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '加载统计失败');
  return data;
}

export async function fetchNowProgress() {
  const res = await api('GET', '/api/admin/progress/now');
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '加载进度失败');
  return data.now || null;
}

export async function fetchContent(kind, id) {
  const res = await api(
    'GET',
    `/api/admin/dashboard/content?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`
  );
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || '加载内容失败');
  return data;
}

