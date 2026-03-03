/* Migration 006: GitHub repo scan cache (persisted) */
/* Run: wrangler d1 execute novel-db --file migrations/006_github_repo_scan_cache.sql --remote */

CREATE TABLE IF NOT EXISTS github_repo_scan_cache (
  type TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  base TEXT NOT NULL,
  items_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (type, config_hash)
);

CREATE INDEX IF NOT EXISTS idx_github_repo_scan_cache_type_updated ON github_repo_scan_cache(type, updated_at);

