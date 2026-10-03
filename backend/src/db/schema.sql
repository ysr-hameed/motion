-- SlyxUp Motion — D1 schema.
--
-- Auth lives in SlyxUp Stack (auth worker), NOT here. This database stores
-- Motion product data only. `users` is a thin profile mirror keyed by the
-- Stack user id, upserted on first authenticated request. Plan/tier always
-- comes live from Stack entitlements (Paddle-backed), never from this table.
--
-- Provision: bound in wrangler.jsonc to D1 `slyxup-motion-db` (motion account).
-- Apply: `pnpm -C backend exec wrangler d1 execute slyxup-motion-db --remote --file=src/db/schema.sql`
-- Tables are ordered so referenced tables are created first (D1 rejects
-- forward foreign-key references within one batch).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,   -- Stack user id
  email         TEXT NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  created_at    INTEGER NOT NULL,   -- unix ms
  last_active_at INTEGER
);

CREATE TABLE IF NOT EXISTS teams (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  seat_limit INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'editor',  -- owner | editor | viewer
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS team_invites (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'editor',
  token      TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  accepted   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id     TEXT REFERENCES teams(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',  -- active | archived
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_team ON projects(team_id);

-- Composition CONTENT (code, history, versions) lives in the Chat DO SQLite.
-- This table is metadata only, synced from the DO via ctx.waitUntil.
CREATE TABLE IF NOT EXISTS compositions (
  id            TEXT PRIMARY KEY,   -- = DO session id
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT,
  duration_s    REAL,
  fps           INTEGER,
  width         INTEGER,
  height        INTEGER,
  thumbnail_url TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',  -- draft | exported | archived
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compositions_user ON compositions(user_id);
CREATE INDEX IF NOT EXISTS idx_compositions_project ON compositions(project_id);

CREATE TABLE IF NOT EXISTS exports (
  id              TEXT PRIMARY KEY,
  composition_id  TEXT NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preset          TEXT NOT NULL,
  width           INTEGER,
  height          INTEGER,
  fps             INTEGER,
  format          TEXT,
  r2_key          TEXT,
  cdn_url         TEXT,
  file_size_bytes INTEGER,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | done | failed
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_exports_composition ON exports(composition_id);
CREATE INDEX IF NOT EXISTS idx_exports_user ON exports(user_id);

CREATE TABLE IF NOT EXISTS brand_kits (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  logo_primary_url TEXT,
  logo_dark_url    TEXT,
  colors           TEXT,   -- JSON array of hex strings
  font_heading     TEXT,
  font_body        TEXT,
  guidelines_url   TEXT,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  category             TEXT NOT NULL,  -- product | social | logo | explainer | event | branding
  thumbnail_url        TEXT,
  preview_url          TEXT,
  duration_s           REAL,
  plan_required        TEXT NOT NULL DEFAULT 'free',  -- free | pro | business
  is_system            INTEGER NOT NULL DEFAULT 1,
  created_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  composition_snapshot TEXT,
  created_at           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS composition_analytics (
  id                  TEXT PRIMARY KEY,
  composition_id      TEXT REFERENCES compositions(id) ON DELETE SET NULL,
  user_id             TEXT REFERENCES users(id) ON DELETE SET NULL,
  session_id          TEXT,
  brief               TEXT,
  intent_category     TEXT,
  created_at          INTEGER NOT NULL,
  total_time_ms       INTEGER,
  model_calls         INTEGER,
  tool_calls          INTEGER,
  errors_count        INTEGER,
  retries_count       INTEGER,
  motion_score        INTEGER,
  perf_score          INTEGER,
  a11y_score          INTEGER,
  user_rating         INTEGER,  -- 1-5
  user_edited         INTEGER,
  exported            INTEGER,
  export_format       TEXT,
  template_id         TEXT,
  customization_level TEXT
);
CREATE INDEX IF NOT EXISTS idx_analytics_user ON composition_analytics(user_id);

-- API keys for Motion's own REST API (Business plan). Only the sha256 hash is
-- stored; the plaintext `sk_live_…` is shown once at creation.
CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL UNIQUE,
  name          TEXT,
  tier_snapshot TEXT NOT NULL DEFAULT 'free',  -- owner tier at creation (see require-auth)
  last_used_at  INTEGER,
  created_at    INTEGER NOT NULL,
  revoked       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Contact form submissions (public endpoint, IP rate-limited).
CREATE TABLE IF NOT EXISTS contact_messages (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  topic      TEXT NOT NULL DEFAULT 'other',
  message    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
