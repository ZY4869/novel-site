// POST /api/admin/github-repo/bind-comic-dir — 直连绑定 GitHub 图片目录为漫画（仅超管）
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
  if (!config.comicsPath) throw new Error('GitHub 漫画目录配置不完整');
}

function isSupportedImage(name) {
  return /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(String(name || ''));
}

function guessImageMime(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'avif') return 'image/avif';
  if (ext === 'bmp') return 'image/bmp';
  return 'application/octet-stream';
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可使用' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const title = String(body.title || '').trim().slice(0, 200);
  const description = String(body.description || '').trim().slice(0, 2000);
  const dir = String(body.dir || '').trim();
  if (!title) return Response.json({ error: '请输入标题' }, { status: 400 });
  if (!dir) return Response.json({ error: 'Missing dir' }, { status: 400 });

  let comicId = null;

  try {
    const config = await getRepoConfig(env);
    ensureConfigReady(config);

    const cleanDir = sanitizeRepoPath(dir, [config.comicsPath]);
    const apiPath = encodePathSegments(cleanDir);

    const data = await githubApiJson(env, `/repos/${config.owner}/${config.repo}/contents/${apiPath}`, { ref: config.branch });
    if (!Array.isArray(data)) return Response.json({ error: 'GitHub 返回不是目录列表' }, { status: 400 });

    const images = data
      .filter((x) => x && x.type === 'file' && isSupportedImage(x.name))
      .map((x) => ({
        name: x.name,
        path: x.path,
        size: Number(x.size || 0) || 0,
        contentType: guessImageMime(x.name),
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' }));

    if (images.length === 0) return Response.json({ error: '目录下未找到图片文件' }, { status: 400 });
    if (images.length > 2000) return Response.json({ error: '页数过多（超过 2000 页），请拆分目录' }, { status: 400 });

    const created = await env.DB.prepare(
      `
        INSERT INTO comics (title, description, created_by, page_count, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `
    )
      .bind(title, description, auth.userId, images.length)
      .run();

    comicId = created.meta.last_row_id;
    if (!comicId) throw new Error('创建漫画失败');

    const stmts = images.map((img, idx) =>
      env.DB.prepare(
        `
          INSERT OR REPLACE INTO comic_pages
          (comic_id, page_index, image_key, size_bytes, content_type)
          VALUES (?, ?, ?, ?, ?)
        `
      ).bind(comicId, idx + 1, `gh:${img.path}`, img.size, img.contentType)
    );

    for (const part of chunk(stmts, 200)) {
      await env.DB.batch(part);
    }

    return Response.json({ success: true, comic: { id: comicId, title, page_count: images.length } });
  } catch (e) {
    if (comicId) {
      await env.DB.prepare('DELETE FROM comics WHERE id = ?').bind(comicId).run().catch(() => {});
      await env.DB.prepare('DELETE FROM comic_pages WHERE comic_id = ?').bind(comicId).run().catch(() => {});
    }
    return Response.json({ error: e.message || 'Failed' }, { status: 400 });
  }
}

