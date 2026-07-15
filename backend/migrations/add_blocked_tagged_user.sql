-- Lets a blocked task be tagged with the person responsible for unblocking it,
-- separate from blocked_by_task_id (which links to another *task*, not a person).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_tagged_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
