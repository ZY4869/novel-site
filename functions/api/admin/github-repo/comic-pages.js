// GET /api/admin/github-repo/comic-pages?dir=... — 列出 GitHub 图片目录下的页（仅超管）
import { checkAdmin, requireSuperAdmin } from '../../_utils.js';
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

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可使用' }, { status: 403 });

  const url = new URL(request.url);
  const dir = url.searchParams.get('dir') || '';
  if (!dir) return Response.json({ error: 'Missing dir' }, { status: 400 });

  try {
    const config = await getRepoConfig(env);
    ensureConfigReady(config);

    const cleanDir = sanitizeRepoPath(dir, [config.comicsPath]);
    const apiPath = encodePathSegments(cleanDir);

    const urlPath = apiPath
      ? `/repos/${config.owner}/${config.repo}/contents/${apiPath}`
      : `/repos/${config.owner}/${config.repo}/contents`;
    const data = await githubApiJson(env, urlPath, { ref: config.branch });
    if (!Array.isArray(data)) return Response.json({ error: 'GitHub 返回不是目录列表' }, { status: 400 });

    const pages = data
      .filter((x) => x && x.type === 'file' && isSupportedImage(x.name))
      .map((x) => ({
        name: x.name,
        path: x.path,
        size: x.size || 0,
        contentType: guessImageMime(x.name),
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' }));

    return Response.json({ success: true, dir: cleanDir, pages });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed' }, { status: 400 });
  }
}
