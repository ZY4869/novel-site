// PUT /api/admin/books/:id/source-meta — 回填/修复书籍源文件元数据（章数/字数）
import { checkAdmin, checkBookOwnership, parseJsonBody, parseNullableInt, validateId } from '../../../_utils.js';

export async function onRequestPut(context) {
  const { request, env, params } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) {
    const status = auth.reason === 'locked' ? 429 : 401;
    const msg = auth.reason === 'locked' ? 'Too many failed attempts, try again later' : 'Unauthorized';
    return Response.json({ error: msg }, { status });
  }

  const bookId = params.id;
  if (!validateId(bookId)) return Response.json({ error: 'Invalid book ID' }, { status: 400 });

  const book = await env.DB.prepare(
    'SELECT id, source_chapter_count, source_word_count FROM books WHERE id = ?'
  ).bind(bookId).first();
  if (!book) return Response.json({ error: 'Book not found' }, { status: 404 });

  // demo 只能操作自己创建的书
  if (!await checkBookOwnership(auth, env, bookId)) {
    return Response.json({ error: '只能管理自己创建的书籍' }, { status: 403 });
  }

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const chapter = parseNullableInt(body.source_chapter_count, { min: 0, max: 10000 });
  if (!chapter.ok) return Response.json({ error: 'Invalid source_chapter_count' }, { status: 400 });

  const words = parseNullableInt(body.source_word_count, { min: 0, max: 50000000 });
  if (!words.ok) return Response.json({ error: 'Invalid source_word_count' }, { status: 400 });

  if (chapter.value === undefined && words.value === undefined) {
    return Response.json({ error: 'Missing source meta fields' }, { status: 400 });
  }

  const newChapterCount = chapter.value === undefined ? book.source_chapter_count : chapter.value;
  const newWordCount = words.value === undefined ? book.source_word_count : words.value;

  await env.DB.prepare(
    "UPDATE books SET source_chapter_count = ?, source_word_count = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newChapterCount, newWordCount, bookId).run();

  return Response.json({
    success: true,
    source_chapter_count: newChapterCount,
    source_word_count: newWordCount,
  });
}

