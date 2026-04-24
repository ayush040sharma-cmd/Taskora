/**
 * Workspace Members Routes — Phase 5 RBAC
 *
 * GET    /api/members?workspace_id=X          — list members
 * POST   /api/members                         — add member by email
 * PUT    /api/members/:memberId               — change role
 * DELETE /api/members/:memberId               — remove member
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");

// Valid roles (simple, no hierarchy complexity)
const VALID_ROLES = ["manager", "member", "viewer"];

// ── GET /api/members?workspace_id=X ──────────────────────────────────────────
router.get("/", auth, async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });

  try {
    // Verify requester has access to this workspace
    const ws = await pool.query(
      "SELECT id FROM workspaces WHERE id=$1 AND user_id=$2",
      [workspace_id, req.user.id]
    );

    // Also check if they're a member themselves
    const memberCheck = await pool.query(
      "SELECT id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",
      [workspace_id, req.user.id]
    );

    if (!ws.rows.length && !memberCheck.rows.length) {
      return res.status(403).json({ message: "Access denied" });
    }

    const result = await pool.query(
      `SELECT
         wm.id       AS member_record_id,
         wm.role,
         wm.joined_at,
         u.id        AS user_id,
         u.name,
         u.email,
         u.role      AS global_role,
         uc.daily_hours,
         uc.on_leave,
         uc.travel_mode
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       LEFT JOIN user_capacity uc ON uc.user_id = u.id
       WHERE wm.workspace_id = $1
       ORDER BY wm.joined_at ASC`,
      [workspace_id]
    );

    // Also include the workspace owner if not already in members
    const ownerResult = await pool.query(
      `SELECT u.id AS user_id, u.name, u.email, u.role AS global_role,
              uc.daily_hours, uc.on_leave, uc.travel_mode,
              w.created_at AS joined_at
       FROM workspaces w
       JOIN users u ON u.id = w.user_id
       LEFT JOIN user_capacity uc ON uc.user_id = u.id
       WHERE w.id = $1`,
      [workspace_id]
    );

    const memberIds  = new Set(result.rows.map(r => r.user_id));
    const ownerRows  = ownerResult.rows
      .filter(r => !memberIds.has(r.user_id))
      .map(r => ({
        ...r,
        member_record_id: null,
        role: "manager",
        is_owner: true,
      }));

    const allMembers = [
      ...ownerRows,
      ...result.rows.map(r => ({ ...r, is_owner: false })),
    ];

    res.json(allMembers);
  } catch (err) {
    console.error("List members error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/members ─────────────────────────────────────────────────────────
// Add a member to a workspace by email
router.post("/", auth, async (req, res) => {
  const { workspace_id, email, role = "member" } = req.body;

  if (!workspace_id || !email) {
    return res.status(400).json({ message: "workspace_id and email are required" });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(", ")}` });
  }

  try {
    // Verify requester owns this workspace
    const ws = await pool.query(
      "SELECT id FROM workspaces WHERE id=$1 AND user_id=$2",
      [workspace_id, req.user.id]
    );
    if (!ws.rows.length) return res.status(403).json({ message: "Only workspace owners can add members" });

    // Find the user by email
    const userRow = await pool.query(
      "SELECT id, name, email FROM users WHERE email ILIKE $1",
      [email.trim()]
    );
    if (!userRow.rows.length) {
      return res.status(404).json({ message: `No Taskora account found for "${email}". They need to sign up first at taskora.app.` });
    }
    const target = userRow.rows[0];

    // Don't add the owner to their own workspace
    if (target.id === req.user.id) {
      return res.status(400).json({ message: "You are already the workspace owner" });
    }

    // Check for duplicate
    const existing = await pool.query(
      "SELECT id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",
      [workspace_id, target.id]
    );
    if (existing.rows.length) {
      return res.status(409).json({ message: `${target.name} is already a member` });
    }

    // Insert member record
    const result = await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [workspace_id, target.id, role, req.user.id]
    );

    // Optionally seed user_capacity row
    await pool.query(
      `INSERT INTO user_capacity (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [target.id]
    );

    res.status(201).json({
      ...result.rows[0],
      name:  target.name,
      email: target.email,
    });
  } catch (err) {
    console.error("Add member error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/members/:memberId ────────────────────────────────────────────────
// Change a member's role
router.put("/:memberId", auth, async (req, res) => {
  const { role } = req.body;
  const { memberId } = req.params;

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(", ")}` });
  }

  try {
    // Verify requester owns the workspace this member belongs to
    const check = await pool.query(
      `SELECT wm.id, wm.workspace_id FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.id = $1 AND w.user_id = $2`,
      [memberId, req.user.id]
    );
    if (!check.rows.length) {
      return res.status(403).json({ message: "Only workspace owners can change roles" });
    }

    const result = await pool.query(
      "UPDATE workspace_members SET role=$1 WHERE id=$2 RETURNING *",
      [role, memberId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update member role error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE /api/members/:memberId ─────────────────────────────────────────────
// Remove a member
router.delete("/:memberId", auth, async (req, res) => {
  const { memberId } = req.params;

  try {
    // Verify requester owns the workspace or is removing themselves
    const check = await pool.query(
      `SELECT wm.id, wm.user_id, wm.workspace_id FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.id = $1 AND (w.user_id = $2 OR wm.user_id = $2)`,
      [memberId, req.user.id]
    );
    if (!check.rows.length) {
      return res.status(403).json({ message: "Permission denied" });
    }

    await pool.query("DELETE FROM workspace_members WHERE id=$1", [memberId]);
    res.json({ message: "Member removed" });
  } catch (err) {
    console.error("Remove member error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
