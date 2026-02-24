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

  // tags
  "CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT DEFAULT '#888')",
  'CREATE TABLE IF NOT EXISTS book_tags (book_id INTEGER, tag_id INTEGER, PRIMARY KEY (book_id, tag_id))',

  // GitHub OAuth
  'ALTER TABLE admin_users ADD COLUMN github_id INTEGER DEFAULT NULL',
  'ALTER TABLE admin_users ADD COLUMN github_login TEXT DEFAULT NULL',
  'ALTER TABLE admin_users ADD COLUMN avatar_url TEXT DEFAULT NULL',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_github_id ON admin_users(github_id) WHERE github_id IS NOT NULL',

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

