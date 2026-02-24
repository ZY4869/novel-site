-- Migration 003: 源文件保留 + 漫画（CBZ）支持
-- 执行: wrangler d1 execute novel-db --file migrations/003_sources_and_comics.sql --remote

-- ========== 书籍源文件元信息（不拆解保留） ==========
-- SQLite 不支持 IF NOT EXISTS for ALTER TABLE；如已存在会报错，忽略即可
ALTER TABLE books ADD COLUMN source_key TEXT DEFAULT NULL;
ALTER TABLE books ADD COLUMN source_name TEXT DEFAULT NULL;
ALTER TABLE books ADD COLUMN source_type TEXT DEFAULT NULL;
ALTER TABLE books ADD COLUMN source_size INTEGER DEFAULT NULL;
ALTER TABLE books ADD COLUMN source_uploaded_at TEXT DEFAULT NULL;

-- ========== 漫画 ==========
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
