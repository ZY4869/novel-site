// POST /api/admin/github-repo/backfill-categories — 回填历史 gh:* 直连书籍的目录分类（仅超管，merge-only）
import { checkAdmin, ensureSchemaReady, parseJsonBody, requireSuperAdmin } from '../../_utils.js';
import { sanitizeRepoPath } from '../../utils/githubRepoContent.js';
import { parseGhKey } from '../../utils/ghKey.js';
import { getGitHubRepoConfigById, getGitHubRepoGlobalEnabled, resolveGitHubRepoConfig } from '../../utils/githubRepos.js';
import { ensureCategoriesByNameWithStats, inferCategoryNamesFromNovelPath, inferRepoKey } from '../../utils/githubAutoCategories.js';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const MAX_CATEGORY_IDS = 20;
const MAX_CATEGORY_NAME_LEN = 50;
const BATCH_SIZE = 100;

function toInt(v, fallback) {
  const n = Number(String(v ?? '').trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function clampInt(v, { min, max, fallback }) {
  const n = toInt(v, fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

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

async function batchRun(env, statements) {
  if (!Array.isArray(statements) || statements.length === 0) return { changes: 0 };
  let changes = 0;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const chunk = statements.slice(i, i + BATCH_SIZE);
    const res = await env.DB.batch(chunk);
    if (Array.isArray(res)) {
      for (const r of res) changes += Number(r?.meta?.changes || 0) || 0;
    }
  }
  return { changes };
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

  const enabled = await getGitHubRepoGlobalEnabled(env);
  if (!enabled) return Response.json({ error: 'GitHub 仓库内容未启用' }, { status: 400 });

  const repoIdFilterProvided =
    Object.prototype.hasOwnProperty.call(body, 'repo_id') || Object.prototype.hasOwnProperty.call(body, 'repoId');
  const repoIdFilterRaw = body.repo_id ?? body.repoId;

  const filter =
    !repoIdFilterProvided
      ? { kind: 'all' }
      : repoIdFilterRaw === null
        ? { kind: 'legacy' }
        : /^\d+$/.test(String(repoIdFilterRaw))
          ? { kind: 'repo', repoId: Number(repoIdFilterRaw) }
          : { kind: 'all' };

  const afterId = Math.max(0, clampInt(body.after_id ?? body.afterId, { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 }));
  const limit = clampInt(body.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  const dryRun = body.dry_run === true || body.dryRun === true;

  const { results: rows } = await env.DB.prepare(
    "SELECT id, source_key FROM books WHERE id > ? AND source_key LIKE 'gh:%' ORDER BY id ASC LIMIT ?"
  ).bind(afterId, limit).all();

  const stats = {
    scanned: (rows || []).length,
    matched: 0,
    created_categories: 0,
    attached_links: 0,
    skipped_no_category: 0,
    skipped_outside_base: 0,
    errors: 0,
  };

  let nextAfterId = afterId;

  const bookToNames = new Map();
  const allNames = [];
  const allSeen = new Set();

  for (const row of rows || []) {
    const bookId = Number(row?.id || 0) || 0;
    if (bookId > nextAfterId) nextAfterId = bookId;

    const parsed = parseGhKey(String(row?.source_key || ''));
    if (!parsed?.path) continue;

    if (filter.kind === 'legacy' && parsed.repoId !== null) continue;
    if (filter.kind === 'repo' && Number(parsed.repoId) !== Number(filter.repoId)) continue;

    let config = null;
    try {
      if (parsed.repoId !== null) {
        config = await getGitHubRepoConfigById(env, parsed.repoId, { allowDisabled: true });
      } else {
        config = await resolveGitHubRepoConfig(env, { repoId: null });
      }
      if (!config) throw new Error('未找到可用的 GitHub 仓库配置');
      ensureConfigReady(config);
    } catch (e) {
      stats.errors++;
      continue;
    }

    let cleanPath = '';
    try {
      cleanPath = sanitizeRepoPath(parsed.path, [config.novelsPath]);
    } catch {
      stats.skipped_outside_base++;
      continue;
    }

    const repoKeyText = inferRepoKey({
      owner: config.owner,
      repo: config.repo,
      fallback: config.id ? `repo#${config.id}` : 'legacy',
    });
    let names = inferCategoryNamesFromNovelPath({
      repoKey: repoKeyText,
      novelsPath: config.novelsPath,
      cleanPath,
      max: MAX_CATEGORY_IDS,
    });
    names = uniqKeepOrder(names.map(normalizeCategoryName));

    if (names.length === 0) {
      stats.skipped_no_category++;
      continue;
    }

    stats.matched++;
    bookToNames.set(bookId, names);

    for (const n of names) {
      if (allSeen.has(n)) continue;
      allSeen.add(n);
      allNames.push(n);
    }
  }

  let categoryMap = new Map();
  if (allNames.length > 0) {
    try {
      const { map, createdCount } = await ensureCategoriesByNameWithStats(env, {
        names: allNames,
        createdBy: auth.userId,
        max: 200,
      });
      categoryMap = map;
      stats.created_categories = createdCount;
    } catch (e) {
      console.error('backfill-categories ensure error:', e);
      stats.errors++;
    }
  }

  if (!dryRun && bookToNames.size > 0 && categoryMap.size > 0) {
    const stmts = [];
    for (const [bookId, names] of Array.from(bookToNames.entries())) {
      const ids = names
        .map((n) => categoryMap.get(n))
        .filter((x) => Number.isFinite(x) && x > 0)
        .slice(0, MAX_CATEGORY_IDS);

      for (const cid of ids) {
        stmts.push(
          env.DB.prepare('INSERT OR IGNORE INTO book_category_books (category_id, book_id) VALUES (?, ?)').bind(cid, bookId)
        );
      }
    }
    try {
      const { changes } = await batchRun(env, stmts);
      stats.attached_links = changes;
    } catch (e) {
      console.error('backfill-categories attach error:', e);
      stats.errors++;
    }
  }

  const hasMore = (rows || []).length === limit && nextAfterId > afterId;

  const resp = {
    success: true,
    dry_run: dryRun,
    after_id: afterId,
    next_after_id: nextAfterId,
    has_more: hasMore,
    stats,
  };
  if (repoIdFilterProvided) {
    resp.repo_id = filter.kind === 'repo' ? filter.repoId : null;
  }

  return Response.json(resp);
}

