const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

// Capacity consumed per task type (%)
const TYPE_CAPACITY = { rfp: 60, upgrade: 35, normal: 15 };

// GET /api/workload?workspace_id=X
router.get("/", auth, async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });

  try {
    const ws = await pool.query("SELECT id FROM workspaces WHERE id=$1 AND user_id=$2", [workspace_id, req.user.id]);
    if (!ws.rows.length) return res.status(403).json({ message: "Access denied" });

    // Get all non-done tasks with assignee info
    const tasks = await pool.query(
      `SELECT t.*, u.name AS assignee_name, u.email AS assignee_email, u.max_capacity
       FROM tasks t
       LEFT JOIN users u ON t.assigned_user_id = u.id
       WHERE t.workspace_id = $1 AND t.status != 'done'
       ORDER BY t.assigned_user_id, t.created_at`,
      [workspace_id]
    );

    // Group by assignee
    const userMap = {};
    for (const task of tasks.rows) {
      const uid = task.assigned_user_id || "unassigned";
      if (!userMap[uid]) {
        userMap[uid] = {
          user_id:      uid,
          name:         task.assignee_name || "Unassigned",
          email:        task.assignee_email || "",
          max_capacity: task.max_capacity || 100,
          tasks:        [],
          used_capacity: 0,
        };
      }
      const cap = TYPE_CAPACITY[task.type] || 15;
      // Reduce capacity by progress (partially done = less load)
      const effectiveCap = Math.round(cap * (1 - (task.progress || 0) / 100));
      userMap[uid].tasks.push({ ...task, capacity_consumed: cap, effective_capacity: effectiveCap });
      userMap[uid].used_capacity += effectiveCap;
    }

    const result = Object.values(userMap).map((u) => ({
      ...u,
      load_percent: Math.min(Math.round((u.used_capacity / u.max_capacity) * 100), 100),
      status:
        u.load_percent >= 90 ? "overloaded"
        : u.load_percent >= 70 ? "moderate"
        : "available",
    }));

    // Re-compute status after load_percent is set
    result.forEach((u) => {
      u.status =
        u.load_percent >= 90 ? "overloaded"
        : u.load_percent >= 70 ? "moderate"
        : "available";
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/workload/users?workspace_id=X — list users searchable for assignment
router.get("/users", auth, async (req, res) => {
  const { workspace_id, q } = req.query;
  try {
    // Return all users except current, optionally filtered by name/email
    const result = await pool.query(
      `SELECT id, name, email FROM users
       WHERE ($1::text IS NULL OR name ILIKE $1 OR email ILIKE $1)
       ORDER BY name LIMIT 20`,
      [q ? `%${q}%` : null]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
