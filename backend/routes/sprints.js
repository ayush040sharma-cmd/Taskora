const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

// GET /api/sprints?workspace_id=X
router.get("/", auth, async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });
  try {
    const ws = await pool.query("SELECT id FROM workspaces WHERE id=$1 AND user_id=$2", [workspace_id, req.user.id]);
    if (!ws.rows.length) return res.status(403).json({ message: "Access denied" });

    const result = await pool.query(
      `SELECT s.*,
        COUNT(t.id) FILTER (WHERE t.sprint_id = s.id) AS total_tasks,
        COUNT(t.id) FILTER (WHERE t.sprint_id = s.id AND t.status = 'done') AS completed_tasks
       FROM sprints s
       LEFT JOIN tasks t ON t.sprint_id = s.id
       WHERE s.workspace_id = $1
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [workspace_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/sprints
router.post("/", auth, async (req, res) => {
  const { name, goal, start_date, end_date, workspace_id } = req.body;
  if (!name || !start_date || !end_date || !workspace_id) {
    return res.status(400).json({ message: "name, start_date, end_date, workspace_id required" });
  }
  try {
    const ws = await pool.query("SELECT id FROM workspaces WHERE id=$1 AND user_id=$2", [workspace_id, req.user.id]);
    if (!ws.rows.length) return res.status(403).json({ message: "Access denied" });

    const result = await pool.query(
      "INSERT INTO sprints (name, goal, start_date, end_date, workspace_id) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [name, goal || null, start_date, end_date, workspace_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/sprints/:id  (update status, name, etc.)
router.put("/:id", auth, async (req, res) => {
  const { name, goal, start_date, end_date, status } = req.body;
  try {
    const check = await pool.query(
      "SELECT s.id FROM sprints s JOIN workspaces w ON s.workspace_id=w.id WHERE s.id=$1 AND w.user_id=$2",
      [req.params.id, req.user.id]
    );
    if (!check.rows.length) return res.status(404).json({ message: "Sprint not found" });

    const result = await pool.query(
      `UPDATE sprints SET
        name       = COALESCE($1, name),
        goal       = COALESCE($2, goal),
        start_date = COALESCE($3, start_date),
        end_date   = COALESCE($4, end_date),
        status     = COALESCE($5, status)
       WHERE id=$6 RETURNING *`,
      [name, goal, start_date, end_date, status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/sprints/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const check = await pool.query(
      "SELECT s.id FROM sprints s JOIN workspaces w ON s.workspace_id=w.id WHERE s.id=$1 AND w.user_id=$2",
      [req.params.id, req.user.id]
    );
    if (!check.rows.length) return res.status(404).json({ message: "Sprint not found" });
    // Unlink tasks
    await pool.query("UPDATE tasks SET sprint_id=NULL WHERE sprint_id=$1", [req.params.id]);
    await pool.query("DELETE FROM sprints WHERE id=$1", [req.params.id]);
    res.json({ message: "Sprint deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/sprints/:id/burndown  — daily remaining task count
router.get("/:id/burndown", auth, async (req, res) => {
  try {
    const sprint = await pool.query(
      "SELECT s.* FROM sprints s JOIN workspaces w ON s.workspace_id=w.id WHERE s.id=$1 AND w.user_id=$2",
      [req.params.id, req.user.id]
    );
    if (!sprint.rows.length) return res.status(404).json({ message: "Sprint not found" });
    const s = sprint.rows[0];

    const tasks = await pool.query(
      "SELECT id, status, completed_at FROM tasks WHERE sprint_id=$1",
      [req.params.id]
    );

    const start = new Date(s.start_date);
    const end   = new Date(s.end_date);
    const total = tasks.rows.length;

    // Build day-by-day remaining
    const data = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split("T")[0];
      const done = tasks.rows.filter(
        (t) => t.completed_at && t.completed_at.toISOString().split("T")[0] <= dayStr
      ).length;
      data.push({ date: dayStr, remaining: total - done, ideal: null });
    }

    // Add ideal line values
    const days = data.length;
    data.forEach((d, i) => {
      d.ideal = Math.round(total - (total / Math.max(days - 1, 1)) * i);
    });

    res.json({ sprint: s, total, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
