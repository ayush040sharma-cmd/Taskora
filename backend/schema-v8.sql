-- ── Schema v8: Fix task constraints to match frontend values ─────────────────
-- Run this after schema-v7.sql on existing databases.
-- For fresh installs this is already included in schema-full.sql.

-- 1. Expand type constraint to include all values the frontend uses
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_type_check
  CHECK (type IN ('normal','task','bug','story','rfp','proposal','presentation','upgrade','poc','feature'));

-- 2. Expand status constraint to include in_progress and review
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('todo','in_progress','inprogress','review','done','blocked'));

-- 3. Add google_id column to users if it doesn't exist (for Google OAuth)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;

-- 4. Add last_login_at column if not present
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
