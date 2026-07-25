-- Live Minutes — D1 schema
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  source_lang  TEXT NOT NULL,
  target_lang  TEXT NOT NULL,
  speakers     INTEGER NOT NULL DEFAULT 0,
  has_minutes  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS utterances (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  speaker     INTEGER,
  source      TEXT NOT NULL,
  translation TEXT,
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_utterances_session ON utterances(session_id, ts);

CREATE TABLE IF NOT EXISTS minutes (
  session_id TEXT PRIMARY KEY,
  doc        TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Cloud backup of a device's meetings (option B: capability-key, no accounts).
CREATE TABLE IF NOT EXISTS backups (
  backup_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  payload    TEXT NOT NULL,
  PRIMARY KEY (backup_key, session_id)
);
CREATE INDEX IF NOT EXISTS idx_backups_key ON backups(backup_key);
