-- ============================================================
--  Taskora v15 — Briefing Engine Phase 5: Actions
--  briefing_actions only — briefing_preferences was already pulled forward
--  into schema-v14.sql (see that file's header for why).
--  See docs/briefing-engine-plan.md §7.1.
--  Run this after schema-v14.sql.
-- ============================================================

-- ── 1. Signed action tokens ───────────────────────────────────
-- Backs the "one click from the email, one confirm in the app" flow
-- (§7.1) — the email link's JWT identifies *intent* (jti → this row), not
-- authorization; the actual mutation only happens from the authenticated
-- POST .../confirm route, never from the GET a link-prefetcher might hit.
CREATE TABLE IF NOT EXISTS briefing_actions (
  id          BIGSERIAL PRIMARY KEY,
  run_id      BIGINT REFERENCES briefing_runs(id) ON DELETE CASCADE,
  jti         UUID UNIQUE NOT NULL,
  kind        VARCHAR(30) NOT NULL,   -- REASSIGN|APPROVE|REVIEW_BLOCKER|OPEN_TASK
  params      JSONB NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_briefing_actions_run ON briefing_actions(run_id);

-- ── 2. Register this migration ────────────────────────────────
INSERT INTO schema_migrations (filename) VALUES ('schema-v15.sql')
ON CONFLICT (filename) DO NOTHING;
