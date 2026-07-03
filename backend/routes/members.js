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
const { validate, schemas } = require("../utils/validate");
const { sendWorkspaceInvite, sendWorkspaceAddedNotification } = require("../services/emailService");
const { enforceLimit } = require("../middleware/planEnforce");
const { FEATURES }     = require("../config/licensing");

const VALID_ROLES = ["manager", "member", "viewer"];

// +1 to count the workspace owner themselves as a member for limit purposes.
async function countWorkspaceMembers(req) {
  const { rows } = await pool.query(
    "SELECT (1 + COUNT(*))::int AS c FROM workspace_members WHERE workspace_id = $1",
    [req.body.workspace_id]
  );
  return rows[0].c;
}

// Auto-create workspace_invites table on server start
pool.query(`
  CREATE TABLE IF NOT EXISTS workspace_invites (
    id           SERIAL PRIMARY KEY,
    token        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    role         VARCHAR(20) DEFAULT 'member',
    expires_at   TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
    used_at      TIMESTAMPTZ,
    used_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.error("[members] workspace_invites init:", e.message));

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
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",
      [workspace_id, req.user.id]
    );

    if (!ws.rows.length && !memberCheck.rows.length) {
      return res.status(403).json({ message: "Access denied" });
    }

    const result = await pool.query(
      `SELECT
         wm.user_id  AS member_record_id,
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
router.post("/", auth, validate(schemas.addMember), enforceLimit(FEATURES.MEMBER_LIMIT, countWorkspaceMembers), async (req, res) => {
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

    // ── Not a Taskora user yet: send invite email instead ────────────────────
    if (!userRow.rows.length) {
      const wsInfo = await pool.query("SELECT name FROM workspaces WHERE id=$1", [workspace_id]);
      const workspaceName = wsInfo.rows[0]?.name || "a workspace";

      const inviteR = await pool.query(
        `INSERT INTO workspace_invites (workspace_id, created_by, role)
         VALUES ($1,$2,$3) RETURNING token`,
        [workspace_id, req.user.id, role]
      );
      const token = inviteR.rows[0].token;

      const emailResult = await sendWorkspaceInvite({
        toEmail:       email.trim(),
        inviterName:   req.user.name,
        workspaceName,
        role,
        inviteToken:   token,
      });

      return res.status(202).json({
        invited:    true,
        email:      email.trim(),
        email_sent: emailResult.sent,
        invite_url: emailResult.link,
        message:    emailResult.sent
          ? `Invite email sent to ${email.trim()}`
          : `${email.trim()} isn't on Taskora yet. Share this invite link with them:`,
      });
    }

    const target = userRow.rows[0];

    // Don't add the owner to their own workspace
    if (target.id === req.user.id) {
      return res.status(400).json({ message: "You are already the workspace owner" });
    }

    // Check for duplicate
    const existing = await pool.query(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",
      [workspace_id, target.id]
    );
    if (existing.rows.length) {
      return res.status(409).json({ message: `${target.name} is already a member` });
    }

    // Insert member record (try with invited_by first, fall back if column absent)
    let result;
    try {
      result = await pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [workspace_id, target.id, role, req.user.id]
      );
    } catch (colErr) {
      // Fall back without invited_by for older schemas
      result = await pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, $3) RETURNING *`,
        [workspace_id, target.id, role]
      );
    }

    // Optionally seed user_capacity row
    await pool.query(
      `INSERT INTO user_capacity (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [target.id]
    );

    // Notify the added user by email (fire-and-forget — don't block response)
    const wsInfo = await pool.query("SELECT name FROM workspaces WHERE id=$1", [workspace_id]);
    sendWorkspaceAddedNotification({
      toEmail:       target.email,
      toName:        target.name,
      inviterName:   req.user.name,
      workspaceName: wsInfo.rows[0]?.name || "a workspace",
      workspaceId:   workspace_id,
    }).catch(() => {});

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

// ── PUT /api/members/:userId ──────────────────────────────────────────────────
// Change a member's role  (userId = the member's user_id; workspace_id in body)
router.put("/:userId", auth, validate(schemas.updateMemberRole), async (req, res) => {
  const { role, workspace_id } = req.body;
  const { userId } = req.params;

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(", ")}` });
  }
  if (!workspace_id) {
    return res.status(400).json({ message: "workspace_id required in body" });
  }

  try {
    // Verify requester owns the workspace
    const check = await pool.query(
      "SELECT id FROM workspaces WHERE id=$1 AND user_id=$2",
      [workspace_id, req.user.id]
    );
    if (!check.rows.length) {
      return res.status(403).json({ message: "Only workspace owners can change roles" });
    }

    const result = await pool.query(
      "UPDATE workspace_members SET role=$1 WHERE workspace_id=$2 AND user_id=$3 RETURNING *",
      [role, workspace_id, userId]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Member not found in this workspace" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update member role error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE /api/members/:userId ───────────────────────────────────────────────
// Remove a member  (userId = the member's user_id; workspace_id in query)
router.delete("/:userId", auth, async (req, res) => {
  const { userId } = req.params;
  const { workspace_id } = req.query;

  if (!workspace_id) {
    return res.status(400).json({ message: "workspace_id required as query param" });
  }

  try {
    // Allow workspace owner OR the member themselves to remove
    const check = await pool.query(
      `SELECT wm.user_id, wm.workspace_id FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.workspace_id=$1 AND wm.user_id=$2 AND (w.user_id=$3 OR wm.user_id=$3)`,
      [workspace_id, userId, req.user.id]
    );
    if (!check.rows.length) {
      return res.status(403).json({ message: "Permission denied" });
    }

    await pool.query(
      "DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",
      [workspace_id, userId]
    );
    res.json({ message: "Member removed" });
  } catch (err) {
    console.error("Remove member error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/members/invite — generate an invite link ───────────────────────
router.post("/invite", auth, async (req, res) => {
  const { workspace_id, role = "member" } = req.body;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ message: "Invalid role" });

  try {
    const ws = await pool.query(
      "SELECT id, name FROM workspaces WHERE id=$1 AND user_id=$2",
      [workspace_id, req.user.id]
    );
    if (!ws.rows.length) {
      return res.status(403).json({ message: "Only workspace owners can create invite links" });
    }

    const r = await pool.query(
      `INSERT INTO workspace_invites (workspace_id, created_by, role)
       VALUES ($1, $2, $3) RETURNING token, expires_at, role`,
      [workspace_id, req.user.id, role]
    );
    res.json({ ...r.rows[0], workspace_name: ws.rows[0].name });
  } catch (err) {
    console.error("Create invite error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/members/invite/:token — public: validate & return invite info ───
router.get("/invite/:token", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT wi.token, wi.role, wi.expires_at, wi.used_at,
              w.name AS workspace_name,
              u.name AS invited_by_name
       FROM workspace_invites wi
       JOIN workspaces w ON w.id = wi.workspace_id
       LEFT JOIN users u ON u.id = wi.created_by
       WHERE wi.token = $1`,
      [req.params.token]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Invite link not found" });

    const inv = r.rows[0];
    if (new Date(inv.expires_at) < new Date()) {
      return res.status(410).json({ message: "This invite link has expired" });
    }
    if (inv.used_at) {
      return res.status(410).json({ message: "This invite link has already been used" });
    }
    res.json({ valid: true, workspace_name: inv.workspace_name, invited_by_name: inv.invited_by_name, role: inv.role, expires_at: inv.expires_at });
  } catch (err) {
    console.error("Get invite error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/members/invite/:token/accept — authenticated user joins workspace
router.post("/invite/:token/accept", auth, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM workspace_invites WHERE token=$1",
      [req.params.token]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Invite not found" });

    const inv = r.rows[0];
    if (new Date(inv.expires_at) < new Date()) return res.status(410).json({ message: "Invite expired" });
    if (inv.used_at) return res.status(410).json({ message: "Invite already used" });

    // Already a member?
    const dup = await pool.query(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",
      [inv.workspace_id, req.user.id]
    );
    if (dup.rows.length) return res.status(409).json({ message: "You are already a member of this workspace" });

    // Owner doesn't need membership row
    const owner = await pool.query(
      "SELECT id FROM workspaces WHERE id=$1 AND user_id=$2",
      [inv.workspace_id, req.user.id]
    );
    if (owner.rows.length) return res.status(409).json({ message: "You are the owner of this workspace" });

    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [inv.workspace_id, req.user.id, inv.role, inv.created_by]
    );
    await pool.query(
      "INSERT INTO user_capacity (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [req.user.id]
    );
    await pool.query(
      "UPDATE workspace_invites SET used_at=NOW(), used_by=$1 WHERE token=$2",
      [req.user.id, req.params.token]
    );

    const ws = await pool.query("SELECT id, name FROM workspaces WHERE id=$1", [inv.workspace_id]);
    res.json({ workspace: ws.rows[0], role: inv.role });
  } catch (err) {
    console.error("Accept invite error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
