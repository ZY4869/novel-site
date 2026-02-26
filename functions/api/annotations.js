import { checkAdmin, ensureAnnotationSchema } from './_utils.js';

// POST /api/annotations - 创建批注
export async function onRequestPost(context) {
  const { request, env } = context;
  
  // 需要登录
  const auth = await checkAdmin(request, env);
  if (!auth.ok) {
    return Response.json({ error: '请先登录' }, { status: 401 });
  }

  await ensureAnnotationSchema(env);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const { chapterId, bookId, paraIdx, sentIdx, sentHash, sentText, content, visibility } = body;

  // 参数校验
  if (!chapterId || !bookId || paraIdx == null || sentIdx == null || !sentHash || !sentText || !content) {
    return Response.json({ error: '缺少必要参数' }, { status: 400 });
  }
  if (content.length > 500) {
    return Response.json({ error: '批注内容不能超过500字' }, { status: 400 });
  }
  if (!['public', 'private'].includes(visibility)) {
    return Response.json({ error: '无效的可见性设置' }, { status: 400 });
  }

  // 检查书籍是否允许批注
  const book = await env.DB.prepare('SELECT annotation_enabled FROM books WHERE id = ?').bind(bookId).first();
  if (!book || !book.annotation_enabled) {
    return Response.json({ error: '该书籍未开启批注功能' }, { status: 403 });
  }

  try {
    const result = await env.DB.prepare(`
      INSERT INTO annotations (chapter_id, book_id, user_id, para_idx, sent_idx, sent_hash, sent_text, content, visibility)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(chapterId, bookId, auth.userId, paraIdx, sentIdx, sentHash, sentText, content, visibility).run();

    return Response.json({ 
      success: true, 
      id: result.meta.last_row_id 
    });
  } catch (e) {
    console.error('创建批注失败:', e);
    return Response.json({ error: '创建失败' }, { status: 500 });
  }
}

// GET /api/annotations?chapterId=X&paraIdx=Y&sentIdx=Z&sort=latest|hot - 获取某句子的批注列表
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const chapterId = url.searchParams.get('chapterId');
  const paraIdx = url.searchParams.get('paraIdx');
  const sentIdx = url.searchParams.get('sentIdx');
  const sort = url.searchParams.get('sort') || 'latest';

  if (!chapterId || paraIdx == null || sentIdx == null) {
    return Response.json({ error: '缺少参数' }, { status: 400 });
  }

  await ensureAnnotationSchema(env);

  // 可选认证
  let userId = -1;
  const auth = await checkAdmin(request, env);
  if (auth.ok) userId = auth.userId;

  const orderBy = sort === 'hot' ? 'like_count DESC, a.created_at DESC' : 'a.created_at DESC';

  const rows = await env.DB.prepare(`
    SELECT a.id, a.content, a.visibility, a.created_at, a.user_id,
           u.username, u.avatar_url,
           CASE WHEN a.user_id = ? THEN 1 ELSE 0 END as is_mine,
           (SELECT COUNT(*) FROM annotation_likes WHERE annotation_id = a.id) as like_count,
           (SELECT 1 FROM annotation_likes WHERE annotation_id = a.id AND user_id = ?) as liked
    FROM annotations a
    LEFT JOIN admin_users u ON a.user_id = u.id
    WHERE a.chapter_id = ? AND a.para_idx = ? AND a.sent_idx = ? AND a.status = 'normal'
      AND (a.visibility = 'public' OR a.user_id = ?)
    ORDER BY ${orderBy}
  `).bind(userId, userId, chapterId, paraIdx, sentIdx, userId).all();

  return Response.json({ annotations: rows.results });
}
