const pool = require("../db");

const RANK = { viewer: 1, editor: 2, full: 3 };

// The workspace owner (workspaces.user_id) has no workspace_members row and
// always has implicit 'full' access. Everyone else's tier comes from
// workspace_members.access_level (viewer/editor/full), separate from the
// broader workspace_members.role which governs workspace-level actions like
// deleting the workspace.
async function getAccessLevel(workspaceId, userId) {
  const owner = await pool.query(
    "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
    [workspaceId, userId]
  );
  if (owner.rows.length) return "full";

  const member = await pool.query(
    "SELECT access_level FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, userId]
  );
  if (!member.rows.length) return null; // not a member at all

  return member.rows[0].access_level || "editor";
}

function hasAtLeast(level, minLevel) {
  if (!level) return false;
  return (RANK[level] || 0) >= (RANK[minLevel] || 0);
}

// Express middleware — requires req.body.workspace_id (task create) to
// resolve the workspace. For update/delete routes where the workspace has
// to come from the task row instead, call getAccessLevel directly.
function requireEditAccess(req, res, next) {
  const workspaceId = req.body.workspace_id;
  if (!workspaceId) return res.status(400).json({ message: "workspace_id required" });

  getAccessLevel(workspaceId, req.user.id)
    .then(level => {
      if (!hasAtLeast(level, "editor")) {
        return res.status(403).json({ message: "You have view-only access to this workspace" });
      }
      next();
    })
    .catch(err => {
      console.error("Access level check error:", err);
      res.status(500).json({ message: "Server error" });
    });
}

module.exports = { getAccessLevel, hasAtLeast, requireEditAccess };
