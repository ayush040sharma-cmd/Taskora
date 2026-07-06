/**
 * Task Comments Routes — Phase 8
 *
 * GET    /api/comments/:taskId   — list comments on a task
 * POST   /api/comments/:taskId   — add a comment
 * DELETE /api/comments/:id       — delete a comment (own only)
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");
const { validate, schemas } = require("../utils/validate");

async function canAccessTask(taskId, userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM tasks t
     WHERE t.id = $1
       AND (
         EXISTS (SELECT 1 FROM workspaces WHERE id = t.workspace_id AND user_id = $2)
         OR EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = t.workspace_id AND user_id = $2)
       )`,
    [taskId, userId]
  );
  return rows.length > 0;
}

// GET /api/comments/:taskId
router.get("/:taskId", auth, async (req, res) => {
  try {
    if (!(await canAccessTask(req.params.taskId, req.user.id))) {
      return res.status(404).json({ message: "Task not found" });
    }
    const result = await pool.query(
      `SELECT c.*, u.name AS author_name, u.email AS author_email
       FROM task_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.task_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.taskId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get comments error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/comments/:taskId
router.post("/:taskId", auth, validate(schemas.addComment), async (req, res) => {
  const { content } = req.body;

  try {
    if (!(await canAccessTask(req.params.taskId, req.user.id))) {
      return res.status(404).json({ message: "Task not found" });
    }

    const result = await pool.query(
      `INSERT INTO task_comments (task_id, user_id, content)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.taskId, req.user.id, content.trim()]
    );

    // Fetch with author info
    const full = await pool.query(
      `SELECT c.*, u.name AS author_name, u.email AS author_email
       FROM task_comments c JOIN users u ON u.id = c.user_id
       WHERE c.id = $1`,
      [result.rows[0].id]
    );
    res.status(201).json(full.rows[0]);
  } catch (err) {
    console.error("Post comment error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/comments/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const check = await pool.query(
      "SELECT id FROM task_comments WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id]
    );
    if (!check.rows.length) return res.status(403).json({ message: "Not your comment" });

    await pool.query("DELETE FROM task_comments WHERE id=$1", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
