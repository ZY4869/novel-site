// POST /api/admin/github-repo/resolve-categories — 解析 GitHub 小说路径对应的分类（仅超管）
import { checkAdmin, ensureSchemaReady, requireSuperAdmin, parseJsonBody } from '../../_utils.js';
import { sanitizeRepoPath } from '../../utils/githubRepoContent.js';
import { getGitHubRepoGlobalEnabled, resolveGitHubRepoConfig } from '../../utils/githubRepos.js';
import { ensureCategoriesByNameWithStats, inferCategoryNamesFromNovelPath, inferRepoKey } from '../../utils/githubAutoCategories.js';

const MAX_ITEMS = 500;
const MAX_CATEGORY_NAME_LEN = 50;
const MAX_CATEGORY_IDS = 20;

function normalizeCategoryName(name) {
  return String(name || '').trim().slice(0, MAX_CATEGORY_NAME_LEN);
}

function uniqKeepOrder(arr) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const s = String(it || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function ensureConfigReady(config) {
  if (!config?.owner || !config?.repo || !config?.branch) throw new Error('GitHub 仓库配置不完整');
  if (!config?.novelsPath) throw new Error('GitHub 小说目录配置不完整');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  await ensureSchemaReady(env);

  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireSuperAdmin(auth)) return Response.json({ error: '仅超级管理员可使用' }, { status: 403 });

  const body = await parseJsonBody(request);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });

  const type = String(body.type || '').trim();
  if (type !== 'novels') return Response.json({ error: 'Invalid type' }, { status: 400 });

  const autoCategory = !(body.auto_category === false || body.autoCategory === false);

  const itemsRaw = Array.isArray(body.items) ? body.items : [];
  const items = itemsRaw.slice(0, MAX_ITEMS);
  if (items.length === 0) return Response.json({ success: true, results: [] });

  const enabled = await getGitHubRepoGlobalEnabled(env);
  if (!enabled) return Response.json({ error: 'GitHub 仓库内容未启用' }, { status: 400 });

  const results = [];
  const indexedNames = [];

  const allNames = [];
  const allSeen = new Set();

  for (const it of items) {
    const repoIdRaw = it?.repo_id ?? it?.repoId ?? null;
    const repoId = /^\d+$/.test(String(repoIdRaw)) ? Number(repoIdRaw) : null;
    const inputPath = String(it?.path || '').trim();

    if (!inputPath) {
      results.push({ repo_id: repoId ?? null, path: inputPath, category_names: [], category_ids: [], error: 'Missing path' });
      continue;
    }

    try {
      const config = await resolveGitHubRepoConfig(env, { repoId });
      if (!config) throw new Error('未找到可用的 GitHub 仓库配置');
      ensureConfigReady(config);

      const cleanPath = sanitizeRepoPath(inputPath, [config.novelsPath]);

      let categoryNames = [];
      if (autoCategory) {
        const repoKeyText = inferRepoKey({
          owner: config.owner,
          repo: config.repo,
          fallback: config.id ? `repo#${config.id}` : 'legacy',
        });
        categoryNames = inferCategoryNamesFromNovelPath({
          repoKey: repoKeyText,
          novelsPath: config.novelsPath,
          cleanPath,
          max: MAX_CATEGORY_IDS,
        });
      }

      categoryNames = uniqKeepOrder(categoryNames.map(normalizeCategoryName));

      const idx = results.length;
      results.push({
        repo_id: config.id ?? null,
        path: cleanPath,
        category_names: categoryNames,
        category_ids: [],
        error: null,
      });

      indexedNames.push({ idx, names: categoryNames });
      for (const n of categoryNames) {
        if (allSeen.has(n)) continue;
        allSeen.add(n);
        allNames.push(n);
      }
    } catch (e) {
      results.push({
        repo_id: repoId ?? null,
        path: inputPath,
        category_names: [],
        category_ids: [],
        error: e?.message || 'Failed',
      });
    }
  }

  if (autoCategory && allNames.length > 0) {
    try {
      const { map } = await ensureCategoriesByNameWithStats(env, {
        names: allNames,
        createdBy: auth.userId,
        max: 200,
      });

      for (const it of indexedNames) {
        const ids = it.names
          .map((n) => map.get(n))
          .filter((x) => Number.isFinite(x) && x > 0)
          .slice(0, MAX_CATEGORY_IDS);
        results[it.idx].category_ids = ids;
      }
    } catch (e) {
      console.error('resolve-categories ensure error:', e);
    }
  }

  return Response.json({ success: true, results });
}
