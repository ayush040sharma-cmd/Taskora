/**
 * Approval Workflow Routes
 * POST /api/approvals              — super_boss creates approval request
 * GET  /api/approvals?workspace_id — list approvals (filterable by status)
 * PUT  /api/approvals/:id/approve  — approver approves → task activates
 * PUT  /api/approvals/:id/reject   — approver rejects
 * GET  /api/approvals/pending      — my pending approvals to action
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");
const { notifyOne } = require("../services/notificationService");
const { audit }     = require("../services/auditService");

// ── POST /api/approvals ──────────────────────────────────────────────────────
// Super Boss requests approval for assigning a task to a user
router.post("/", auth, async (req, res) => {
  const { task_id, assigned_to, approver_id, justification, workspace_id } = req.body;
  if (!task_id || !assigned_to || !approver_id || !workspace_id) {
    return res.status(400).json({ message: "task_id, assigned_to, approver_id, workspace_id are required" });
  }
  try {
    // Mark task as pending_approval
    await pool.query(
      "UPDATE tasks SET status='pending_approval', assigned_user_id=$1 WHERE id=$2",
      [assigned_to, task_id]
    );

    const r = await pool.query(
      `INSERT INTO approvals (task_id, workspace_id, requested_by, assigned_to, approver_id, justification)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [task_id, workspace_id, req.user.id, assigned_to, approver_id, justification || null]
    );
    const approval = r.rows[0];

    // Get task title for notification
    const taskR = await pool.query("SELECT title FROM tasks WHERE id=$1", [task_id]);
    const taskTitle = taskR.rows[0]?.title || "a task";

    // Notify approver
    await notifyOne(
      approver_id,
      "approval_pending",
      "Approval required",
      `${req.user.name} wants to assign "${taskTitle}" and needs your approval.`,
      { approval_id: approval.id, task_id, task_title: taskTitle }
    );

    await audit({
      workspace_id, actor_id: req.user.id,
      action: "approval_requested", target_type: "task", target_id: task_id,
      meta: { approval_id: approval.id, assigned_to, approver_id },
    });

    res.status(201).json(approval);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/approvals?workspace_id&status ────────────────────────────────────
router.get("/", auth, async (req, res) => {
  const { workspace_id, status } = req.query;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });
  try {
    const conditions = ["a.workspace_id = $1"];
    const params     = [workspace_id];
    if (status) { params.push(status); conditions.push(`a.status = $${params.length}`); }

    const r = await pool.query(
      `SELECT a.*,
              t.title AS task_title, t.type AS task_type, t.priority,
              req.name AS requested_by_name,
              asgn.name AS assigned_to_name,
              appr.name AS approver_name
       FROM approvals a
       JOIN tasks t ON t.id = a.task_id
       JOIN users req  ON req.id  = a.requested_by
       JOIN users asgn ON asgn.id = a.assigned_to
       JOIN users appr ON appr.id = a.approver_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY a.requested_at DESC`,
      params
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/approvals/pending ────────────────────────────────────────────────
// Items I need to approve
router.get("/pending", auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT a.*,
              t.title AS task_title, t.type AS task_type, t.priority,
              req.name AS requested_by_name,
              asgn.name AS assigned_to_name
       FROM approvals a
       JOIN tasks t ON t.id = a.task_id
       JOIN users req  ON req.id  = a.requested_by
       JOIN users asgn ON asgn.id = a.assigned_to
       WHERE a.approver_id = $1 AND a.status = 'pending'
       ORDER BY a.requested_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/approvals/:id/approve ────────────────────────────────────────────
router.put("/:id/approve", auth, async (req, res) => {
  const { id } = req.params;
  try {
    const appr = await pool.query("SELECT * FROM approvals WHERE id=$1", [id]);
    if (!appr.rows.length) return res.status(404).json({ message: "Approval not found" });
    const a = appr.rows[0];

    if (a.approver_id !== req.user.id) {
      return res.status(403).json({ message: "Only the designated approver can approve this request" });
    }
    if (a.status !== "pending") {
      return res.status(400).json({ message: `Already ${a.status}` });
    }

    // Activate the task (move from pending_approval → todo)
    await pool.query(
      "UPDATE tasks SET status='todo' WHERE id=$1 AND status='pending_approval'",
      [a.task_id]
    );
    const updated = await pool.query(
      "UPDATE approvals SET status='approved', resolved_at=NOW() WHERE id=$1 RETURNING *",
      [id]
    );

    // Get task title
    const taskR = await pool.query("SELECT title FROM tasks WHERE id=$1", [a.task_id]);
    const taskTitle = taskR.rows[0]?.title || "a task";

    // Notify requester + assignee
    await notifyOne(a.requested_by, "approval_resolved", "Approval granted",
      `"${taskTitle}" has been approved and is now active.`, { approval_id: a.id });
    if (a.assigned_to !== a.requested_by) {
      await notifyOne(a.assigned_to, "task_assigned", "New task assigned",
        `"${taskTitle}" has been assigned to you.`, { task_id: a.task_id });
    }

    await audit({
      workspace_id: a.workspace_id, actor_id: req.user.id,
      action: "approval_approved", target_type: "task", target_id: a.task_id,
      meta: { approval_id: a.id },
    });

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/approvals/:id/reject ─────────────────────────────────────────────
router.put("/:id/reject", auth, async (req, res) => {
  const { id } = req.params;
  const { rejection_reason } = req.body;
  try {
    const appr = await pool.query("SELECT * FROM approvals WHERE id=$1", [id]);
    if (!appr.rows.length) return res.status(404).json({ message: "Approval not found" });
    const a = appr.rows[0];

    if (a.approver_id !== req.user.id) {
      return res.status(403).json({ message: "Only the designated approver can reject this request" });
    }
    if (a.status !== "pending") return res.status(400).json({ message: `Already ${a.status}` });

    // Revert task to unassigned todo
    await pool.query(
      "UPDATE tasks SET status='todo', assigned_user_id=NULL WHERE id=$1 AND status='pending_approval'",
      [a.task_id]
    );
    const updated = await pool.query(
      "UPDATE approvals SET status='rejected', rejection_reason=$1, resolved_at=NOW() WHERE id=$2 RETURNING *",
      [rejection_reason || null, id]
    );

    const taskR = await pool.query("SELECT title FROM tasks WHERE id=$1", [a.task_id]);
    const taskTitle = taskR.rows[0]?.title || "a task";

    await notifyOne(a.requested_by, "approval_resolved", "Approval rejected",
      `Assignment of "${taskTitle}" was rejected. ${rejection_reason || ""}`,
      { approval_id: a.id, rejected: true });

    await audit({
      workspace_id: a.workspace_id, actor_id: req.user.id,
      action: "approval_rejected", target_type: "task", target_id: a.task_id,
      meta: { approval_id: a.id, reason: rejection_reason },
    });

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
