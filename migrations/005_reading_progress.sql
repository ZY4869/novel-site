/* Migration 005: Reading/Viewing progress (per admin user) */
/* Run: wrangler d1 execute novel-db --file migrations/005_reading_progress.sql --remote */

CREATE TABLE IF NOT EXISTS book_reading_progress (
  user_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  chapter_id INTEGER DEFAULT NULL,
  source_chapter_index INTEGER DEFAULT NULL,
  scroll_pct REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, book_id),
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_book_reading_progress_user_updated ON book_reading_progress(user_id, updated_at);

CREATE TABLE IF NOT EXISTS comic_reading_progress (
  user_id INTEGER NOT NULL,
  comic_id INTEGER NOT NULL,
  page INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, comic_id),
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comic_reading_progress_user_updated ON comic_reading_progress(user_id, updated_at);

