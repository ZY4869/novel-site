/* Migration 007: Book categories (multi) + pinned books */
/* Run: wrangler d1 execute novel-db --file migrations/007_book_categories_and_pins.sql --remote */

/* SQLite 不支持 IF NOT EXISTS for ALTER TABLE；如已存在会报错，忽略即可 */
ALTER TABLE books ADD COLUMN pinned_at TEXT DEFAULT NULL;

/* ========== 分类系统 ========== */
CREATE TABLE IF NOT EXISTS book_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  marks_json TEXT NOT NULL DEFAULT '[]',
  is_special INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_book_categories_special ON book_categories(is_special, name);

CREATE TABLE IF NOT EXISTS book_category_books (
  category_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (category_id, book_id),
  FOREIGN KEY (category_id) REFERENCES book_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bcb_category_id ON book_category_books(category_id);
CREATE INDEX IF NOT EXISTS idx_bcb_book_id ON book_category_books(book_id);

