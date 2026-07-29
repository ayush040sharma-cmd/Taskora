-- ============================================================
--  Taskora v14 — Briefing Engine Phase 4: Delivery
--  briefing_runs, email_events, and briefing_preferences.
--
--  briefing_preferences is pulled forward from what
--  docs/briefing-engine-plan.md originally scoped as Phase 5 (§7.2) — the
--  Phase 4 scheduler design (§6.4) queries it directly to decide who/when
--  to send to, so it has to exist before the scheduler can run at all. Only
--  the preferences *UI* and the action-token tables stay in Phase 5.
--
--  Run this after schema-v13.sql.
-- ============================================================

-- ── 1. Briefing send log ──────────────────────────────────────
-- One row per (user, brief_type, day) — the UNIQUE constraint is the
-- idempotency guard that prevents double-sends on scheduler retry/restart.
-- No nullable columns in the unique key, so a plain UNIQUE constraint is
-- safe here (unlike metric_snapshots in schema-v13.sql).
CREATE TABLE IF NOT EXISTS briefing_runs (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brief_type           VARCHAR(20) NOT NULL,   -- 'morning_ic' | 'evening_ic' | 'morning_mgr' | 'evening_mgr'
  local_date           DATE NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued|generating|sent|failed|suppressed
  suppress_reason      TEXT,
  facts                JSONB,                  -- the exact facts used — audit trail for "why did it say X?"
  narration_source     VARCHAR(10),             -- 'llm' | 'fallback'
  provider_message_id  TEXT,
  attempts             INTEGER NOT NULL DEFAULT 0,
  error                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  sent_at              TIMESTAMPTZ,
  UNIQUE (user_id, brief_type, local_date)
);

CREATE INDEX IF NOT EXISTS idx_briefing_runs_status ON briefing_runs(status, created_at);

-- ── 2. Resend delivery events ─────────────────────────────────
CREATE TABLE IF NOT EXISTS email_events (
  id          BIGSERIAL PRIMARY KEY,
  run_id      BIGINT REFERENCES briefing_runs(id) ON DELETE CASCADE,
  event       VARCHAR(20) NOT NULL,   -- delivered|opened|clicked|bounced|complained
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_run ON email_events(run_id, created_at);

-- ── 3. Briefing preferences ───────────────────────────────────
-- morning_enabled defaults true to match docs/briefing-engine-plan.md §7.2's
-- literal spec — note this is NOT the same as "everyone gets emailed
-- automatically": actual rollout staging (dogfood → beta → GA) is a
-- business/ops decision made by who the scheduler is pointed at
-- (INTERNAL_DOMAINS during dogfood), not something enforced by this table.
CREATE TABLE IF NOT EXISTS briefing_preferences (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  morning_enabled    BOOLEAN NOT NULL DEFAULT true,
  evening_enabled    BOOLEAN NOT NULL DEFAULT false,
  send_hour_morning  SMALLINT NOT NULL DEFAULT 8,
  send_hour_evening  SMALLINT NOT NULL DEFAULT 18,
  weekdays           SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  channel            VARCHAR(10) NOT NULL DEFAULT 'email',  -- future: 'slack', 'push'
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Register this migration ────────────────────────────────
INSERT INTO schema_migrations (filename) VALUES ('schema-v14.sql')
ON CONFLICT (filename) DO NOTHING;
