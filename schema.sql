/* 作品表 */
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  author TEXT DEFAULT '',
  cover_key TEXT DEFAULT NULL,
  created_by INTEGER DEFAULT NULL,
  /* 源文件（不拆解保留） */
  source_key TEXT DEFAULT NULL,
  source_name TEXT DEFAULT NULL,
  source_type TEXT DEFAULT NULL,
  source_size INTEGER DEFAULT NULL,
  source_uploaded_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

/* 章节表 */
CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  word_count INTEGER DEFAULT 0,
  content_key TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (book_id) REFERENCES books(id)
);

/* 索引（审查建议：防止全表扫描） */
CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_chapters_sort_order ON chapters(book_id, sort_order);

/* 管理员账号表 */
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'editor',
  password_locked INTEGER DEFAULT 0,
  /* GitHub OAuth */
  github_id INTEGER DEFAULT NULL,
  github_login TEXT DEFAULT NULL,
  avatar_url TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_github_id ON admin_users(github_id) WHERE github_id IS NOT NULL;

/* 会话表（登录token） */
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

/* 站点设置表（个性化配置） */
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
/* 默认设置 */
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('site_name', '我的书架');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('site_desc', '私人小说站');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('footer_text', '');

/* 标签系统 */
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#888'
);
CREATE TABLE IF NOT EXISTS book_tags (
  book_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (book_id, tag_id),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_book_tags_book_id ON book_tags(book_id);
CREATE INDEX IF NOT EXISTS idx_book_tags_tag_id ON book_tags(tag_id);

/* 认证限流表（IP锁定防暴力破解） */
CREATE TABLE IF NOT EXISTS auth_attempts (
  ip_hash TEXT PRIMARY KEY,
  fail_count INTEGER DEFAULT 0,
  locked_until TEXT,
  last_attempt TEXT DEFAULT (datetime('now'))
);

/* ========== 访问统计 ========== */

/* 站点日访问统计 */
CREATE TABLE IF NOT EXISTS site_visits (
  date TEXT PRIMARY KEY,
  pv INTEGER DEFAULT 0,
  uv INTEGER DEFAULT 0
);

/* UV去重辅助表 */
CREATE TABLE IF NOT EXISTS daily_visitors (
  date TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  PRIMARY KEY (date, ip_hash)
);

/* 书籍日阅读统计 */
CREATE TABLE IF NOT EXISTS book_stats (
  book_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  PRIMARY KEY (book_id, date),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

/* 章节累计阅读量 */
CREATE TABLE IF NOT EXISTS chapter_stats (
  chapter_id INTEGER PRIMARY KEY,
  views INTEGER DEFAULT 0,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_book_stats_book_date ON book_stats(book_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_visitors_date ON daily_visitors(date);

/* ========== 漫画 ========== */

CREATE TABLE IF NOT EXISTS comics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_key TEXT DEFAULT NULL,
  /* 源文件（cbz） */
  source_key TEXT DEFAULT NULL,
  source_name TEXT DEFAULT NULL,
  source_type TEXT DEFAULT NULL,
  source_size INTEGER DEFAULT NULL,
  source_uploaded_at TEXT DEFAULT NULL,
  page_count INTEGER DEFAULT 0,
  created_by INTEGER DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comics_updated_at ON comics(updated_at);
CREATE INDEX IF NOT EXISTS idx_comics_created_by ON comics(created_by);

CREATE TABLE IF NOT EXISTS comic_pages (
  comic_id INTEGER NOT NULL,
  page_index INTEGER NOT NULL,
  image_key TEXT NOT NULL,
  width INTEGER DEFAULT NULL,
  height INTEGER DEFAULT NULL,
  size_bytes INTEGER DEFAULT NULL,
  content_type TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (comic_id, page_index),
  FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comic_pages_comic_page ON comic_pages(comic_id, page_index);
