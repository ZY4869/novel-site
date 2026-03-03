/* Migration 004: 漫画阅读统计（按天） */
/* 执行方式: wrangler d1 execute novel-db --file migrations/004_comic_stats.sql --remote */

/* 漫画日阅读统计 */
CREATE TABLE IF NOT EXISTS comic_stats (
  comic_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  PRIMARY KEY (comic_id, date),
  FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comic_stats_date ON comic_stats(date);
