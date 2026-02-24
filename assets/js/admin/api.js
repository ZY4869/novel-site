import { getToken } from './state.js';

export function api(method, url, body) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(url, opts);
}

export function authHeaders(extra = {}) {
  return Object.assign({ Authorization: `Bearer ${getToken()}` }, extra);
}

export function headerSafeValue(v) {
  const s = String(v ?? '');
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 255) return encodeURIComponent(s);
  }
  return s;
}

export async function uploadBookSource(bookId, file) {
  if (!file) throw new Error('未选择源文件');
  const res = await fetch(`/api/admin/books/${bookId}/source`, {
    method: 'PUT',
    headers: authHeaders({
      'X-File-Name': headerSafeValue(file.name || 'file'),
      'X-File-Size': String(file.size || 0),
      'Content-Type': file.type || 'application/octet-stream',
    }),
    body: file,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data.error || '源文件上传失败');
  return data;
}

export async function uploadComicSource(comicId, file) {
  if (!file) throw new Error('未选择漫画源文件');
  const res = await fetch(`/api/admin/comics/${comicId}/source`, {
    method: 'PUT',
    headers: authHeaders({
      'X-File-Name': headerSafeValue(file.name || 'comic.cbz'),
      'X-File-Size': String(file.size || 0),
      'Content-Type': file.type || 'application/zip',
    }),
    body: file,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data.error || '漫画源文件上传失败');
  return data;
}

export async function uploadComicPage(comicId, pageIndex, blob, origName) {
  const res = await fetch(`/api/admin/comics/${comicId}/pages/${pageIndex}`, {
    method: 'PUT',
    headers: authHeaders({
      'X-File-Size': String(blob.size || 0),
      'X-Orig-Name': headerSafeValue(origName || ''),
      'Content-Type': blob.type || 'application/octet-stream',
    }),
    body: blob,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data.error || `第 ${pageIndex} 页上传失败`);
  return data;
}

export async function concurrentUpload(tasks, concurrency = 3) {
  let idx = 0;
  const results = [];
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

