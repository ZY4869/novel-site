// POST /api/admin/github-repo/bind-book — 直连绑定 GitHub 小说文件为书籍（仅超管）
import { checkAdmin, requireSuperAdmin, parseJsonBody } from '../../_utils.js';
import { getRepoConfig, githubApiJson, sanitizeRepoPath } from '../../utils/githubRepoContent.js';

function encodePathSegments(path) {
  return String(path || '')
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

function ensureConfigReady(config) {
  if (!config?.enabled) throw new Error('GitHub 仓库内容未启用');
  if (!config.owner || !config.repo || !config.branch) throw new Error('GitHub 仓库配置不完整');
  if (!config.novelsPath) throw new Error('GitHub 小说目录配置不完整');
}

function guessSourceType(nameOrPath) {
  const n = String(nameOrPath || '').toLowerCase();
  if (n.endsWith('.epub')) return 'application/epub+zip';
  if (n.endsWith('.txt') || n.endsWith('.text')) return 'text/plain';
  return 'application/octet-stream';
}

function isAllowedNovelFile(path) {
  const n = String(path || '').toLowerCase();
  return n.endsWith('.txt') || n.endsWith('.text') || n.endsWith('.epub');
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可使用' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const title = String(body.title || '').trim().slice(0, 200);
  const author = String(body.author || '').trim().slice(0, 100);
  const description = String(body.description || '').trim().slice(0, 2000);
  const path = String(body.path || '').trim();
  const clientName = typeof body.name === 'string' ? body.name.trim() : '';
  const clientSize = Number(body.size || 0);

  if (!title) return Response.json({ error: '请输入书名' }, { status: 400 });
  if (!path) return Response.json({ error: 'Missing path' }, { status: 400 });

  try {
    const config = await getRepoConfig(env);
    ensureConfigReady(config);

    const cleanPath = sanitizeRepoPath(path, [config.novelsPath]);
    if (!isAllowedNovelFile(cleanPath)) return Response.json({ error: '仅支持 TXT/EPUB 文件绑定' }, { status: 400 });

    const sourceKey = `gh:${cleanPath}`;

    const existing = await env.DB.prepare('SELECT id, title, source_name, source_size FROM books WHERE source_key = ? LIMIT 1')
      .bind(sourceKey)
      .first();
    if (existing?.id) {
      return Response.json({
        success: true,
        alreadyExists: true,
        book: {
          id: existing.id,
          title: existing.title || '',
          source_name: existing.source_name || null,
          source_size: Number(existing.source_size || 0) || 0,
        },
      });
    }

    let sourceName = String(cleanPath.split('/').pop() || 'file');
    let sourceSize = 0;

    const safeClientSize = Number.isFinite(clientSize) && clientSize >= 0 ? Math.floor(clientSize) : null;
    const baseName = sourceName;
    const safeClientName = clientName && clientName === baseName ? clientName : null;

    if (safeClientName && safeClientSize !== null) {
      sourceName = safeClientName;
      sourceSize = safeClientSize;
    } else {
      const apiPath = encodePathSegments(cleanPath);
      const meta = await githubApiJson(env, `/repos/${config.owner}/${config.repo}/contents/${apiPath}`, { ref: config.branch });
      if (!meta || meta.type !== 'file') return Response.json({ error: 'GitHub 文件不存在或不是文件' }, { status: 404 });
      sourceName = String(meta.name || sourceName);
      sourceSize = Number(meta.size || 0) || 0;
    }

    sourceName = sourceName.slice(0, 120);
    const sourceType = guessSourceType(sourceName);

    const result = await env.DB.prepare(
      `
        INSERT INTO books (
          title, author, description, created_by,
          source_key, source_name, source_type, source_size,
          source_uploaded_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `
    )
      .bind(title, author, description, auth.userId, sourceKey, sourceName, sourceType, sourceSize)
      .run();

    return Response.json({
      success: true,
      book: {
        id: result.meta.last_row_id,
        title,
        source_name: sourceName,
        source_size: sourceSize,
      },
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed' }, { status: 400 });
  }
}
