-- ── Schema v9: Firewall & Security Event Tables ──────────────────────────────
-- Run this after schema-v8.sql on existing databases.

CREATE TABLE IF NOT EXISTS security_events (
  id          SERIAL PRIMARY KEY,
  timestamp   TIMESTAMPTZ DEFAULT NOW(),
  ip          TEXT NOT NULL,
  method      TEXT,
  url         TEXT,
  threat_type TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  details     JSONB DEFAULT '{}',
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_agent  TEXT,
  blocked     BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_sec_events_ip        ON security_events(ip);
CREATE INDEX IF NOT EXISTS idx_sec_events_ts        ON security_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_type      ON security_events(threat_type);
CREATE INDEX IF NOT EXISTS idx_sec_events_severity  ON security_events(severity);

CREATE TABLE IF NOT EXISTS blocked_ips (
  ip          TEXT PRIMARY KEY,
  blocked_at  TIMESTAMPTZ DEFAULT NOW(),
  reason      TEXT,
  blocked_by  TEXT DEFAULT 'auto',
  expires_at  TIMESTAMPTZ
);
