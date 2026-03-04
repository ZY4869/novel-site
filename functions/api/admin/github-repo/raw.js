// GET /api/admin/github-repo/raw?path=...&repo_id=... — 拉取 GitHub 文件原始内容（仅超管，用于同步导入）
import { checkAdmin, requireSuperAdmin, sanitizeFilename } from '../../_utils.js';
import { githubRawFetchByPath, sanitizeRepoPath } from '../../utils/githubRepoContent.js';
import { getGitHubRepoGlobalEnabled, resolveGitHubRepoConfig } from '../../utils/githubRepos.js';

function contentDispositionAttachment(filename) {
  const safe = String(filename || 'file').replace(/["\\]/g, '_');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function ensureConfigReady(config) {
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
    const enabled = await getGitHubRepoGlobalEnabled(env);
    if (!enabled) throw new Error('GitHub 仓库内容未启用');

    const repoIdRaw = url.searchParams.get('repo_id');
    if (repoIdRaw !== null && !/^\d+$/.test(repoIdRaw)) {
      return Response.json({ error: 'Invalid repo_id' }, { status: 400 });
    }
    const repoId = repoIdRaw ? Number(repoIdRaw) : null;

    const config = await resolveGitHubRepoConfig(env, { repoId });
    if (!config) throw new Error('未找到可用的 GitHub 仓库配置');
    ensureConfigReady(config);

    const cleanPath = sanitizeRepoPath(path, [config.novelsPath, config.comicsPath]);
    const upstream = await githubRawFetchByPath(env, config, cleanPath);

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
