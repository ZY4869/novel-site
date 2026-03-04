import { api } from '../api.js';

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function requireOk(res, data, fallbackMsg) {
  if (res.ok) return;
  throw new Error(data?.error || fallbackMsg || '请求失败');
}

export async function fetchAdminCategories() {
  const res = await api('GET', '/api/admin/categories');
  const data = await readJson(res);
  requireOk(res, data, '加载分类失败');
  return data.categories || [];
}

export async function createCategory({ name, is_special, marks } = {}) {
  const res = await api('POST', '/api/admin/categories', { name, is_special, marks });
  const data = await readJson(res);
  requireOk(res, data, '创建分类失败');
  return data;
}

export async function updateCategory({ id, name, is_special, marks } = {}) {
  const res = await api('PUT', '/api/admin/categories', { id, name, is_special, marks });
  const data = await readJson(res);
  requireOk(res, data, '更新分类失败');
  return data;
}

export async function deleteCategory({ id } = {}) {
  const res = await api('DELETE', '/api/admin/categories', { id });
  const data = await readJson(res);
  requireOk(res, data, '删除分类失败');
  return data;
}

export async function setBookCategories({ book_id, category_ids } = {}) {
  const res = await api('PUT', '/api/admin/book-categories', { book_id, category_ids });
  const data = await readJson(res);
  requireOk(res, data, '设置书籍分类失败');
  return data;
}

export async function setCategoryBooks({ category_id, book_ids } = {}) {
  const res = await api('PUT', '/api/admin/category-books', { category_id, book_ids });
  const data = await readJson(res);
  requireOk(res, data, '设置分类书籍失败');
  return data;
}

