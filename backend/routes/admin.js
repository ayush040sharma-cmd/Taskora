const express  = require("express");
const router   = express.Router();
const crypto   = require("crypto");
const pool     = require("../db");
const adminAuth = require("../middleware/adminAuth");
const { sendPasswordReset } = require("../services/emailService");

// All routes require manager role
router.use(adminAuth);

// GET /api/admin/stats
router.get("/stats", async (req, res) => {
  try {
    const [users, boards, tasks, active] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS c FROM users"),
      pool.query("SELECT COUNT(*)::int AS c FROM workspaces"),
      pool.query("SELECT COUNT(*)::int AS c FROM tasks"),
      pool.query("SELECT COUNT(*)::int AS c FROM users WHERE last_login_at > NOW() - INTERVAL '24 hours'"),
    ]);
    res.json({
      total_users:  users.rows[0].c,
      total_boards: boards.rows[0].c,
      total_tasks:  tasks.rows[0].c,
      active_today: active.rows[0].c,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/admin/users
router.get("/users", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.name, u.email, u.role, u.last_login_at AS last_active, u.created_at,
        COALESCE(t.cnt, 0) AS tasks_count,
        CASE WHEN u.suspended THEN 'suspended' ELSE 'active' END AS status
      FROM users u
      LEFT JOIN (
        SELECT assigned_user_id, COUNT(*)::int AS cnt FROM tasks GROUP BY assigned_user_id
      ) t ON t.assigned_user_id = u.id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch {
    // Fallback without suspended column if it doesn't exist
    try {
      const { rows } = await pool.query(`
        SELECT u.id, u.name, u.email, u.role, u.last_login_at AS last_active, u.created_at,
          COALESCE(t.cnt, 0) AS tasks_count, 'active' AS status
        FROM users u
        LEFT JOIN (SELECT assigned_user_id, COUNT(*)::int AS cnt FROM tasks GROUP BY assigned_user_id) t
          ON t.assigned_user_id = u.id
        ORDER BY u.created_at DESC
      `);
      res.json(rows);
    } catch (err2) {
      res.status(500).json({ message: "Server error" });
    }
  }
});

// PUT /api/admin/users/:id
router.put("/users/:id", async (req, res) => {
  const { role, suspended } = req.body;
  try {
    if (role !== undefined) {
      await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, req.params.id]);
    }
    if (suspended !== undefined) {
      // Try to update suspended column; ignore if column doesn't exist
      try {
        await pool.query("UPDATE users SET suspended = $1 WHERE id = $2", [suspended, req.params.id]);
      } catch { /* column may not exist */ }
    }
    res.json({ message: "Updated" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/admin/users/:id/reset-password
// Sends the user a password-reset email via the same token flow as
// self-service forgot-password (routes/auth.js), rather than generating a
// password and returning it in the response -- the admin triggers the
// reset but never actually sees the user's new credential in plaintext.
router.post("/users/:id/reset-password", async (req, res) => {
  try {
    const userR = await pool.query("SELECT id, email, name FROM users WHERE id = $1", [req.params.id]);
    const user = userR.rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    const token  = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await pool.query(
      "UPDATE users SET reset_token=$1, reset_token_expiry=$2 WHERE id=$3",
      [token, expiry, user.id]
    );

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetLink    = `${frontendUrl}/reset-password?token=${token}`;
    await sendPasswordReset({ toEmail: user.email, userName: user.name, resetLink });

    res.json({ message: `Password reset link sent to ${user.email}` });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/admin/boards
router.get("/boards", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT w.id, w.name, w.user_id, w.created_at,
        u.name AS owner_name,
        (SELECT COUNT(*)::int FROM tasks WHERE workspace_id = w.id) AS task_count
      FROM workspaces w
      JOIN users u ON w.user_id = u.id
      ORDER BY w.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/admin/boards/:id/tasks
router.get("/boards/:id/tasks", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, u.name AS assignee_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.workspace_id = $1
      ORDER BY t.created_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/admin/boards/:id
router.delete("/boards/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM workspaces WHERE id = $1", [req.params.id]);
    res.json({ message: "Board deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/admin/notifications (mock — no real delivery yet)
router.post("/notifications", async (req, res) => {
  res.json({ success: true, message: "Notification queued" });
});

module.exports = router;
