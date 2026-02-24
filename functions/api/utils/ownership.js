import { requireMinRole } from './roles.js';

// demo 角色的书籍所有权检查：返回 true 表示允许操作
export async function checkBookOwnership(auth, env, bookId) {
  if (requireMinRole(auth, 'admin')) return true;
  const book = await env.DB.prepare('SELECT created_by FROM books WHERE id = ?').bind(bookId).first();
  if (!book) return false;
  return book.created_by === auth.userId;
}

// demo 角色的漫画所有权检查：返回 true 表示允许操作
export async function checkComicOwnership(auth, env, comicId) {
  if (requireMinRole(auth, 'admin')) return true;
  const comic = await env.DB.prepare('SELECT created_by FROM comics WHERE id = ?').bind(comicId).first();
  if (!comic) return false;
  return comic.created_by === auth.userId;
}

