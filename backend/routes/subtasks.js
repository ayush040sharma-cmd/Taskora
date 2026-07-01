/**
 * Subtasks Routes
 * GET    /api/subtasks/:taskId       — list subtasks for a task
 * POST   /api/subtasks/:taskId       — add a subtask
 * PUT    /api/subtasks/:id           — update title / done state
 * PATCH  /api/subtasks/:id/toggle    — toggle done
 * DELETE /api/subtasks/:id           — delete subtask
 * PUT    /api/subtasks/:taskId/reorder — bulk reorder
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");
const { notifyOne } = require("../services/notificationService");

// ── GET /api/subtasks/:taskId ─────────────────────────────────
router.get("/:taskId", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, u.name AS created_by_name
       FROM subtasks s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.task_id = $1
       ORDER BY s.position ASC, s.created_at ASC`,
      [req.params.taskId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/subtasks/:taskId ────────────────────────────────
router.post("/:taskId", auth, async (req, res) => {
  const { title, assigned_to, due_date, priority } = req.body;
  if (!title?.trim()) return res.status(400).json({ message: "Title required" });

  try {
    const posRes = await pool.query(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM subtasks WHERE task_id = $1",
      [req.params.taskId]
    );
    const position = posRes.rows[0].next_pos;

    const { rows } = await pool.query(
      `INSERT INTO subtasks (task_id, title, done, position, created_by)
       VALUES ($1, $2, FALSE, $3, $4) RETURNING *`,
      [req.params.taskId, title.trim(), position, req.user.id]
    );
    const subtask = rows[0];

    // Determine who to notify: explicit assigned_to, else parent task's assignee
    const parentRes = await pool.query(
      `SELECT t.title AS parent_title, t.assigned_user_id, w.id AS workspace_id,
              u.name AS creator_name
       FROM tasks t
       LEFT JOIN workspaces w ON w.id = t.workspace_id
       LEFT JOIN users u ON u.id = $2
       WHERE t.id = $1`,
      [req.params.taskId, req.user.id]
    );
    const parent = parentRes.rows[0];
    const notifyUserId = assigned_to || parent?.assigned_user_id;

    if (notifyUserId && String(notifyUserId) !== String(req.user.id)) {
      const dueStr = due_date ? new Date(due_date).toLocaleDateString("en-US", { month:"short", day:"numeric" }) : null;
      await notifyOne(
        notifyUserId,
        "subtask_assigned",
        `${parent?.creator_name || "Manager"} added a new subtask`,
        [
          `Task: ${parent?.parent_title || "Unknown"}`,
          `Subtask: ${title.trim()}`,
          dueStr ? `Due: ${dueStr}` : null,
          priority ? `Priority: ${priority}` : null,
        ].filter(Boolean).join("\n"),
        {
          task_id: parseInt(req.params.taskId),
          subtask_id: subtask.id,
          subtask_title: title.trim(),
          parent_title: parent?.parent_title,
          assigned_to: notifyUserId,
          workspace_id: parent?.workspace_id,
        }
      );
    }

    // Broadcast task update so all dashboards refresh in real-time
    if (parent?.workspace_id) {
      const io = req.app.get("io");
      if (io) io.to(`workspace:${parent.workspace_id}`).emit("task:updated", { id: parseInt(req.params.taskId) });
    }

    res.status(201).json({ ...subtask, assigned_to: notifyUserId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/subtasks/:id ────────────────────────────────────
router.put("/:id", auth, async (req, res) => {
  const { title, done } = req.body;
  try {
    const sets = [];
    const vals = [];
    if (title !== undefined) { vals.push(title.trim()); sets.push(`title = $${vals.length}`); }
    if (done  !== undefined) { vals.push(Boolean(done)); sets.push(`done = $${vals.length}`); }
    if (!sets.length) return res.status(400).json({ message: "Nothing to update" });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE subtasks SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PATCH /api/subtasks/:id/toggle ───────────────────────────
router.patch("/:id/toggle", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE subtasks SET done = NOT done WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE /api/subtasks/:id ─────────────────────────────────
router.delete("/:id", auth, async (req, res) => {
  try {
    await pool.query("DELETE FROM subtasks WHERE id = $1", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/subtasks/:taskId/reorder ────────────────────────
// Body: { order: [id1, id2, id3, ...] }
router.put("/:taskId/reorder", auth, async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ message: "order array required" });
  try {
    await Promise.all(
      order.map((id, idx) =>
        pool.query("UPDATE subtasks SET position = $1 WHERE id = $2 AND task_id = $3", [idx, id, req.params.taskId])
      )
    );
    res.json({ message: "Reordered" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
