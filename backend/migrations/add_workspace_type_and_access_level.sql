-- Individual vs Team workspaces, and a per-member view/edit/full access tier.
-- workspace_type drives which collaboration views (Members, Team Workload,
-- Collaboration, Manager View) show in the sidebar for that workspace.
-- access_level is separate from workspace_members.role (which mirrors the
-- platform-wide team_member/manager/super_boss roles) -- it's a simpler
-- viewer/editor/full tier scoped to what a member can do with tasks in this
-- one workspace. The workspace owner (workspaces.user_id) always has
-- implicit 'full' access and has no workspace_members row of their own.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS workspace_type TEXT NOT NULL DEFAULT 'team'
  CHECK (workspace_type IN ('individual', 'team'));

ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS access_level TEXT NOT NULL DEFAULT 'editor'
  CHECK (access_level IN ('viewer', 'editor', 'full'));
