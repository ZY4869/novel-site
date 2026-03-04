// POST /api/admin/github-repo/bind-book — 直连绑定 GitHub 小说文件为书籍（仅超管）
import { checkAdmin, requireSuperAdmin, parseJsonBody, validateId } from '../../_utils.js';
import { githubApiJson, sanitizeRepoPath } from '../../utils/githubRepoContent.js';
import { getGitHubRepoGlobalEnabled, resolveGitHubRepoConfig } from '../../utils/githubRepos.js';

const MAX_CATEGORY_IDS = 20;

function encodePathSegments(path) {
  return String(path || '')
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

function ensureConfigReady(config) {
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
  const repoIdRaw = body.repo_id ?? body.repoId ?? null;
  const clientName = typeof body.name === 'string' ? body.name.trim() : '';
  const clientSize = Number(body.size || 0);

  // optional: categories
  let categoryIds = [];
  if (Array.isArray(body.category_ids)) {
    if (body.category_ids.length > MAX_CATEGORY_IDS) {
      return Response.json({ error: `最多选择 ${MAX_CATEGORY_IDS} 个分类` }, { status: 400 });
    }
    for (const id of body.category_ids) {
      if (!validateId(String(id))) return Response.json({ error: 'Invalid category_id: ' + id }, { status: 400 });
    }
    categoryIds = Array.from(
      new Set(body.category_ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))
    );
  }

  if (!title) return Response.json({ error: '请输入书名' }, { status: 400 });
  if (!path) return Response.json({ error: 'Missing path' }, { status: 400 });

  try {
    const enabled = await getGitHubRepoGlobalEnabled(env);
    if (!enabled) throw new Error('GitHub 仓库内容未启用');

    if (repoIdRaw !== null && repoIdRaw !== undefined && !/^\d+$/.test(String(repoIdRaw))) {
      return Response.json({ error: 'Invalid repo_id' }, { status: 400 });
    }
    const repoId = repoIdRaw ? Number(repoIdRaw) : null;

    const config = await resolveGitHubRepoConfig(env, { repoId });
    if (!config) throw new Error('未找到可用的 GitHub 仓库配置');
    ensureConfigReady(config);

    const cleanPath = sanitizeRepoPath(path, [config.novelsPath]);
    if (!isAllowedNovelFile(cleanPath)) return Response.json({ error: '仅支持 TXT/EPUB 文件绑定' }, { status: 400 });

    const sourceKey = config.id ? `gh:${config.id}:${cleanPath}` : `gh:${cleanPath}`;
    const legacySourceKey = `gh:${cleanPath}`;

    let existing = await env.DB.prepare('SELECT id, title, source_name, source_size FROM books WHERE source_key = ? LIMIT 1')
      .bind(sourceKey)
      .first();
    if (!existing?.id && config.id) {
      const defaultConfig = await resolveGitHubRepoConfig(env, { repoId: null });
      const defaultId = defaultConfig?.id ?? null;
      if (defaultId && defaultId === config.id) {
        existing = await env.DB.prepare('SELECT id, title, source_name, source_size FROM books WHERE source_key = ? LIMIT 1')
          .bind(legacySourceKey)
          .first();
      }
    }
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

    const bookId = result.meta.last_row_id;

    if (categoryIds.length > 0 && bookId) {
      try {
        const placeholders = categoryIds.map(() => '?').join(',');
        const { results: validCats } = await env.DB.prepare(
          `SELECT id FROM book_categories WHERE id IN (${placeholders})`
        ).bind(...categoryIds).all();
        const validSet = new Set((validCats || []).map((c) => c.id));
        const validIds = categoryIds.filter((id) => validSet.has(id));
        if (validIds.length > 0) {
          await env.DB.batch(
            validIds.map((cid) =>
              env.DB.prepare('INSERT OR IGNORE INTO book_category_books (category_id, book_id) VALUES (?, ?)').bind(cid, bookId)
            )
          );
        }
      } catch (e) {
        console.error('attach categories on bind-book error:', e);
      }
    }

    return Response.json({
      success: true,
      book: {
        id: bookId,
        title,
        source_name: sourceName,
        source_size: sourceSize,
      },
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed' }, { status: 400 });
  }
}
