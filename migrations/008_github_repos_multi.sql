/* Migration 008: GitHub repos (multi) */
/* Run: wrangler d1 execute novel-db --file migrations/008_github_repos_multi.sql --remote */

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
);

CREATE INDEX IF NOT EXISTS idx_github_repos_enabled ON github_repos(enabled, id);
