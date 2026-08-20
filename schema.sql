-- Football Plays — D1 schema.
-- Safe to re-run: every statement is IF NOT EXISTS.
--   npm run db:local     (local dev copy)
--   npm run db:remote    (the real database)

-- People who can sign in. There is no self-signup: an admin creates every
-- account. Passwords are PBKDF2-SHA256, never stored or logged in the clear.
CREATE TABLE IF NOT EXISTS users (
  id                   TEXT PRIMARY KEY,
  username             TEXT NOT NULL,
  name                 TEXT NOT NULL,
  email                TEXT,
  team                 TEXT NOT NULL DEFAULT 'default',
  role                 TEXT NOT NULL DEFAULT 'coach',   -- 'admin' | 'coach'
  password_hash        TEXT NOT NULL,
  active               INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at        TEXT,
  created_at           TEXT NOT NULL,
  created_by           TEXT,
  updated_at           TEXT,
  updated_by           TEXT
);
-- Usernames are compared lowercased, so the uniqueness guarantee has to be too.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (lower(username));
CREATE INDEX IF NOT EXISTS users_team ON users (team);

-- Custom plays. Scoped to a team so a head coach and his assistants open the
-- same playbook; the built-in library ships in the client and isn't stored here.
CREATE TABLE IF NOT EXISTS plays (
  id         TEXT PRIMARY KEY,
  team       TEXT NOT NULL,
  name       TEXT NOT NULL,
  side       TEXT NOT NULL,
  n          INTEGER NOT NULL,
  form       TEXT,
  note       TEXT,
  data       TEXT NOT NULL,          -- JSON: players[] and ball
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS plays_team ON plays (team, side, n);

-- The kids on the team, so a play can show real names and numbers.
CREATE TABLE IF NOT EXISTS roster (
  id         TEXT PRIMARY KEY,
  team       TEXT NOT NULL,
  num        TEXT,
  name       TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS roster_team ON roster (team, sort);

-- Feedback. Any signed-in user can submit; only an admin can triage.
CREATE TABLE IF NOT EXISTS feedback (
  id              TEXT PRIMARY KEY,
  category        TEXT NOT NULL,
  message         TEXT NOT NULL,
  page_path       TEXT,
  submitter_name  TEXT NOT NULL,
  submitter_email TEXT,
  status          TEXT NOT NULL DEFAULT 'New',
  notify_status   TEXT,
  created_at      TEXT NOT NULL,
  updated_by      TEXT,
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS feedback_created ON feedback (created_at DESC);

-- One chronological timeline per item: status changes and free-text admin
-- notes live in the same table, notes leaving the status columns NULL.
CREATE TABLE IF NOT EXISTS feedback_log (
  id          TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL,
  old_status  TEXT,
  new_status  TEXT,
  note        TEXT,
  changed_by  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_log_item ON feedback_log (feedback_id, created_at);

CREATE TABLE IF NOT EXISTS feedback_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_by TEXT,
  updated_at TEXT
);

-- Who changed what. Written best-effort — a failed audit write never blocks
-- the action it was describing.
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  area       TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  changed_by TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created ON audit_log (created_at DESC);

-- ── Game log ────────────────────────────────────────────────────────────
-- One row per game, one row per play you ran in it. Deliberately not per
-- snap: nobody is charting a peewee game live, and a log nobody fills in is
-- worse than none. This is what a coach can honestly write on the drive home.
CREATE TABLE IF NOT EXISTS games (
  id         TEXT PRIMARY KEY,
  team       TEXT NOT NULL,
  opponent   TEXT NOT NULL,
  played_on  TEXT NOT NULL,          -- YYYY-MM-DD
  result     TEXT,                   -- free text: 'W 21-6', 'scrimmage', whatever
  notes      TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS games_team ON games (team, played_on DESC);

CREATE TABLE IF NOT EXISTS play_logs (
  id         TEXT PRIMARY KEY,
  game_id    TEXT NOT NULL,
  team       TEXT NOT NULL,
  -- Either a custom play's uuid or a built-in play's id ('wedge'). The name is
  -- snapshotted alongside it so history survives a play being renamed or
  -- deleted — what you ran that day doesn't change because the playbook did.
  play_id    TEXT NOT NULL,
  play_name  TEXT NOT NULL,
  times_run  INTEGER NOT NULL DEFAULT 1,
  rating     INTEGER,                -- 1..5, null if not scored
  note       TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS play_logs_once ON play_logs (game_id, play_id);
CREATE INDEX IF NOT EXISTS play_logs_team ON play_logs (team, play_id);
