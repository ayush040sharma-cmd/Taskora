-- Fix: approvals.workspace_id and audit_logs.workspace_id had no ON DELETE
-- rule (default NO ACTION), so deleting a workspace failed with a foreign
-- key violation whenever either table still had rows referencing it --
-- audit_logs especially, since nearly every action in the app writes one.
--
-- approvals: transient operational data -> cascade with the workspace,
-- matching every other workspace-scoped table (tasks, sprints, members, ...).
-- audit_logs: a historical record -> SET NULL instead of cascading, so the
-- audit trail survives independently of the workspace it referenced (the
-- same SET NULL pattern already used for one other table in schema-v7.sql).

ALTER TABLE approvals DROP CONSTRAINT IF EXISTS approvals_workspace_id_fkey;
ALTER TABLE approvals ADD CONSTRAINT approvals_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_workspace_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
