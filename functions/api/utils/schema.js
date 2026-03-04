import { ANNOTATION_SCHEMA_STATEMENTS } from './schema.annotation.js';

let schemaEnsured = false;

const SCHEMA_STATEMENTS = [
  // password lock
  'ALTER TABLE admin_users ADD COLUMN password_locked INTEGER DEFAULT 0',

  // books ownership + cover + source meta
  'ALTER TABLE books ADD COLUMN created_by INTEGER DEFAULT NULL',
  'ALTER TABLE books ADD COLUMN cover_key TEXT DEFAULT NULL',
  'ALTER TABLE books ADD COLUMN source_key TEXT DEFAULT NULL',
  'ALTER TABLE books ADD COLUMN source_name TEXT DEFAULT NULL',
  'ALTER TABLE books ADD COLUMN source_type TEXT DEFAULT NULL',
  'ALTER TABLE books ADD COLUMN source_size INTEGER DEFAULT NULL',
  'ALTER TABLE books ADD COLUMN source_uploaded_at TEXT DEFAULT NULL',
  'ALTER TABLE books ADD COLUMN source_chapter_count INTEGER DEFAULT NULL',
  'ALTER TABLE books ADD COLUMN source_word_count INTEGER DEFAULT NULL',

  // chapters versioning + ordering
  'ALTER TABLE chapters ADD COLUMN version INTEGER DEFAULT 0',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_book_sort ON chapters(book_id, sort_order)',

  // books status + retention (normal / unlisted / deleted / purging)
  "ALTER TABLE books ADD COLUMN status TEXT DEFAULT 'normal'",
  'ALTER TABLE books ADD COLUMN delete_at TEXT DEFAULT NULL',
  'ALTER TABLE books ADD COLUMN pinned_at TEXT DEFAULT NULL',
  // 兼容老数据：若列存在则填默认值
  "UPDATE books SET status = 'normal' WHERE status IS NULL",

  // chapters versioning + ordering
  'ALTER TABLE chapters ADD COLUMN version INTEGER DEFAULT 0',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_book_sort ON chapters(book_id, sort_order)',

  // books status + retention (normal / unlisted / deleted / purging)
  "ALTER TABLE books ADD COLUMN status TEXT DEFAULT 'normal'",
  'ALTER TABLE books ADD COLUMN delete_at TEXT DEFAULT NULL',
  // 兼容老数据：若列存在则填默认值
  "UPDATE books SET status = 'normal' WHERE status IS NULL",

  // tags
  "CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT DEFAULT '#888')",
  'CREATE TABLE IF NOT EXISTS book_tags (book_id INTEGER, tag_id INTEGER, PRIMARY KEY (book_id, tag_id))',

  // book categories (multi)
  `
    CREATE TABLE IF NOT EXISTS book_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      marks_json TEXT NOT NULL DEFAULT '[]',
      is_special INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_book_categories_special ON book_categories(is_special, name)',
  `
    CREATE TABLE IF NOT EXISTS book_category_books (
      category_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (category_id, book_id)
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_bcb_category_id ON book_category_books(category_id)',
  'CREATE INDEX IF NOT EXISTS idx_bcb_book_id ON book_category_books(book_id)',

  // GitHub OAuth
  'ALTER TABLE admin_users ADD COLUMN github_id INTEGER DEFAULT NULL',
  'ALTER TABLE admin_users ADD COLUMN github_login TEXT DEFAULT NULL',
  'ALTER TABLE admin_users ADD COLUMN avatar_url TEXT DEFAULT NULL',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_github_id ON admin_users(github_id) WHERE github_id IS NOT NULL',

  ...ANNOTATION_SCHEMA_STATEMENTS,

  // comics (CBZ)
  `
    CREATE TABLE IF NOT EXISTS comics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      cover_key TEXT DEFAULT NULL,
      source_key TEXT DEFAULT NULL,
      source_name TEXT DEFAULT NULL,
      source_type TEXT DEFAULT NULL,
      source_size INTEGER DEFAULT NULL,
      source_uploaded_at TEXT DEFAULT NULL,
      page_count INTEGER DEFAULT 0,
      created_by INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS comic_pages (
      comic_id INTEGER NOT NULL,
      page_index INTEGER NOT NULL,
      image_key TEXT NOT NULL,
      width INTEGER DEFAULT NULL,
      height INTEGER DEFAULT NULL,
      size_bytes INTEGER DEFAULT NULL,
      content_type TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (comic_id, page_index)
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_comics_updated_at ON comics(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_comics_created_by ON comics(created_by)',
  'CREATE INDEX IF NOT EXISTS idx_comic_pages_comic_page ON comic_pages(comic_id, page_index)',

  // comic stats (daily)
  `
    CREATE TABLE IF NOT EXISTS comic_stats (
      comic_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      views INTEGER DEFAULT 0,
      PRIMARY KEY (comic_id, date)
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_comic_stats_date ON comic_stats(date)',

  // reading progress (admin dashboard)
  `
    CREATE TABLE IF NOT EXISTS book_reading_progress (
      user_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      chapter_id INTEGER DEFAULT NULL,
      source_chapter_index INTEGER DEFAULT NULL,
      scroll_pct REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, book_id)
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_book_reading_progress_user_updated ON book_reading_progress(user_id, updated_at)',
  `
    CREATE TABLE IF NOT EXISTS comic_reading_progress (
      user_id INTEGER NOT NULL,
      comic_id INTEGER NOT NULL,
      page INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, comic_id)
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_comic_reading_progress_user_updated ON comic_reading_progress(user_id, updated_at)',

  // github repo scan cache (admin)
  // github repos (multi)
  `
    CREATE TABLE IF NOT EXISTS github_repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT 'main',
      novels_path TEXT NOT NULL DEFAULT 'novels/',
      comics_path TEXT NOT NULL DEFAULT 'comics/',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_github_repos_enabled ON github_repos(enabled, id)',

  `
    CREATE TABLE IF NOT EXISTS github_repo_scan_cache (
      type TEXT NOT NULL,
      config_hash TEXT NOT NULL,
      base TEXT NOT NULL,
      items_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (type, config_hash)
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_github_repo_scan_cache_type_updated ON github_repo_scan_cache(type, updated_at)',
];

async function runIgnore(env, sql) {
  try {
    await env.DB.prepare(sql).run();
  } catch {}
}

export async function ensureSchema(env) {
  if (schemaEnsured) return;
  schemaEnsured = true;
  for (const sql of SCHEMA_STATEMENTS) await runIgnore(env, sql);
}

// 公开 API / 无需登录的接口也可调用，保证新表结构存在
export async function ensureSchemaReady(env) {
  await ensureSchema(env);
}

// 兼容上游：批注相关 API 仍可能显式调用该函数
export async function ensureAnnotationSchema(env) {
  await ensureSchema(env);
}
