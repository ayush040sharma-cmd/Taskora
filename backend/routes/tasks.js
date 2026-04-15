const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

// GET /api/tasks/workspace/:workspaceId
router.get("/workspace/:workspaceId", auth, async (req, res) => {
  try {
    const workspace = await pool.query(
      "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
      [req.params.workspaceId, req.user.id]
    );
    if (!workspace.rows.length) return res.status(403).json({ message: "Access denied" });

    const result = await pool.query(
      `SELECT t.*, u.name AS assignee_name, u.email AS assignee_email
       FROM tasks t
       LEFT JOIN users u ON t.assigned_user_id = u.id
       WHERE t.workspace_id = $1
       ORDER BY t.position ASC, t.created_at ASC`,
      [req.params.workspaceId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get tasks error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/tasks
router.post("/", auth, async (req, res) => {
  const {
    title, description, status, priority, due_date, start_date,
    workspace_id, type, estimated_days, progress, assigned_user_id, sprint_id
  } = req.body;

  if (!title || !workspace_id) {
    return res.status(400).json({ message: "Title and workspace_id are required" });
  }

  try {
    const workspace = await pool.query(
      "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
      [workspace_id, req.user.id]
    );
    if (!workspace.rows.length) return res.status(403).json({ message: "Access denied" });

    const maxPos = await pool.query(
      "SELECT COALESCE(MAX(position), 0) as max_pos FROM tasks WHERE workspace_id = $1 AND status = $2",
      [workspace_id, status || "todo"]
    );
    const position = parseInt(maxPos.rows[0].max_pos) + 1;

    const result = await pool.query(
      `INSERT INTO tasks (
        title, description, status, priority, due_date, start_date,
        workspace_id, assignee_id, assigned_user_id, position,
        type, estimated_days, progress, sprint_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        title,
        description || null,
        status || "todo",
        priority || "medium",
        due_date || null,
        start_date || null,
        workspace_id,
        assigned_user_id || req.user.id,
        assigned_user_id || req.user.id,
        position,
        type || "normal",
        estimated_days || 3,
        progress || 0,
        sprint_id || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/tasks/:id
router.put("/:id", auth, async (req, res) => {
  const {
    title, description, status, priority, due_date, start_date,
    position, progress, type, estimated_days, assigned_user_id, sprint_id
  } = req.body;

  try {
    const taskCheck = await pool.query(
      `SELECT t.id, t.status FROM tasks t
       JOIN workspaces w ON t.workspace_id = w.id
       WHERE t.id = $1 AND w.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!taskCheck.rows.length) return res.status(404).json({ message: "Task not found" });

    // Set completed_at when moving to done
    const prevStatus = taskCheck.rows[0].status;
    const completedAt =
      status === "done" && prevStatus !== "done" ? new Date() :
      status && status !== "done" ? null :
      undefined; // undefined = don't change

    const result = await pool.query(
      `UPDATE tasks SET
        title            = COALESCE($1,  title),
        description      = COALESCE($2,  description),
        status           = COALESCE($3,  status),
        priority         = COALESCE($4,  priority),
        due_date         = COALESCE($5,  due_date),
        start_date       = COALESCE($6,  start_date),
        position         = COALESCE($7,  position),
        progress         = COALESCE($8,  progress),
        type             = COALESCE($9,  type),
        estimated_days   = COALESCE($10, estimated_days),
        assigned_user_id = COALESCE($11, assigned_user_id),
        sprint_id        = COALESCE($12, sprint_id),
        completed_at     = CASE
          WHEN $13::boolean IS TRUE  THEN NOW()
          WHEN $14::boolean IS TRUE  THEN NULL
          ELSE completed_at
        END
       WHERE id = $15 RETURNING *`,
      [
        title, description, status, priority, due_date, start_date,
        position, progress, type, estimated_days, assigned_user_id,
        sprint_id,
        status === "done" && prevStatus !== "done",   // $13 set now
        status && status !== "done" && prevStatus === "done", // $14 clear
        req.params.id,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update task error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/tasks/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const taskCheck = await pool.query(
      `SELECT t.id FROM tasks t
       JOIN workspaces w ON t.workspace_id = w.id
       WHERE t.id = $1 AND w.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!taskCheck.rows.length) return res.status(404).json({ message: "Task not found" });

    await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
    res.json({ message: "Task deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
