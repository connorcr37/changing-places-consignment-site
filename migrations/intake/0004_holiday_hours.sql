-- The existing D1 database also stores staff sessions and holiday announcements.
CREATE TABLE holiday_entries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  animation TEXT NOT NULL DEFAULT 'automatic',
  banner_enabled INTEGER NOT NULL CHECK(banner_enabled IN (0,1)),
  starts_at TEXT,
  ends_at TEXT,
  dates_json TEXT NOT NULL,
  google_hours INTEGER NOT NULL CHECK(google_hours IN (0,1)),
  google_post INTEGER NOT NULL CHECK(google_post IN (0,1)),
  state TEXT NOT NULL CHECK(state IN ('draft','published','removed')),
  version INTEGER NOT NULL DEFAULT 1,
  write_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);
-- One published override per date. Conflicting publishes roll back atomically.
CREATE TABLE holiday_calendar (
  date TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES holiday_entries(id),
  closed INTEGER NOT NULL CHECK(closed IN (0,1)),
  opens TEXT,
  closes TEXT,
  CHECK((closed=1 AND opens IS NULL AND closes IS NULL) OR
        (closed=0 AND opens IS NOT NULL AND closes IS NOT NULL AND opens<closes))
);
CREATE INDEX holiday_calendar_entry ON holiday_calendar(entry_id);
CREATE TABLE holiday_sync_jobs (
  entry_id TEXT NOT NULL REFERENCES holiday_entries(id),
  kind TEXT NOT NULL CHECK(kind IN ('hours','post')),
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(entry_id,kind)
);
CREATE INDEX holiday_jobs_due ON holiday_sync_jobs(status,next_at);
CREATE TABLE holiday_google_connection (
  id INTEGER PRIMARY KEY CHECK(id=1),
  refresh_token TEXT,
  account_name TEXT,
  location_name TEXT,
  location_title TEXT,
  location_address TEXT,
  can_post INTEGER,
  connected_by TEXT,
  connected_at INTEGER,
  lock_token TEXT,
  lock_until INTEGER NOT NULL DEFAULT 0
);
INSERT INTO holiday_google_connection(id) VALUES(1);
-- Original exceptions are retained so disabling sync can restore them.
CREATE TABLE holiday_google_dates (
  date TEXT PRIMARY KEY,
  original_json TEXT NOT NULL
);
CREATE TABLE holiday_google_posts (
  entry_id TEXT PRIMARY KEY REFERENCES holiday_entries(id),
  post_name TEXT,
  attempted INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT
);
CREATE TABLE holiday_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE holiday_oauth_states (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('login','connect')),
  session_hash TEXT,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE holiday_auth_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE holiday_staff (
  email TEXT PRIMARY KEY,
  invited_by TEXT NOT NULL,
  invited_at INTEGER NOT NULL,
  accepted_at INTEGER,
  revoked_at INTEGER,
  email_status TEXT NOT NULL DEFAULT 'pending',
  email_error TEXT NOT NULL DEFAULT ''
);
