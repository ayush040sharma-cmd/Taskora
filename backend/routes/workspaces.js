const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

// GET /api/workspaces
router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM workspaces WHERE user_id = $1 ORDER BY created_at ASC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get workspaces error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/workspaces
router.post("/", auth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: "Workspace name is required" });

  try {
    const result = await pool.query(
      "INSERT INTO workspaces (name, user_id) VALUES ($1, $2) RETURNING *",
      [name, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create workspace error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/workspaces/:id/summary
router.get("/:id/summary", auth, async (req, res) => {
  const wsId = req.params.id;
  try {
    // Verify ownership
    const ws = await pool.query(
      "SELECT id, name FROM workspaces WHERE id = $1 AND user_id = $2",
      [wsId, req.user.id]
    );
    if (ws.rows.length === 0) return res.status(404).json({ message: "Workspace not found" });

    const [stats, statusBreakdown, priorityBreakdown, typeBreakdown, recentActivity, dueSoon] =
      await Promise.all([
        // Week stats
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS created_this_week,
            COUNT(*) FILTER (WHERE completed_at >= NOW() - INTERVAL '7 days') AS completed_this_week,
            COUNT(*) FILTER (WHERE status != 'done') AS active_tasks,
            COUNT(*) AS total_tasks
          FROM tasks WHERE workspace_id = $1
        `, [wsId]),

        // Status breakdown
        pool.query(`
          SELECT status, COUNT(*) AS count
          FROM tasks WHERE workspace_id = $1
          GROUP BY status
        `, [wsId]),

        // Priority breakdown
        pool.query(`
          SELECT priority, COUNT(*) AS count
          FROM tasks WHERE workspace_id = $1
          GROUP BY priority ORDER BY count DESC
        `, [wsId]),

        // Type breakdown
        pool.query(`
          SELECT type, COUNT(*) AS count
          FROM tasks WHERE workspace_id = $1
          GROUP BY type ORDER BY count DESC
        `, [wsId]),

        // Recent activity — last 10 events (created or completed)
        pool.query(`
          SELECT * FROM (
            SELECT id, title, 'created' AS event, created_at AS event_time,
                   priority, status, type
            FROM tasks WHERE workspace_id = $1 AND created_at IS NOT NULL
            UNION ALL
            SELECT id, title, 'completed' AS event, completed_at AS event_time,
                   priority, status, type
            FROM tasks WHERE workspace_id = $1 AND completed_at IS NOT NULL
          ) ev
          ORDER BY event_time DESC LIMIT 10
        `, [wsId]),

        // Due soon (next 7 days, not done)
        pool.query(`
          SELECT COUNT(*) AS count FROM tasks
          WHERE workspace_id = $1
            AND status != 'done'
            AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        `, [wsId]),
      ]);

    res.json({
      workspace: ws.rows[0],
      stats: {
        ...stats.rows[0],
        due_soon: parseInt(dueSoon.rows[0].count),
      },
      status_breakdown: statusBreakdown.rows,
      priority_breakdown: priorityBreakdown.rows,
      type_breakdown: typeBreakdown.rows,
      recent_activity: recentActivity.rows,
    });
  } catch (err) {
    console.error("Summary error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/workspaces/:id — rename workspace
router.put("/:id", auth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "Name is required" });
  try {
    const result = await pool.query(
      "UPDATE workspaces SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
      [name.trim(), req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Workspace not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/workspaces/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const check = await pool.query(
      "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    await pool.query("DELETE FROM workspaces WHERE id = $1", [req.params.id]);
    res.json({ message: "Workspace deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
