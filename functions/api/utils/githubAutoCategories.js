const MAX_CATEGORY_NAME_LEN = 50;
const DEFAULT_MAX_LEVELS = 20;
const DEFAULT_MAX_ENSURE = 200;
const DEFAULT_BATCH_SIZE = 100;

function toSafeText(input) {
  return String(input ?? '').trim();
}

function normalizeBaseDir(input) {
  const s = toSafeText(input);
  if (!s || s === '/' || s === '.' || s === './') return '';

  const parts = s
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.join('/');
}

function toPositiveIntOrNull(v) {
  const n = Number(String(v ?? '').trim());
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

function chunkArray(arr, size) {
  const out = [];
  const n = Array.isArray(arr) ? arr.length : 0;
  const step = Number.isFinite(size) && size > 0 ? Math.floor(size) : DEFAULT_BATCH_SIZE;
  for (let i = 0; i < n; i += step) out.push(arr.slice(i, i + step));
  return out;
}

function sumMetaChanges(batchResult) {
  if (!Array.isArray(batchResult)) return 0;
  let total = 0;
  for (const r of batchResult) {
    const c = Number(r?.meta?.changes || 0) || 0;
    total += c;
  }
  return total;
}

async function runBatchInChunks(env, statements, { batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const all = Array.isArray(statements) ? statements : [];
  const chunks = chunkArray(all, batchSize);
  const results = [];
  for (const chunk of chunks) {
    const r = await env.DB.batch(chunk);
    if (Array.isArray(r)) results.push(...r);
  }
  return results;
}

function normalizeCategoryName(name) {
  return toSafeText(name).slice(0, MAX_CATEGORY_NAME_LEN);
}

export function inferRepoKey({ owner, repo, fallback } = {}) {
  const o = toSafeText(owner);
  const r = toSafeText(repo);
  if (o && r) return `${o}/${r}`;

  const fb = toSafeText(fallback);
  return fb || 'legacy';
}

export function inferCategoryNamesFromNovelPath({ repoKey, novelsPath, cleanPath, max = DEFAULT_MAX_LEVELS } = {}) {
  const key = toSafeText(repoKey);
  if (!key) return [];

  const base = normalizeBaseDir(novelsPath);
  const path = toSafeText(cleanPath).replace(/^\/+/, '');
  if (!path) return [];

  if (base) {
    if (path === base) return [];
    if (!path.startsWith(base + '/')) return [];
  }

  const rel = base ? path.slice(base.length + 1) : path;
  const segs = rel.split('/').map((p) => p.trim()).filter(Boolean);
  if (segs.length <= 1) return [];

  const maxLevels = Number.isFinite(Number(max)) && Number(max) > 0 ? Math.floor(Number(max)) : DEFAULT_MAX_LEVELS;
  const dirs = segs.slice(0, -1).slice(0, maxLevels);

  const out = [];
  const cur = [];
  for (const part of dirs) {
    cur.push(part);
    out.push(`[${key}] ${cur.join('/')}`);
  }

  return out;
}

export async function ensureCategoriesByNameWithStats(env, { names, createdBy, max = DEFAULT_MAX_ENSURE } = {}) {
  const raw = Array.isArray(names) ? names : [];

  const seen = new Set();
  const out = [];
  for (const n of raw) {
    const s = normalizeCategoryName(n);
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= (Number.isFinite(Number(max)) && Number(max) > 0 ? Math.floor(Number(max)) : DEFAULT_MAX_ENSURE)) break;
  }

  if (out.length === 0) return { map: new Map(), createdCount: 0, ensuredNames: [] };

  const creator = toPositiveIntOrNull(createdBy);

  const insertStmts = out.map((name) =>
    env.DB.prepare(
      'INSERT OR IGNORE INTO book_categories (name, marks_json, is_special, created_by) VALUES (?, ?, ?, ?)'
    ).bind(name, '[]', 0, creator)
  );

  const insertResults = await runBatchInChunks(env, insertStmts);
  const createdCount = sumMetaChanges(insertResults);

  const map = new Map();
  for (const chunk of chunkArray(out, 100)) {
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id, name FROM book_categories WHERE name IN (${placeholders})`
    ).bind(...chunk).all();
    for (const row of results || []) {
      map.set(String(row.name), Number(row.id));
    }
  }

  return { map, createdCount, ensuredNames: out };
}

export async function ensureCategoriesByName(env, { names, createdBy, max = DEFAULT_MAX_ENSURE } = {}) {
  const { map } = await ensureCategoriesByNameWithStats(env, { names, createdBy, max });
  return map;
}

