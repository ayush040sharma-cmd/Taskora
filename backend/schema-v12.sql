-- ============================================================
--  Taskora v12 — Migration History Tracking
--  Adds schema_migrations so future schema changes are recorded
--  and can be verified against, instead of applied by convention
--  and a README/DEPLOY.md list alone (BE-002).
--  Run this after schema-v11.sql.
-- ============================================================

-- ── 1. Migration history table ────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  id         SERIAL PRIMARY KEY,
  filename   VARCHAR(100) UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Backfill — record every migration that must already be applied ──
--       to reach this point. applied_at is NOW() for all of these (the
--       real historical timestamps were never tracked); only the
--       filename and "this ran before v12" ordering matter going
--       forward. enterprise-rbac.sql is deliberately NOT backfilled
--       here — it's an optional, manually-run migration, so whether
--       it's applied varies per environment. It should register
--       itself the same way schema-v12.sql does below, if/when it's
--       actually run against a given database.
INSERT INTO schema_migrations (filename) VALUES
  ('schema.sql'),
  ('schema-v2.sql'),
  ('schema-v3.sql'),
  ('schema-v4.sql'),
  ('schema-v5.sql'),
  ('schema-v6.sql'),
  ('schema-v7.sql'),
  ('schema-v8.sql'),
  ('schema-v9.sql'),
  ('schema-v10.sql'),
  ('schema-v11.sql'),
  ('schema-v12.sql')
ON CONFLICT (filename) DO NOTHING;
