// GET /api/admin/github-repo/raw?path=... — 拉取 GitHub 文件原始内容（仅超管，用于同步导入）
import { checkAdmin, requireSuperAdmin, sanitizeFilename } from '../../_utils.js';
import { getRepoConfig, githubApiJson, githubRawFetch, sanitizeRepoPath, buildGitHubRawUrl } from '../../utils/githubRepoContent.js';

function encodePathSegments(path) {
  return String(path || '')
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

function contentDispositionAttachment(filename) {
  const safe = String(filename || 'file').replace(/["\\]/g, '_');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function ensureConfigReady(config) {
  if (!config?.enabled) throw new Error('GitHub 仓库内容未启用');
  if (!config.owner || !config.repo || !config.branch) throw new Error('GitHub 仓库配置不完整');
  if (!config.novelsPath || !config.comicsPath) throw new Error('GitHub 目录配置不完整');
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可使用' }, { status: 403 });

  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  if (!path) return Response.json({ error: 'Missing path' }, { status: 400 });

  try {
    const config = await getRepoConfig(env);
    ensureConfigReady(config);

    const cleanPath = sanitizeRepoPath(path, [config.novelsPath, config.comicsPath]);

    // 优先走 raw.githubusercontent.com（避免每次走 contents API）
    let upstream = null;
    try {
      const rawUrl = buildGitHubRawUrl(config, cleanPath);
      upstream = await githubRawFetch(env, rawUrl.toString());
    } catch (e) {
      // fallback：用 contents API 获取 download_url
      const apiPath = encodePathSegments(cleanPath);
      const meta = await githubApiJson(env, `/repos/${config.owner}/${config.repo}/contents/${apiPath}`, { ref: config.branch });
      if (!meta || meta.type !== 'file' || !meta.download_url) throw e;
      upstream = await githubRawFetch(env, meta.download_url);
    }

    const filename = sanitizeFilename(cleanPath.split('/').pop() || 'file', 120);
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    headers.set('Content-Disposition', contentDispositionAttachment(filename));
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, max-age=0, no-store');

    return new Response(upstream.body, { headers });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed' }, { status: 400 });
  }
}

