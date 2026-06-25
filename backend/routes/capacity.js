/**
 * Capacity & User Settings Routes
 * GET  /api/capacity/me              — my capacity settings
 * PUT  /api/capacity/me              — update my capacity
 * PUT  /api/capacity/travel          — toggle travel mode
 * PUT  /api/capacity/leave           — set leave dates
 * GET  /api/capacity/team/:wsId      — manager: full team capacity
 * PUT  /api/capacity/team/:wsId/:uid — manager: update a team member's capacity
 * GET  /api/capacity/predict/:wsId   — AI future load prediction for whole team
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");
const { requireMinRole } = require("../middleware/rbac");
const wl = require("../services/workloadEngine");
const { audit } = require("../services/auditService");

// ── Helper: get or create capacity row ──────────────────────────────────────
async function getOrCreate(userId) {
  const r = await pool.query("SELECT * FROM user_capacity WHERE user_id = $1", [userId]);
  if (r.rows.length) return r.rows[0];
  const ins = await pool.query(
    "INSERT INTO user_capacity (user_id) VALUES ($1) RETURNING *",
    [userId]
  );
  return ins.rows[0];
}

// ── GET /api/capacity/me ─────────────────────────────────────────────────────
router.get("/me", auth, async (req, res) => {
  try {
    const cap  = await getOrCreate(req.user.id);
    const user = await pool.query("SELECT id, name, email, role FROM users WHERE id=$1", [req.user.id]);
    // Provide safe defaults for any columns that may not exist yet in older DBs
    const safe = {
      daily_hours:           8,
      customer_facing_hours: 6,
      internal_hours:        2,
      travel_mode:           false,
      travel_hours:          2,
      on_leave:              false,
      leave_start:           null,
      leave_end:             null,
      max_rfp:               1,
      max_proposals:         2,
      max_presentations:     2,
      max_upgrades:          2,
      ...cap,
      role: user.rows[0]?.role || "member",
    };
    res.json(safe);
  } catch (err) {
    console.error(err);
    // Return safe defaults so the UI still renders
    res.json({
      daily_hours: 8, customer_facing_hours: 6, internal_hours: 2,
      travel_mode: false, travel_hours: 2, on_leave: false,
      max_rfp: 1, max_proposals: 2, max_presentations: 2, max_upgrades: 2,
    });
  }
});

// ── PUT /api/capacity/me ─────────────────────────────────────────────────────
router.put("/me", auth, async (req, res) => {
  const {
    daily_hours, customer_facing_hours, internal_hours,
    max_rfp, max_proposals, max_presentations, max_upgrades,
  } = req.body;

  try {
    await getOrCreate(req.user.id);

    // Build SET clause dynamically — only update columns that actually exist
    const colMap = {
      daily_hours, max_rfp, max_proposals, max_presentations, max_upgrades,
    };
    // Try adding optional columns if provided
    if (customer_facing_hours !== undefined) colMap.customer_facing_hours = customer_facing_hours;
    if (internal_hours        !== undefined) colMap.internal_hours        = internal_hours;

    const setClauses = [];
    const vals = [];
    Object.entries(colMap).forEach(([col, val]) => {
      if (val !== undefined && val !== null) {
        vals.push(val);
        setClauses.push(`${col} = $${vals.length}`);
      }
    });
    setClauses.push("updated_at = NOW()");
    vals.push(req.user.id);

    const updated = await pool.query(
      `UPDATE user_capacity SET ${setClauses.join(", ")} WHERE user_id = $${vals.length} RETURNING *`,
      vals
    ).catch(async () => {
      // Fallback: update only core columns if optional ones fail
      return pool.query(
        `UPDATE user_capacity SET
           daily_hours=$1, max_rfp=$2, max_proposals=$3,
           max_presentations=$4, max_upgrades=$5, updated_at=NOW()
         WHERE user_id=$6 RETURNING *`,
        [daily_hours||8, max_rfp||1, max_proposals||2, max_presentations||2, max_upgrades||2, req.user.id]
      );
    });

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/capacity/travel ─────────────────────────────────────────────────
router.put("/travel", auth, async (req, res) => {
  const { travel_mode, travel_hours } = req.body;
  try {
    await getOrCreate(req.user.id);
    const r = await pool.query(
      `UPDATE user_capacity SET travel_mode=$1, travel_hours=COALESCE($2,travel_hours), updated_at=NOW()
       WHERE user_id=$3 RETURNING *`,
      [Boolean(travel_mode), travel_hours, req.user.id]
    );
    await audit({ actor_id: req.user.id, action: travel_mode ? "travel_mode_on" : "travel_mode_off", target_type: "user", target_id: req.user.id });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/capacity/leave ──────────────────────────────────────────────────
router.put("/leave", auth, async (req, res) => {
  const { on_leave, leave_start, leave_end } = req.body;
  try {
    await getOrCreate(req.user.id);
    const r = await pool.query(
      `UPDATE user_capacity SET on_leave=$1, leave_start=$2, leave_end=$3, updated_at=NOW()
       WHERE user_id=$4 RETURNING *`,
      [Boolean(on_leave), leave_start || null, leave_end || null, req.user.id]
    );
    await audit({ actor_id: req.user.id, action: on_leave ? "leave_started" : "leave_ended", target_type: "user", target_id: req.user.id });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/capacity/team/:wsId ─────────────────────────────────────────────
// Manager/Super Boss: see full team workload summary
router.get("/team/:wsId", auth, requireMinRole("manager"), async (req, res) => {
  const { wsId } = req.params;
  try {
    // All members + owner of this workspace (UNION so owner is never excluded)
    const members = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.email, u.role,
              uc.daily_hours, uc.customer_facing_hours, uc.internal_hours,
              uc.travel_mode, uc.travel_hours, uc.on_leave, uc.leave_start, uc.leave_end,
              uc.max_rfp, uc.max_proposals, uc.max_presentations, uc.max_upgrades
       FROM (
         SELECT wm.user_id FROM workspace_members wm WHERE wm.workspace_id = $1
         UNION
         SELECT w.user_id FROM workspaces w WHERE w.id = $1
       ) AS combined
       JOIN users u ON u.id = combined.user_id
       LEFT JOIN user_capacity uc ON uc.user_id = u.id
       ORDER BY u.name`,
      [wsId]
    );

    // Active tasks per member
    const tasks = await pool.query(
      `SELECT t.*, u.name AS assignee_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_user_id
       WHERE t.workspace_id = $1 AND t.status NOT IN ('done')
       ORDER BY t.assigned_user_id`,
      [wsId]
    );

    const tasksByUser = {};
    tasks.rows.forEach(t => {
      if (!t.assigned_user_id) return;
      if (!tasksByUser[t.assigned_user_id]) tasksByUser[t.assigned_user_id] = [];
      tasksByUser[t.assigned_user_id].push(t);
    });

    const summaries = members.rows.map(m => {
      const cap       = m;
      const userTasks = tasksByUser[m.id] || [];
      return wl.buildUserSummary(m, userTasks, cap);
    });

    res.json(summaries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/capacity/team/:wsId/:uid ────────────────────────────────────────
// Manager: update a team member's capacity / leave / travel
router.put("/team/:wsId/:uid", auth, requireMinRole("manager"), async (req, res) => {
  const targetUid = parseInt(req.params.uid);
  const updates   = req.body;

  try {
    await getOrCreate(targetUid);
    const fields = [
      "daily_hours","customer_facing_hours","internal_hours",
      "travel_mode","travel_hours","on_leave","leave_start","leave_end",
      "max_rfp","max_proposals","max_presentations","max_upgrades",
    ];
    const setClauses = [];
    const vals       = [];
    fields.forEach(f => {
      if (updates[f] !== undefined) {
        vals.push(updates[f]);
        setClauses.push(`${f} = $${vals.length}`);
      }
    });
    if (!setClauses.length) return res.status(400).json({ message: "No fields to update" });
    vals.push(targetUid);
    const r = await pool.query(
      `UPDATE user_capacity SET ${setClauses.join(", ")}, updated_at=NOW() WHERE user_id=$${vals.length} RETURNING *`,
      vals
    );
    await audit({
      workspace_id: req.params.wsId,
      actor_id: req.user.id,
      action: "capacity_changed",
      target_type: "user",
      target_id: targetUid,
      meta: updates,
    });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/capacity/predict/:wsId ─────────────────────────────────────────
// AI future load prediction for team (next 14 working days)
router.get("/predict/:wsId", auth, requireMinRole("manager"), async (req, res) => {
  const { wsId } = req.params;
  const days     = parseInt(req.query.days) || 14;
  try {
    const members = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.role, uc.*
       FROM (
         SELECT wm.user_id FROM workspace_members wm WHERE wm.workspace_id = $1
         UNION
         SELECT w.user_id FROM workspaces w WHERE w.id = $1
       ) AS combined
       JOIN users u ON u.id = combined.user_id
       LEFT JOIN user_capacity uc ON uc.user_id = u.id`,
      [wsId]
    );
    const activeTasks = await pool.query(
      `SELECT * FROM tasks WHERE workspace_id=$1 AND status NOT IN ('done') AND assigned_user_id IS NOT NULL`,
      [wsId]
    );
    const tasksByUser = {};
    activeTasks.rows.forEach(t => {
      if (!tasksByUser[t.assigned_user_id]) tasksByUser[t.assigned_user_id] = [];
      tasksByUser[t.assigned_user_id].push(t);
    });

    const predictions = members.rows.map(m => ({
      user_id:    m.id,
      name:       m.name,
      prediction: wl.predictFutureLoad(tasksByUser[m.id] || [], m, days),
    }));

    res.json(predictions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CAPACITY REQUESTS — leave/travel approval workflow for non-managers
// Uses capacity_requests table (see migrations/add_capacity_requests.sql)
// ─────────────────────────────────────────────────────────────────────────────

const { notifyOne } = require("../services/notificationService");

// ── POST /api/capacity/requests ──────────────────────────────────────────────
// Non-manager creates a leave or travel request → manager gets notified
router.post("/requests", auth, async (req, res) => {
  const { request_type, workspace_id, leave_start, leave_end, travel_hours, justification } = req.body;
  if (!request_type || !workspace_id) {
    return res.status(400).json({ message: "request_type and workspace_id are required" });
  }

  try {
    // Find the manager of this workspace (owner or first manager-role member)
    const managerQ = await pool.query(
      `SELECT u.id, u.name FROM users u
       JOIN workspaces w ON w.user_id = u.id
       WHERE w.id = $1
       UNION
       SELECT u.id, u.name FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id
       WHERE wm.workspace_id = $1 AND u.role IN ('manager','super_boss')
       LIMIT 1`,
      [workspace_id]
    );
    const manager = managerQ.rows[0];

    // Insert the request record
    const r = await pool.query(
      `INSERT INTO capacity_requests
         (user_id, workspace_id, manager_id, request_type, leave_start, leave_end, travel_hours, justification)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        req.user.id, workspace_id, manager?.id || null,
        request_type,
        leave_start || null, leave_end || null,
        travel_hours || null,
        justification || null,
      ]
    );

    // Notify manager
    if (manager?.id) {
      await notifyOne(
        manager.id,
        "approval_pending",
        `${request_type === "leave" ? "🏖️ Leave" : "✈️ Travel"} request from ${req.user.name}`,
        `${req.user.name} has requested ${request_type} approval.`,
        { capacity_request_id: r.rows[0].id, requester: req.user.name }
      ).catch(() => {});
    }

    res.status(201).json(r.rows[0]);
  } catch (err) {
    // Gracefully handle missing table (migration not run yet)
    if (err.code === "42P01") {
      return res.status(202).json({ message: "Request noted (run capacity_requests migration to persist)" });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/capacity/requests ───────────────────────────────────────────────
// Manager: see all pending capacity requests for a workspace
router.get("/requests", auth, async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });

  try {
    const r = await pool.query(
      `SELECT cr.*,
              u.name AS requester_name, u.email AS requester_email, u.role AS requester_role
       FROM capacity_requests cr
       JOIN users u ON u.id = cr.user_id
       WHERE cr.workspace_id = $1
       ORDER BY cr.requested_at DESC`,
      [workspace_id]
    );
    res.json(r.rows);
  } catch (err) {
    if (err.code === "42P01") return res.json([]);
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/capacity/requests/:id/approve ───────────────────────────────────
router.put("/requests/:id/approve", auth, async (req, res) => {
  const { id } = req.params;
  try {
    const reqR = await pool.query("SELECT * FROM capacity_requests WHERE id=$1", [id]);
    if (!reqR.rows.length) return res.status(404).json({ message: "Request not found" });
    const cr = reqR.rows[0];

    // Apply the capacity change
    await getOrCreate(cr.user_id);
    if (cr.request_type === "leave") {
      await pool.query(
        "UPDATE user_capacity SET on_leave=true, leave_start=$1, leave_end=$2, updated_at=NOW() WHERE user_id=$3",
        [cr.leave_start, cr.leave_end, cr.user_id]
      );
    } else if (cr.request_type === "travel") {
      await pool.query(
        "UPDATE user_capacity SET travel_mode=true, travel_hours=$1, updated_at=NOW() WHERE user_id=$2",
        [cr.travel_hours || 2, cr.user_id]
      );
    }

    // Mark request approved
    const updated = await pool.query(
      "UPDATE capacity_requests SET status='approved', manager_id=$1, resolved_at=NOW() WHERE id=$2 RETURNING *",
      [req.user.id, id]
    );

    // Notify requester
    await notifyOne(
      cr.user_id,
      "approval_resolved",
      `${cr.request_type === "leave" ? "🏖️ Leave" : "✈️ Travel"} request approved`,
      `Your ${cr.request_type} request has been approved by ${req.user.name}.`,
      { capacity_request_id: cr.id }
    ).catch(() => {});

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/capacity/requests/:id/reject ────────────────────────────────────
router.put("/requests/:id/reject", auth, async (req, res) => {
  const { id } = req.params;
  const { rejection_reason } = req.body;
  try {
    const reqR = await pool.query("SELECT * FROM capacity_requests WHERE id=$1", [id]);
    if (!reqR.rows.length) return res.status(404).json({ message: "Request not found" });
    const cr = reqR.rows[0];

    const updated = await pool.query(
      "UPDATE capacity_requests SET status='rejected', rejection_reason=$1, manager_id=$2, resolved_at=NOW() WHERE id=$3 RETURNING *",
      [rejection_reason || null, req.user.id, id]
    );

    await notifyOne(
      cr.user_id,
      "approval_resolved",
      `${cr.request_type === "leave" ? "🏖️ Leave" : "✈️ Travel"} request rejected`,
      `Your ${cr.request_type} request was rejected by ${req.user.name}. ${rejection_reason || ""}`,
      { capacity_request_id: cr.id, rejected: true }
    ).catch(() => {});

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
