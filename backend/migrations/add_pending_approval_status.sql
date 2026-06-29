-- Migration: expand tasks.status CHECK constraint to include all app statuses
-- Run after schema.sql / schema-full.sql

-- Drop the existing narrow constraint (only allowed todo/inprogress/done)
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;

-- Add expanded constraint covering all statuses the application writes
ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN (
    'todo',
    'in_progress',
    'inprogress',
    'review',
    'done',
    'blocked',
    'pending_approval'
  ));
