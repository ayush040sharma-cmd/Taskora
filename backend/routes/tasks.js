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
    if (workspace.rows.length === 0) {
      return res.status(403).json({ message: "Access denied" });
    }

    const result = await pool.query(
      "SELECT * FROM tasks WHERE workspace_id = $1 ORDER BY position ASC, created_at ASC",
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
  const { title, description, status, priority, due_date, workspace_id } = req.body;

  if (!title || !workspace_id) {
    return res.status(400).json({ message: "Title and workspace_id are required" });
  }

  try {
    const workspace = await pool.query(
      "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
      [workspace_id, req.user.id]
    );
    if (workspace.rows.length === 0) {
      return res.status(403).json({ message: "Access denied" });
    }

    const maxPos = await pool.query(
      "SELECT COALESCE(MAX(position), 0) as max_pos FROM tasks WHERE workspace_id = $1 AND status = $2",
      [workspace_id, status || "todo"]
    );
    const position = parseInt(maxPos.rows[0].max_pos) + 1;

    const result = await pool.query(
      `INSERT INTO tasks (title, description, status, priority, due_date, workspace_id, assignee_id, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        title,
        description || null,
        status || "todo",
        priority || "medium",
        due_date || null,
        workspace_id,
        req.user.id,
        position,
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
  const { title, description, status, priority, due_date, position } = req.body;

  try {
    const taskCheck = await pool.query(
      `SELECT t.id FROM tasks t
       JOIN workspaces w ON t.workspace_id = w.id
       WHERE t.id = $1 AND w.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ message: "Task not found" });
    }

    const result = await pool.query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        priority = COALESCE($4, priority),
        due_date = COALESCE($5, due_date),
        position = COALESCE($6, position)
       WHERE id = $7 RETURNING *`,
      [title, description, status, priority, due_date, position, req.params.id]
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
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ message: "Task not found" });
    }

    await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
    res.json({ message: "Task deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
