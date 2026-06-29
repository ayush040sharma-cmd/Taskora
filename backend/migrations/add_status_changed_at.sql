-- Add status_changed_at column to tasks table
-- Tracks when a task's status was last changed (distinct from updated_at)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- Back-fill existing tasks: use updated_at as an approximation
UPDATE tasks SET status_changed_at = updated_at WHERE status_changed_at IS NULL;
