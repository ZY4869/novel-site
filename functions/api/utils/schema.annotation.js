export const ANNOTATION_SCHEMA_STATEMENTS = [
  // annotation flags
  'ALTER TABLE books ADD COLUMN annotation_enabled INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE books ADD COLUMN annotation_locked INTEGER NOT NULL DEFAULT 0',

  // annotations
  `
    CREATE TABLE IF NOT EXISTS annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      para_idx INTEGER NOT NULL,
      sent_idx INTEGER NOT NULL,
      sent_hash TEXT NOT NULL,
      sent_text TEXT NOT NULL,
      content TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      status TEXT NOT NULL DEFAULT 'normal',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES admin_users(id)
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_anno_chapter ON annotations(chapter_id, para_idx, sent_idx)',
  'CREATE INDEX IF NOT EXISTS idx_anno_book ON annotations(book_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_anno_user ON annotations(user_id, created_at)',
  `
    CREATE TABLE IF NOT EXISTS annotation_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annotation_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(annotation_id, user_id),
      FOREIGN KEY (annotation_id) REFERENCES annotations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES admin_users(id)
    )
  `,

  // reports / votes / governance
  `
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annotation_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      reporter_id INTEGER,
      reporter_guest_hash TEXT,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      handler_id INTEGER,
      handler_action TEXT,
      threshold_reached_at TEXT,
      escalated_at TEXT,
      handled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (annotation_id) REFERENCES annotations(id) ON DELETE CASCADE,
      FOREIGN KEY (reporter_id) REFERENCES admin_users(id)
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_reports_annotation ON reports(annotation_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_reports_book ON reports(book_id, status)',

  `
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annotation_id INTEGER NOT NULL,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(annotation_id, admin_id),
      FOREIGN KEY (annotation_id) REFERENCES annotations(id) ON DELETE CASCADE,
      FOREIGN KEY (admin_id) REFERENCES admin_users(id)
    )
  `,

  `
    CREATE TABLE IF NOT EXISTS score_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      delta REAL NOT NULL,
      reason TEXT NOT NULL,
      related_annotation_id INTEGER,
      related_report_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES admin_users(id)
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_score_user ON score_logs(user_id, created_at)',

  `
    CREATE TABLE IF NOT EXISTS mutes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      reason TEXT NOT NULL,
      related_annotation_id INTEGER,
      duration_minutes INTEGER,
      starts_at TEXT NOT NULL DEFAULT (datetime('now')),
      ends_at TEXT,
      lifted_by INTEGER,
      lifted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES admin_users(id)
    )
  `,

  // admin_users governance fields
  'ALTER TABLE admin_users ADD COLUMN score REAL NOT NULL DEFAULT 0',
  'ALTER TABLE admin_users ADD COLUMN violation_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE admin_users ADD COLUMN last_violation_at TEXT',
  'ALTER TABLE admin_users ADD COLUMN consecutive_neglect_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE admin_users ADD COLUMN lock_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE admin_users ADD COLUMN locked_until TEXT',
  'ALTER TABLE admin_users ADD COLUMN banned_at TEXT',
  'ALTER TABLE admin_users ADD COLUMN appeal_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE admin_users ADD COLUMN muted_until TEXT',

  // extra indexes
  'CREATE INDEX IF NOT EXISTS idx_sessions_user ON admin_sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_mutes_user ON mutes(user_id, ends_at)',
  'CREATE INDEX IF NOT EXISTS idx_likes_user ON annotation_likes(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_votes_annotation ON votes(annotation_id, admin_id)',
];

