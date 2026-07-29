-- Follow-up to fix_workspace_delete_cascade.sql — a comprehensive check of
-- every FK referencing workspaces(id) surfaced one more table that still
-- blocked workspace deletion: permission_audit_log (from
-- migrations/enterprise-rbac.sql), which had no ON DELETE rule.
--
-- Same reasoning as audit_logs: this is a historical record (permission/role
-- change history) that should survive independently of the workspace it
-- referenced, so SET NULL rather than CASCADE.

ALTER TABLE permission_audit_log DROP CONSTRAINT IF EXISTS permission_audit_log_workspace_id_fkey;
ALTER TABLE permission_audit_log ADD CONSTRAINT permission_audit_log_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
