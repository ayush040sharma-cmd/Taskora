/**
 * What-If Simulation Engine
 * POST /api/simulate/assign  — simulate assigning a task to a user
 * GET  /api/simulate/suggest/:wsId/:taskId — suggest best user for a task
 * GET  /api/audit?workspace_id — audit log for workspace
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");
const wl      = require("../services/workloadEngine");

// ── POST /api/simulate/assign ────────────────────────────────────────────────
// Body: { task_id, user_id, workspace_id, estimated_hours? }
router.post("/assign", auth, async (req, res) => {
  const { task_id, user_id, workspace_id, estimated_hours } = req.body;
  if (!task_id || !user_id || !workspace_id) {
    return res.status(400).json({ message: "task_id, user_id, workspace_id required" });
  }
  try {
    // Fetch task
    const taskR = await pool.query("SELECT * FROM tasks WHERE id=$1", [task_id]);
    if (!taskR.rows.length) return res.status(404).json({ message: "Task not found" });
    const task = { ...taskR.rows[0], estimated_hours: estimated_hours || taskR.rows[0].estimated_hours };

    // Fetch target user + capacity
    const userR = await pool.query(
      `SELECT u.*, uc.* FROM users u LEFT JOIN user_capacity uc ON uc.user_id=u.id WHERE u.id=$1`,
      [user_id]
    );
    if (!userR.rows.length) return res.status(404).json({ message: "User not found" });
    const user = userR.rows[0];

    // Fetch their active tasks
    const tasksR = await pool.query(
      `SELECT * FROM tasks WHERE assigned_user_id=$1 AND workspace_id=$2 AND status NOT IN ('done','pending_approval')`,
      [user_id, workspace_id]
    );
    const activeTasks = tasksR.rows;

    const result = wl.simulateAssignment(task, activeTasks, user);

    // Also provide future load prediction
    const after  = [...activeTasks, task];
    const prediction = wl.predictFutureLoad(after, user, 14);

    res.json({
      user: { id: user.id, name: user.name, role: user.role },
      task: { id: task.id, title: task.title, type: task.type, estimated_hours: task.estimated_hours || wl.getTaskHours(task.type).avg },
      simulation: result,
      prediction_after_assign: prediction,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/simulate/suggest/:wsId/:taskId ───────────────────────────────────
// Suggest best user(s) for a task based on availability + skills
router.get("/suggest/:wsId/:taskId", auth, async (req, res) => {
  const { wsId, taskId } = req.params;
  try {
    const taskR = await pool.query("SELECT * FROM tasks WHERE id=$1", [taskId]);
    if (!taskR.rows.length) return res.status(404).json({ message: "Task not found" });
    const task = taskR.rows[0];

    // All workspace members
    const membersR = await pool.query(
      `SELECT u.id, u.name, u.email, u.role,
              uc.daily_hours, uc.travel_mode, uc.travel_hours, uc.on_leave,
              uc.max_rfp, uc.max_proposals, uc.max_presentations, uc.max_upgrades
       FROM workspace_members wm
       JOIN users u ON u.id=wm.user_id
       LEFT JOIN user_capacity uc ON uc.user_id=u.id
       WHERE wm.workspace_id=$1`,
      [wsId]
    );

    const activeTasksR = await pool.query(
      `SELECT * FROM tasks WHERE workspace_id=$1 AND status NOT IN ('done','pending_approval') AND assigned_user_id IS NOT NULL`,
      [wsId]
    );
    const tasksByUser = {};
    activeTasksR.rows.forEach(t => {
      if (!tasksByUser[t.assigned_user_id]) tasksByUser[t.assigned_user_id] = [];
      tasksByUser[t.assigned_user_id].push(t);
    });

    const suggestions = membersR.rows
      .map(m => {
        const userTasks = tasksByUser[m.id] || [];
        const check     = wl.checkAssignment(task, userTasks, m);
        const summary   = wl.buildUserSummary(m, userTasks, m);
        return {
          user_id:    m.id,
          name:       m.name,
          email:      m.email,
          role:       m.role,
          feasible:   check.allowed,
          reason:     check.reason,
          message:    check.message,
          load_pct:   summary.load_percent,
          status:     summary.status,
          task_count: userTasks.length,
          next_available: check.nextAvailableDate,
        };
      })
      // Sort: feasible first, then by lowest load
      .sort((a, b) => {
        if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
        return (a.load_pct || 0) - (b.load_pct || 0);
      });

    res.json({ task: { id: task.id, title: task.title, type: task.type }, suggestions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
