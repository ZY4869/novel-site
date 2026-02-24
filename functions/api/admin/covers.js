// POST/DELETE /api/admin/covers — 上传/删除书籍封面（R2存储）
import { checkAdmin, validateId, checkBookOwnership } from '../_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const bookId = url.searchParams.get('book_id');
  if (!bookId || !validateId(bookId)) return Response.json({ error: 'Valid book_id required' }, { status: 400 });

  const book = await env.DB.prepare('SELECT id, cover_key FROM books WHERE id = ?').bind(bookId).first();
  if (!book) return Response.json({ error: 'Book not found' }, { status: 404 });

  // demo只能操作自己书的封面
  if (!await checkBookOwnership(auth, env, bookId)) {
    return Response.json({ error: '只能管理自己书籍的封面' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file || !file.size) return Response.json({ error: 'No file uploaded' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: 'File too large (max 5MB)' }, { status: 400 });

  const ct = file.type || 'image/jpeg';
  if (!ct.startsWith('image/')) return Response.json({ error: 'Only images allowed' }, { status: 400 });

  const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
  const key = `covers/${bookId}.${ext}`;
  const oldKey = book.cover_key;

  // 先写新封面到R2，再更新DB，DB失败则清理R2
  try {
    await env.R2.put(key, file.stream(), { httpMetadata: { contentType: ct } });
    await env.DB.prepare('UPDATE books SET cover_key = ? WHERE id = ?').bind(key, bookId).run();
  } catch (err) {
    // DB更新失败时清理已上传的新封面
    await env.R2.delete(key).catch(() => {});
    return Response.json({ error: 'Failed to update cover' }, { status: 500 });
  }
  // DB成功后再删旧封面（旧封面丢失无害）
  if (oldKey && oldKey !== key) {
    await env.R2.delete(oldKey).catch(() => {});
  }

  return Response.json({ success: true, cover_key: key });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const bookId = url.searchParams.get('book_id');
  if (!bookId || !validateId(bookId)) return Response.json({ error: 'Valid book_id required' }, { status: 400 });

  // demo只能操作自己书的封面
  if (!await checkBookOwnership(auth, env, bookId)) {
    return Response.json({ error: '只能管理自己书籍的封面' }, { status: 403 });
  }

  const book = await env.DB.prepare('SELECT cover_key FROM books WHERE id = ?').bind(bookId).first();
  const coverKey = book?.cover_key;
  // 先更新DB（可回滚），再删R2（孤儿无害）
  await env.DB.prepare('UPDATE books SET cover_key = NULL WHERE id = ?').bind(bookId).run();
  if (coverKey) {
    await env.R2.delete(coverKey).catch(() => {});
  }

  return Response.json({ success: true });
}
