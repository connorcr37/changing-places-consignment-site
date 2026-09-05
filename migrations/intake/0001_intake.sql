CREATE TABLE IF NOT EXISTS intake_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  photo_count INTEGER NOT NULL CHECK(photo_count BETWEEN 1 AND 30),
  state TEXT NOT NULL DEFAULT 'uploading',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  submitted_at INTEGER,
  analysis_json TEXT,
  analysis_attempts INTEGER NOT NULL DEFAULT 0,
  processing_until INTEGER NOT NULL DEFAULT 0,
  notification_sent INTEGER NOT NULL DEFAULT 0,
  notification_attempts INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'new',
  staff_notes TEXT NOT NULL DEFAULT '',
  response_draft TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS intake_pending ON intake_submissions(state, updated_at);
CREATE TABLE IF NOT EXISTS intake_photos (
  upload_id TEXT NOT NULL REFERENCES intake_submissions(upload_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 30),
  object_key TEXT NOT NULL,
  digest TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(upload_id, ordinal)
);
CREATE TABLE IF NOT EXISTS intake_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
