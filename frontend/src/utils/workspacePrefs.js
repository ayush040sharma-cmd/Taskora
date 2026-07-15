/**
 * Reads the workspace-scoped task-default preferences configured in
 * Settings → Workspace Preferences (see SettingsPage.jsx's
 * WorkspacePreferencesSection, which owns the write side and this exact
 * key format: taskora-{name}-{workspaceId}).
 */
const DEFAULTS = {
  "task-prefix":       "TASK",
  "sprint-days":       "14",
  "default-priority":  "medium",
  "auto-archive-days": "30",
  "show-completed":    "true",
};

export function getWorkspacePref(workspaceId, name) {
  const stored = workspaceId != null ? localStorage.getItem(`taskora-${name}-${workspaceId}`) : null;
  return stored ?? DEFAULTS[name];
}
