-- ============================================================
--  Taskora v13 — Briefing Engine Phase 1: Metrics Core
--  metric_snapshots, plus story_points (needed for sprint_confidence,
--  which doesn't exist as a column anywhere today).
--  See docs/briefing-engine-plan.md §3.
--  Run this after schema-v12.sql.
-- ============================================================

-- ── 1. Metric snapshots ───────────────────────────────────────
-- One row per (workspace[, user][, sprint], metric, day). user_id and
-- sprint_id are mutually exclusive scoping dimensions (user-level metric,
-- sprint-level metric, or workspace-level if both are NULL) — see the three
-- partial unique indexes below instead of one plain UNIQUE constraint,
-- because Postgres treats NULL as distinct in a regular UNIQUE constraint,
-- which would let duplicate sprint-level or workspace-level rows pile up
-- silently on every re-run.
CREATE TABLE IF NOT EXISTS metric_snapshots (
  id             BIGSERIAL PRIMARY KEY,
  workspace_id   INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,   -- NULL = not user-scoped
  sprint_id      INTEGER REFERENCES sprints(id) ON DELETE CASCADE, -- NULL = not sprint-scoped
  metric         VARCHAR(50) NOT NULL,   -- 'execution_score' | 'sprint_confidence' | 'focus_time_minutes' | ...
  value          NUMERIC(8,2) NOT NULL,
  inputs         JSONB,                  -- raw components, for debugging "why 82?"
  local_date     DATE NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_snapshots_user
  ON metric_snapshots (workspace_id, user_id, metric, local_date)
  WHERE user_id IS NOT NULL AND sprint_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_snapshots_sprint
  ON metric_snapshots (workspace_id, sprint_id, metric, local_date)
  WHERE sprint_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_snapshots_workspace
  ON metric_snapshots (workspace_id, metric, local_date)
  WHERE user_id IS NULL AND sprint_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_user_lookup
  ON metric_snapshots (user_id, metric, local_date DESC);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_sprint_lookup
  ON metric_snapshots (sprint_id, metric, local_date DESC);

-- ── 2. Story points ────────────────────────────────────────────
-- Needed for sprint_confidence's "remaining points" / velocity math.
-- Nullable and unenforced on purpose — most existing tasks won't have this
-- set, and the metrics code treats "no points anywhere in an open sprint"
-- as "not enough data" rather than fabricating a confidence number.
ALTER TABLE tasks   ADD COLUMN IF NOT EXISTS story_points SMALLINT;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS committed_points SMALLINT;

-- ── 3. Register this migration ──────────────────────────────────
INSERT INTO schema_migrations (filename) VALUES ('schema-v13.sql')
ON CONFLICT (filename) DO NOTHING;
