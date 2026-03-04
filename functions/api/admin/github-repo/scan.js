// GET /api/admin/github-repo/scan?type=novels|comics&repo_id=&dir= — 扫描 GitHub 仓库目录内容（仅超管）
import { checkAdmin, requireSuperAdmin, sha256Hash } from '../../_utils.js';
import { githubApiJson, sanitizeRepoPath } from '../../utils/githubRepoContent.js';
import { getGitHubRepoGlobalEnabled, resolveGitHubRepoConfig } from '../../utils/githubRepos.js';

function encodePathSegments(path) {
  return String(path || '')
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

function ensureConfigReady(config) {
  if (!config.owner || !config.repo || !config.branch) throw new Error('GitHub 仓库配置不完整');
  if (!config.novelsPath || !config.comicsPath) throw new Error('GitHub 目录配置不完整');
}

function isNovelFile(name) {
  const n = String(name || '').toLowerCase();
  return n.endsWith('.txt') || n.endsWith('.text') || n.endsWith('.epub');
}

function isCbzFile(name) {
  const n = String(name || '').toLowerCase();
  return n.endsWith('.cbz') || n.endsWith('.zip');
}

async function fetchGitHubTreeRecursive(env, { owner, repo, branch }) {
  const safeOwner = String(owner || '').trim();
  const safeRepo = String(repo || '').trim();
  const safeBranch = String(branch || '').trim();
  if (!safeOwner || !safeRepo || !safeBranch) throw new Error('GitHub 仓库配置不完整');

  const refSeg = encodeURIComponent(safeBranch);
  try {
    return await githubApiJson(env, `/repos/${safeOwner}/${safeRepo}/git/trees/${refSeg}?recursive=1`);
  } catch (e) {
    // fallback: resolve commit -> tree sha
    try {
      const commit = await githubApiJson(env, `/repos/${safeOwner}/${safeRepo}/commits/${refSeg}`);
      const treeSha = String(commit?.commit?.tree?.sha || '').trim();
      if (!treeSha) throw e;
      return await githubApiJson(env, `/repos/${safeOwner}/${safeRepo}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`);
    } catch {
      throw e;
    }
  }
}

function lastPathSeg(p) {
  const s = String(p || '');
  const idx = s.lastIndexOf('/');
  return idx >= 0 ? s.slice(idx + 1) : s;
}

async function saveScanCache(env, { type, configHash, base, items }) {
  try {
    const itemsJson = JSON.stringify(Array.isArray(items) ? items : []);
    await env.DB.prepare(
      `
        INSERT INTO github_repo_scan_cache (type, config_hash, base, items_json, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(type, config_hash) DO UPDATE SET
          base = excluded.base,
          items_json = excluded.items_json,
          updated_at = datetime('now')
      `
    )
      .bind(type, configHash, base, itemsJson)
      .run();
  } catch {}
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可使用' }, { status: 403 });

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  if (type !== 'novels' && type !== 'comics') {
    return Response.json({ error: 'Invalid type' }, { status: 400 });
  }

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

    const base = type === 'novels' ? config.novelsPath : config.comicsPath;

    const dirParam = type === 'novels' ? url.searchParams.get('dir') : null;
    if (type !== 'novels' && url.searchParams.has('dir')) {
      return Response.json({ error: 'dir only supported for novels' }, { status: 400 });
    }

    const baseOrDirInput = dirParam === null ? base : (dirParam || base);
    const cleanBase = sanitizeRepoPath(baseOrDirInput, [base]);

    const repoKey = config.id ? `id${config.id}` : 'legacy';
    const variant = type === 'novels' ? (dirParam === null ? 'flat' : 'dir') : 'base';
    const configHash = await sha256Hash(`${repoKey}:${config.owner}/${config.repo}@${config.branch}:${variant}:${cleanBase}`);

    // novels flat scan: recursive tree, so "全部仓库" 模式也能识别多级目录预分类
    if (type === 'novels' && dirParam === null) {
      const tree = await fetchGitHubTreeRecursive(env, config);
      if (tree?.truncated) throw new Error('仓库树过大，建议切换到单仓库目录模式逐级扫描');
      if (!Array.isArray(tree?.tree)) {
        return Response.json({ error: 'GitHub 返回不是目录树' }, { status: 400 });
      }

      const prefix = cleanBase ? String(cleanBase).replace(/\/+$/, '') + '/' : '';
      const items = tree.tree
        .filter((x) => {
          if (!x || x.type !== 'blob') return false;
          const p = String(x.path || '').trim();
          if (!p) return false;
          if (prefix && !p.startsWith(prefix)) return false;
          return isNovelFile(p);
        })
        .map((x) => ({
          kind: 'file',
          repo_id: config.id ?? null,
          name: lastPathSeg(x.path),
          path: x.path,
          size: Number(x.size || 0) || 0,
          sha: x.sha || '',
        }))
        .sort((a, b) =>
          String(a.path).localeCompare(String(b.path), undefined, { numeric: true, sensitivity: 'base' })
        );

      context.waitUntil(saveScanCache(env, { type, configHash, base: cleanBase, items }));
      return Response.json({ success: true, type, repo_id: config.id ?? null, base: cleanBase, items });
    }
    const apiPath = encodePathSegments(cleanBase);

    const urlPath = apiPath
      ? `/repos/${config.owner}/${config.repo}/contents/${apiPath}`
      : `/repos/${config.owner}/${config.repo}/contents`;
    const data = await githubApiJson(env, urlPath, { ref: config.branch });
    if (!Array.isArray(data)) return Response.json({ error: 'GitHub 返回不是目录列表' }, { status: 400 });

    if (type === 'novels') {
      const includeDirs = dirParam !== null;
      const items = data
        .filter((x) => x && (includeDirs ? (x.type === 'dir' || (x.type === 'file' && isNovelFile(x.name))) : (x.type === 'file' && isNovelFile(x.name))))
        .map((x) => ({
          kind: x.type === 'dir' ? 'dir' : 'file',
          repo_id: config.id ?? null,
          name: x.name,
          path: x.path,
          size: x.size || 0,
          sha: x.sha || '',
        }))
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
          return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' });
        });
      context.waitUntil(saveScanCache(env, { type, configHash, base: cleanBase, items }));
      return Response.json({ success: true, type, repo_id: config.id ?? null, base: cleanBase, items });
    }

    const items = data
      .filter((x) => x && (x.type === 'dir' || (x.type === 'file' && isCbzFile(x.name))))
      .map((x) => ({
        kind: x.type === 'dir' ? 'dir' : 'cbz',
        repo_id: config.id ?? null,
        name: x.name,
        path: x.path,
        size: x.size || 0,
        sha: x.sha || '',
      }))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' });
      });
    context.waitUntil(saveScanCache(env, { type, configHash, base: cleanBase, items }));
    return Response.json({ success: true, type, repo_id: config.id ?? null, base: cleanBase, items });
  } catch (e) {
    return Response.json({ error: e.message || 'Scan failed' }, { status: 400 });
  }
}
