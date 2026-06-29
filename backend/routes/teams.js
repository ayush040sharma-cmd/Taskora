/**
 * Teams API — Taskora v1.1
 *
 * GET    /api/teams?workspace_id=X        — list teams in workspace
 * POST   /api/teams                       — create team
 * PUT    /api/teams/:id                   — update team
 * DELETE /api/teams/:id                   — delete team
 * GET    /api/teams/:id/members           — list team members
 * POST   /api/teams/:id/members           — add member
 * PUT    /api/teams/:id/members/:userId   — change member role
 * DELETE /api/teams/:id/members/:userId   — remove member
 * GET    /api/teams/workspace/:wsId/tasks — tasks assigned to any team
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");

// ── Helper: verify workspace access (owner or member) ────────────────────────
async function canAccessWorkspace(userId, workspaceId) {
  const [owner, member] = await Promise.all([
    pool.query("SELECT id FROM workspaces WHERE id=$1 AND user_id=$2", [workspaceId, userId]),
    pool.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [workspaceId, userId]),
  ]);
  return owner.rows.length > 0 || member.rows.length > 0;
}

// ── Helper: verify workspace ownership (owner only) ──────────────────────────
async function isWorkspaceOwner(userId, workspaceId) {
  const r = await pool.query("SELECT id FROM workspaces WHERE id=$1 AND user_id=$2", [workspaceId, userId]);
  return r.rows.length > 0;
}

// ── GET /api/teams?workspace_id=X ────────────────────────────────────────────
router.get("/", auth, async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });

  try {
    if (!(await canAccessWorkspace(req.user.id, workspace_id))) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { rows } = await pool.query(
      `SELECT t.*,
              COUNT(DISTINCT tm.user_id)::int AS member_count,
              u.name AS created_by_name
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.workspace_id = $1
       GROUP BY t.id, u.name
       ORDER BY t.created_at ASC`,
      [workspace_id]
    );
    res.json(rows);
  } catch (err) {
    console.error("List teams error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/teams ───────────────────────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  const { workspace_id, name, description, color = "#6366f1", icon = "👥" } = req.body;
  if (!workspace_id || !name?.trim()) {
    return res.status(400).json({ message: "workspace_id and name are required" });
  }

  try {
    if (!(await canAccessWorkspace(req.user.id, workspace_id))) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { rows } = await pool.query(
      `INSERT INTO teams (workspace_id, name, description, color, icon, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [workspace_id, name.trim(), description || null, color, icon, req.user.id]
    );
    const team = rows[0];

    // Auto-add creator as team lead
    await pool.query(
      `INSERT INTO team_members (team_id, user_id, role, added_by)
       VALUES ($1,$2,'lead',$2) ON CONFLICT DO NOTHING`,
      [team.id, req.user.id]
    );

    res.status(201).json({ ...team, member_count: 1 });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "A team with that name already exists" });
    console.error("Create team error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/teams/:id ────────────────────────────────────────────────────────
router.put("/:id", auth, async (req, res) => {
  const { name, description, color, icon } = req.body;
  try {
    const teamRes = await pool.query("SELECT * FROM teams WHERE id=$1", [req.params.id]);
    if (!teamRes.rows.length) return res.status(404).json({ message: "Team not found" });
    const team = teamRes.rows[0];

    if (!(await canAccessWorkspace(req.user.id, team.workspace_id))) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { rows } = await pool.query(
      `UPDATE teams SET
         name=COALESCE($1,name),
         description=COALESCE($2,description),
         color=COALESCE($3,color),
         icon=COALESCE($4,icon),
         updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [name?.trim() || null, description, color, icon, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Team name already taken" });
    console.error("Update team error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE /api/teams/:id ─────────────────────────────────────────────────────
router.delete("/:id", auth, async (req, res) => {
  try {
    const teamRes = await pool.query("SELECT * FROM teams WHERE id=$1", [req.params.id]);
    if (!teamRes.rows.length) return res.status(404).json({ message: "Team not found" });
    const team = teamRes.rows[0];

    if (!(await isWorkspaceOwner(req.user.id, team.workspace_id))) {
      return res.status(403).json({ message: "Only workspace owners can delete teams" });
    }

    // Nullify team_id on tasks before deleting
    await pool.query("UPDATE tasks SET team_id=NULL WHERE team_id=$1", [req.params.id]);
    await pool.query("DELETE FROM teams WHERE id=$1", [req.params.id]);
    res.json({ message: "Team deleted" });
  } catch (err) {
    console.error("Delete team error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/teams/:id/members ────────────────────────────────────────────────
router.get("/:id/members", auth, async (req, res) => {
  try {
    const teamRes = await pool.query("SELECT * FROM teams WHERE id=$1", [req.params.id]);
    if (!teamRes.rows.length) return res.status(404).json({ message: "Team not found" });

    if (!(await canAccessWorkspace(req.user.id, teamRes.rows[0].workspace_id))) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { rows } = await pool.query(
      `SELECT tm.team_id, tm.user_id, tm.role, tm.added_at,
              u.name, u.email
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1
       ORDER BY tm.role DESC, u.name ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("List team members error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/teams/:id/members ───────────────────────────────────────────────
router.post("/:id/members", auth, async (req, res) => {
  const { user_id, role = "member" } = req.body;
  if (!user_id) return res.status(400).json({ message: "user_id required" });
  if (!["lead", "member"].includes(role)) {
    return res.status(400).json({ message: "role must be lead or member" });
  }

  try {
    const teamRes = await pool.query("SELECT * FROM teams WHERE id=$1", [req.params.id]);
    if (!teamRes.rows.length) return res.status(404).json({ message: "Team not found" });

    if (!(await canAccessWorkspace(req.user.id, teamRes.rows[0].workspace_id))) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Verify target user is a workspace member
    const wsMember = await pool.query(
      `SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2
       UNION SELECT user_id FROM workspaces WHERE id=$1 AND user_id=$2`,
      [teamRes.rows[0].workspace_id, user_id]
    );
    if (!wsMember.rows.length) {
      return res.status(400).json({ message: "User is not a member of this workspace" });
    }

    const { rows } = await pool.query(
      `INSERT INTO team_members (team_id, user_id, role, added_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (team_id, user_id) DO UPDATE SET role=$3
       RETURNING *`,
      [req.params.id, user_id, role, req.user.id]
    );

    const userInfo = await pool.query("SELECT id, name, email FROM users WHERE id=$1", [user_id]);
    res.status(201).json({ ...rows[0], ...userInfo.rows[0] });
  } catch (err) {
    console.error("Add team member error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/teams/:id/members/:userId ────────────────────────────────────────
router.put("/:id/members/:userId", auth, async (req, res) => {
  const { role } = req.body;
  if (!["lead", "member"].includes(role)) {
    return res.status(400).json({ message: "role must be lead or member" });
  }

  try {
    const teamRes = await pool.query("SELECT * FROM teams WHERE id=$1", [req.params.id]);
    if (!teamRes.rows.length) return res.status(404).json({ message: "Team not found" });

    if (!(await canAccessWorkspace(req.user.id, teamRes.rows[0].workspace_id))) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { rows } = await pool.query(
      "UPDATE team_members SET role=$1 WHERE team_id=$2 AND user_id=$3 RETURNING *",
      [role, req.params.id, req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ message: "Member not found in team" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Update team member role error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE /api/teams/:id/members/:userId ─────────────────────────────────────
router.delete("/:id/members/:userId", auth, async (req, res) => {
  try {
    const teamRes = await pool.query("SELECT * FROM teams WHERE id=$1", [req.params.id]);
    if (!teamRes.rows.length) return res.status(404).json({ message: "Team not found" });

    if (!(await canAccessWorkspace(req.user.id, teamRes.rows[0].workspace_id))) {
      return res.status(403).json({ message: "Access denied" });
    }

    await pool.query(
      "DELETE FROM team_members WHERE team_id=$1 AND user_id=$2",
      [req.params.id, req.params.userId]
    );
    res.json({ message: "Member removed from team" });
  } catch (err) {
    console.error("Remove team member error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/teams/workspace/:wsId/tasks — tasks with team info ───────────────
router.get("/workspace/:wsId/tasks", auth, async (req, res) => {
  try {
    if (!(await canAccessWorkspace(req.user.id, req.params.wsId))) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.status, t.priority, t.team_id, t.assigned_user_id,
              te.name AS team_name, te.color AS team_color
       FROM tasks t
       LEFT JOIN teams te ON te.id = t.team_id
       WHERE t.workspace_id = $1
       ORDER BY t.created_at DESC`,
      [req.params.wsId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Team tasks error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
