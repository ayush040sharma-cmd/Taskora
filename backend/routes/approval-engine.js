/**
 * Generic Approval Engine API
 *
 * POST   /api/approvals-engine           — submit any approval request
 * GET    /api/approvals-engine           — list requests (requester or approver view)
 * GET    /api/approvals-engine/pending   — requests pending my action
 * GET    /api/approvals-engine/stats     — dashboard counts (pending/overdue/approved today)
 * PUT    /api/approvals-engine/:id/approve  — approve with optional note
 * PUT    /api/approvals-engine/:id/reject   — reject with note
 * PUT    /api/approvals-engine/:id/info     — request more information
 * PUT    /api/approvals-engine/:id/cancel   — requester cancels
 * POST   /api/approvals-engine/:id/escalate — manually escalate
 *
 * Approval types (metadata shape per type):
 *   leave           → { leave_type, start_date, end_date, days }
 *   wfh             → { date, reason }
 *   expense         → { amount, currency, category, receipt_url }
 *   overtime        → { date, hours, reason }
 *   task_completion → { task_id, task_title }
 *   access_request  → { permission_key, reason }
 *   timesheet       → { week_start, hours }
 *   shift_change    → { current_shift, requested_shift, date }
 *   purchase        → { item, amount, vendor }
 *   document        → { document_name, doc_url }
 *   release         → { version, environment }
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");

let _io = null;
const setIO = (io) => { _io = io; };

const VALID_TYPES = [
  "leave","wfh","expense","overtime","task_completion",
  "access_request","timesheet","shift_change","purchase",
  "document","release","other"
];

async function notify(userId, type, title, body, data = {}) {
  try {
    const row = await pool.query(
      "INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [userId, type, title, body, JSON.stringify(data)]
    );
    if (_io) _io.to(`user:${userId}`).emit("notification", row.rows[0]);
  } catch {}
}

async function resolveApprover(requesterId, workspaceId) {
  // Try: user's manager_id first, then workspace owner, then any manager in workspace
  const managerRes = await pool.query(
    "SELECT manager_id FROM users WHERE id=$1", [requesterId]
  );
  if (managerRes.rows[0]?.manager_id) return managerRes.rows[0].manager_id;

  const wsOwner = await pool.query(
    "SELECT user_id FROM workspaces WHERE id=$1", [workspaceId]
  );
  if (wsOwner.rows[0]?.user_id && wsOwner.rows[0].user_id !== requesterId)
    return wsOwner.rows[0].user_id;

  const anyManager = await pool.query(
    "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='manager' AND user_id!=$2 LIMIT 1",
    [workspaceId, requesterId]
  );
  return anyManager.rows[0]?.user_id || null;
}

// POST /api/approvals-engine
router.post("/", auth, async (req, res) => {
  const { type, workspace_id, subject, description, metadata, approver_id, sla_hours } = req.body;
  if (!type || !subject) return res.status(400).json({ message: "type and subject required" });
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ message: "Invalid type" });

  try {
    const effectiveApproverId = approver_id ||
      await resolveApprover(req.user.id, workspace_id);

    const sla = sla_hours || 24;
    const due = new Date(Date.now() + sla * 60 * 60 * 1000);

    const { rows } = await pool.query(
      `INSERT INTO approval_requests
         (type, workspace_id, requester_id, approver_id, subject, description,
          metadata, sla_hours, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [type, workspace_id || null, req.user.id, effectiveApproverId,
       subject, description || null, JSON.stringify(metadata || {}), sla, due]
    );

    const request = rows[0];

    // Notify approver
    if (effectiveApproverId) {
      const requester = await pool.query("SELECT name FROM users WHERE id=$1", [req.user.id]);
      await notify(effectiveApproverId, "approval_request",
        `New ${type.replace(/_/g, " ")} request`,
        `${requester.rows[0]?.name} submitted: ${subject}`,
        { request_id: request.id, type, requester_id: req.user.id }
      );
    }

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/approvals-engine — list with filters
router.get("/", auth, async (req, res) => {
  const { status, type, workspace_id, view = "mine" } = req.query;
  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const conditions = ["1=1"];
    const params = [];
    let p = 1;

    if (view === "approver") {
      conditions.push(`ar.approver_id=$${p++}`); params.push(req.user.id);
    } else {
      conditions.push(`ar.requester_id=$${p++}`); params.push(req.user.id);
    }
    if (status) { conditions.push(`ar.status=$${p++}`); params.push(status); }
    if (type)   { conditions.push(`ar.type=$${p++}`);   params.push(type); }
    if (workspace_id) { conditions.push(`ar.workspace_id=$${p++}`); params.push(workspace_id); }

    params.push(limit, offset);

    const { rows } = await pool.query(`
      SELECT ar.*,
             rq.name AS requester_name, rq.email AS requester_email, rq.avatar_url AS requester_avatar,
             ap.name AS approver_name,
             CASE WHEN ar.due_at < NOW() AND ar.status='pending' THEN TRUE ELSE FALSE END AS is_overdue
      FROM approval_requests ar
      JOIN users rq  ON rq.id = ar.requester_id
      LEFT JOIN users ap ON ap.id = ar.approver_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY ar.created_at DESC
      LIMIT $${p++} OFFSET $${p}
    `, params);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/approvals-engine/pending — items awaiting my action
router.get("/pending", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ar.*,
             rq.name AS requester_name, rq.email AS requester_email, rq.avatar_url AS requester_avatar,
             CASE WHEN ar.due_at < NOW() THEN TRUE ELSE FALSE END AS is_overdue
      FROM approval_requests ar
      JOIN users rq ON rq.id = ar.requester_id
      WHERE ar.approver_id=$1 AND ar.status='pending'
      ORDER BY ar.due_at ASC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/approvals-engine/stats
router.get("/stats", auth, async (req, res) => {
  const wsId = req.query.workspace_id;
  try {
    const wsFilter = wsId ? "AND ar.workspace_id=$2" : "";
    const params = wsId ? [req.user.id, wsId] : [req.user.id];

    const [pending, overdue, approvedToday, myPending] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS c FROM approval_requests ar
         WHERE ar.approver_id=$1 AND ar.status='pending' ${wsFilter}`, params),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM approval_requests ar
         WHERE ar.approver_id=$1 AND ar.status='pending'
           AND ar.due_at < NOW() ${wsFilter}`, params),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM approval_requests ar
         WHERE ar.approver_id=$1 AND ar.status='approved'
           AND ar.decided_at >= NOW() - INTERVAL '24 hours' ${wsFilter}`, params),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM approval_requests ar
         WHERE ar.requester_id=$1 AND ar.status='pending' ${wsFilter}`, params),
    ]);

    res.json({
      pending_approvals:  pending.rows[0].c,
      overdue_approvals:  overdue.rows[0].c,
      approved_today:     approvedToday.rows[0].c,
      my_pending_requests: myPending.rows[0].c,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/approvals-engine/:id/approve
router.put("/:id/approve", auth, async (req, res) => {
  const { decision_note } = req.body;
  try {
    const arRes = await pool.query("SELECT * FROM approval_requests WHERE id=$1", [req.params.id]);
    const ar = arRes.rows[0];
    if (!ar) return res.status(404).json({ message: "Request not found" });
    if (ar.approver_id !== req.user.id)
      return res.status(403).json({ message: "You are not the approver" });
    if (ar.status !== "pending" && ar.status !== "info_requested")
      return res.status(400).json({ message: `Cannot approve a ${ar.status} request` });

    await pool.query(
      `UPDATE approval_requests
       SET status='approved', decided_at=NOW(), decision_note=$1, updated_at=NOW()
       WHERE id=$2`,
      [decision_note || null, req.params.id]
    );

    // If it's an access_request, auto-grant the permission
    if (ar.type === "access_request" && ar.metadata?.permission_key) {
      await pool.query(
        `INSERT INTO user_permission_overrides
           (user_id, permission_key, granted, granted_by, reason)
         VALUES ($1,$2,TRUE,$3,$4)
         ON CONFLICT (user_id, permission_key, workspace_id) DO UPDATE
           SET granted=TRUE, granted_by=$3`,
        [ar.requester_id, ar.metadata.permission_key, req.user.id,
         `Approved via approval #${ar.id}`]
      ).catch(() => {});
    }

    // Notify requester
    const approver = await pool.query("SELECT name FROM users WHERE id=$1", [req.user.id]);
    await notify(ar.requester_id, "approval_approved",
      `Your ${ar.type.replace(/_/g, " ")} request was approved`,
      `${approver.rows[0]?.name} approved: ${ar.subject}`,
      { request_id: ar.id, type: ar.type }
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/approvals-engine/:id/reject
router.put("/:id/reject", auth, async (req, res) => {
  const { decision_note } = req.body;
  if (!decision_note) return res.status(400).json({ message: "decision_note (reason) required for rejection" });
  try {
    const arRes = await pool.query("SELECT * FROM approval_requests WHERE id=$1", [req.params.id]);
    const ar = arRes.rows[0];
    if (!ar) return res.status(404).json({ message: "Request not found" });
    if (ar.approver_id !== req.user.id)
      return res.status(403).json({ message: "You are not the approver" });
    if (!["pending","info_requested"].includes(ar.status))
      return res.status(400).json({ message: "Cannot reject this request" });

    await pool.query(
      `UPDATE approval_requests
       SET status='rejected', decided_at=NOW(), decision_note=$1, updated_at=NOW()
       WHERE id=$2`,
      [decision_note, req.params.id]
    );

    const approver = await pool.query("SELECT name FROM users WHERE id=$1", [req.user.id]);
    await notify(ar.requester_id, "approval_rejected",
      `Your ${ar.type.replace(/_/g, " ")} request was declined`,
      `${approver.rows[0]?.name} declined: ${ar.subject}. Reason: ${decision_note}`,
      { request_id: ar.id, type: ar.type }
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/approvals-engine/:id/info — request more info
router.put("/:id/info", auth, async (req, res) => {
  const { decision_note } = req.body;
  try {
    const arRes = await pool.query("SELECT * FROM approval_requests WHERE id=$1", [req.params.id]);
    const ar = arRes.rows[0];
    if (!ar || ar.approver_id !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    await pool.query(
      "UPDATE approval_requests SET status='info_requested', decision_note=$1, updated_at=NOW() WHERE id=$2",
      [decision_note, req.params.id]
    );

    const approver = await pool.query("SELECT name FROM users WHERE id=$1", [req.user.id]);
    await notify(ar.requester_id, "approval_info_needed",
      `More information needed for your ${ar.type.replace(/_/g, " ")} request`,
      `${approver.rows[0]?.name} requests clarification: ${decision_note}`,
      { request_id: ar.id }
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/approvals-engine/:id/cancel
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const arRes = await pool.query("SELECT * FROM approval_requests WHERE id=$1", [req.params.id]);
    const ar = arRes.rows[0];
    if (!ar) return res.status(404).json({ message: "Not found" });
    if (ar.requester_id !== req.user.id)
      return res.status(403).json({ message: "Only requester can cancel" });
    if (!["pending","info_requested"].includes(ar.status))
      return res.status(400).json({ message: "Cannot cancel this request" });

    await pool.query(
      "UPDATE approval_requests SET status='cancelled', updated_at=NOW() WHERE id=$1",
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/approvals-engine/:id/escalate
router.post("/:id/escalate", auth, async (req, res) => {
  const { escalate_to } = req.body;
  try {
    const arRes = await pool.query("SELECT * FROM approval_requests WHERE id=$1", [req.params.id]);
    const ar = arRes.rows[0];
    if (!ar) return res.status(404).json({ message: "Not found" });

    await pool.query(
      `UPDATE approval_requests
       SET status='escalated', escalated_to=$1, escalated_at=NOW(), approver_id=$1, updated_at=NOW()
       WHERE id=$2`,
      [escalate_to, req.params.id]
    );

    const requester = await pool.query("SELECT name FROM users WHERE id=$1", [ar.requester_id]);
    await notify(escalate_to, "approval_escalated",
      `Approval escalated to you`,
      `${requester.rows[0]?.name}'s request has been escalated: ${ar.subject}`,
      { request_id: ar.id, type: ar.type }
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = { router, setIO };
