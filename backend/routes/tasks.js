const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const { refreshUserWorkloadLog } = require("../services/workloadLogger");
const { audit } = require("../services/auditService");
const { validate, schemas } = require("../utils/validate");

// GET /api/tasks/workspace/:workspaceId
router.get("/workspace/:workspaceId", auth, async (req, res) => {
  try {
    // Allow workspace owners AND members to view tasks
    const ownerCheck = await pool.query(
      "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
      [req.params.workspaceId, req.user.id]
    );
    const memberCheck = await pool.query(
      "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
      [req.params.workspaceId, req.user.id]
    );
    if (!ownerCheck.rows.length && !memberCheck.rows.length) {
      return res.status(403).json({ message: "Access denied" });
    }

    const result = await pool.query(
      `SELECT t.*,
              u.name  AS assignee_name,
              u.email AS assignee_email,
              uc.daily_hours         AS assignee_capacity,
              uc.on_leave            AS assignee_on_leave,
              uc.travel_mode         AS assignee_travel_mode,
              (SELECT COUNT(*) FROM task_dependencies td
               JOIN tasks dep ON td.depends_on_task_id = dep.id
               WHERE td.task_id = t.id AND dep.status != 'done')::int AS blocking_dep_count,
              (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id)::int AS comment_count
       FROM tasks t
       LEFT JOIN users u   ON t.assigned_user_id = u.id
       LEFT JOIN user_capacity uc ON u.id = uc.user_id
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

// GET /api/tasks/:id  — single task with comment count
router.get("/:id", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*,
              u.name  AS assignee_name,
              u.email AS assignee_email,
              (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id)::int AS comment_count
       FROM tasks t
       LEFT JOIN users u ON t.assigned_user_id = u.id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Task not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get single task error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/tasks
router.post("/", auth, validate(schemas.createTask), async (req, res) => {
  const {
    title, description, status, priority, due_date, start_date,
    workspace_id, type, estimated_days, progress, assigned_user_id, sprint_id,
    estimated_duration, final_duration, recurrence,
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
        workspace_id, assigned_user_id, position,
        type, estimated_days, progress, sprint_id,
        estimated_hours, actual_hours, recurrence
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        title,
        description || null,
        status || "todo",
        priority || "medium",
        due_date || null,
        start_date || null,
        workspace_id,
        assigned_user_id || null,
        position,
        type || "task",
        estimated_days || 1,
        progress || 0,
        sprint_id || null,
        (estimated_duration || estimated_days || 1) * 8,  // convert days to hours
        (final_duration || estimated_days || 1) * 8,
        recurrence || null,
      ]
    );
    const task = result.rows[0];

    // Emit real-time event to workspace room
    const io = req.app.get("io");
    if (io) io.to(`workspace:${workspace_id}`).emit("task:created", task);

    // Refresh workload log for assignee (non-blocking)
    if (assigned_user_id) {
      refreshUserWorkloadLog(assigned_user_id, workspace_id).catch(() => {});
    }

    // Audit
    audit({ workspace_id, actor_id: req.user.id, action: "task_created", target_type: "task", target_id: task.id, meta: { task_title: task.title, status: task.status, priority: task.priority } }).catch(() => {});

    res.status(201).json(task);
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/tasks/:id
router.put("/:id", auth, validate(schemas.updateTask), async (req, res) => {
  const {
    title, description, status, priority, due_date, start_date,
    position, progress, type, estimated_days, assigned_user_id, sprint_id,
    estimated_duration, final_duration,
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
        estimated_duration = COALESCE($16, estimated_duration),
        final_duration     = COALESCE($17, final_duration),
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
        status === "done" && prevStatus !== "done",        // $13 set now
        status && status !== "done" && prevStatus === "done", // $14 clear
        req.params.id,                                     // $15
        estimated_duration || null,                        // $16
        final_duration      || null,                       // $17
      ]
    );
    const updated = result.rows[0];

    // Emit real-time event to workspace room
    const io = req.app.get("io");
    if (io) io.to(`workspace:${updated.workspace_id}`).emit("task:updated", updated);

    // Refresh workload log for assignee (non-blocking)
    if (updated.assigned_user_id) {
      refreshUserWorkloadLog(updated.assigned_user_id, updated.workspace_id).catch(() => {});
    }

    // Audit — only log meaningful changes, skip pure position reorders
    if (status && status !== prevStatus) {
      const action = status === "done" ? "task_completed" : "task_moved";
      audit({ workspace_id: updated.workspace_id, actor_id: req.user.id, action, target_type: "task", target_id: updated.id, meta: { task_title: updated.title, from: prevStatus, to: status } }).catch(() => {});
    } else if (assigned_user_id && assigned_user_id !== taskCheck.rows[0].assigned_user_id) {
      audit({ workspace_id: updated.workspace_id, actor_id: req.user.id, action: "task_assigned", target_type: "task", target_id: updated.id, meta: { task_title: updated.title } }).catch(() => {});
    } else if (title && title !== taskCheck.rows[0].title) {
      audit({ workspace_id: updated.workspace_id, actor_id: req.user.id, action: "task_renamed", target_type: "task", target_id: updated.id, meta: { task_title: title } }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    console.error("Update task error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/tasks/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const taskCheck = await pool.query(
      `SELECT t.id, t.title, t.workspace_id, t.assigned_user_id FROM tasks t
       JOIN workspaces w ON t.workspace_id = w.id
       WHERE t.id = $1 AND w.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!taskCheck.rows.length) return res.status(404).json({ message: "Task not found" });

    const { workspace_id, assigned_user_id, title: taskTitle } = taskCheck.rows[0];

    await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);

    // Emit real-time event to workspace room
    const io = req.app.get("io");
    if (io) io.to(`workspace:${workspace_id}`).emit("task:deleted", { id: parseInt(req.params.id), workspace_id });

    // Refresh workload log for the previously assigned user (non-blocking)
    if (assigned_user_id) {
      refreshUserWorkloadLog(assigned_user_id, workspace_id).catch(() => {});
    }

    // Audit
    audit({ workspace_id, actor_id: req.user.id, action: "task_deleted", target_type: "task", target_id: parseInt(req.params.id), meta: { task_title: taskTitle || "Untitled" } }).catch(() => {});

    res.json({ message: "Task deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/tasks/workspace/:workspaceId/graph ───────────────────────────────
// Returns nodes (tasks) + edges (dependencies) for dependency visualization
router.get("/workspace/:workspaceId/graph", auth, async (req, res) => {
  try {
    const workspace = await pool.query(
      "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
      [req.params.workspaceId, req.user.id]
    );
    if (!workspace.rows.length) return res.status(403).json({ message: "Access denied" });

    const [tasksRow, depsRow] = await Promise.all([
      pool.query(
        `SELECT t.id, t.title, t.status, t.priority, t.risk_score,
                t.assigned_user_id, u.name AS assignee_name,
                t.due_date, t.progress
         FROM tasks t
         LEFT JOIN users u ON t.assigned_user_id = u.id
         WHERE t.workspace_id = $1`,
        [req.params.workspaceId]
      ),
      pool.query(
        `SELECT td.task_id, td.depends_on_task_id
         FROM task_dependencies td
         JOIN tasks t1 ON td.task_id = t1.id
         JOIN tasks t2 ON td.depends_on_task_id = t2.id
         WHERE t1.workspace_id = $1`,
        [req.params.workspaceId]
      ),
    ]);

    res.json({
      nodes: tasksRow.rows,
      edges: depsRow.rows.map(r => ({ from: r.depends_on_task_id, to: r.task_id })),
    });
  } catch (err) {
    console.error("Graph endpoint error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/tasks/:id/dependencies ─────────────────────────────────────────
router.post("/:id/dependencies", auth, async (req, res) => {
  const { depends_on_task_id } = req.body;
  if (!depends_on_task_id) return res.status(400).json({ message: "depends_on_task_id required" });
  if (parseInt(depends_on_task_id) === parseInt(req.params.id)) {
    return res.status(400).json({ message: "A task cannot depend on itself" });
  }
  try {
    await pool.query(
      `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.params.id, depends_on_task_id]
    );
    res.json({ message: "Dependency added" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE /api/tasks/:id/dependencies/:depId ─────────────────────────────────
router.delete("/:id/dependencies/:depId", auth, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM task_dependencies WHERE task_id=$1 AND depends_on_task_id=$2",
      [req.params.id, req.params.depId]
    );
    res.json({ message: "Dependency removed" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/tasks/workspace/:workspaceId/collaboration ───────────────────────
// Collaboration scores: who works together most (shared task assignments, comments)
router.get("/workspace/:workspaceId/collaboration", auth, async (req, res) => {
  try {
    const workspace = await pool.query(
      "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
      [req.params.workspaceId, req.user.id]
    );
    if (!workspace.rows.length) return res.status(403).json({ message: "Access denied" });

    // Member activity: tasks assigned, tasks completed, comments made
    const activityRow = await pool.query(
      `SELECT
         u.id, u.name,
         COUNT(DISTINCT t.id)                                                    AS tasks_assigned,
         COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'done')                  AS tasks_completed,
         COUNT(DISTINCT c.id)                                                    AS comments_made,
         ROUND(AVG(t.progress) FILTER (WHERE t.status != 'done'))::int          AS avg_progress,
         COUNT(DISTINCT t.id) FILTER (WHERE t.risk_score >= 50)                 AS at_risk_tasks,
         uc.daily_hours, uc.on_leave, uc.travel_mode
       FROM users u
       LEFT JOIN tasks t         ON t.assigned_user_id = u.id AND t.workspace_id = $1
       LEFT JOIN task_comments c ON c.user_id = u.id AND c.task_id IN (
         SELECT id FROM tasks WHERE workspace_id = $1
       )
       LEFT JOIN user_capacity uc ON uc.user_id = u.id
       WHERE u.id IN (
         SELECT DISTINCT assigned_user_id FROM tasks WHERE workspace_id = $1 AND assigned_user_id IS NOT NULL
       )
         AND u.role != 'manager'
       GROUP BY u.id, u.name, uc.daily_hours, uc.on_leave, uc.travel_mode`,
      [req.params.workspaceId]
    );

    // Compute collaboration score per member (0-100)
    const members = activityRow.rows.map(m => {
      const tasksScore     = Math.min(40, (parseInt(m.tasks_assigned) || 0) * 4);
      const completionScore = parseInt(m.tasks_assigned) > 0
        ? Math.round((parseInt(m.tasks_completed) / parseInt(m.tasks_assigned)) * 30)
        : 0;
      const commentScore   = Math.min(20, (parseInt(m.comments_made) || 0) * 2);
      const riskPenalty    = Math.min(10, (parseInt(m.at_risk_tasks) || 0) * 3);
      const score          = Math.max(0, Math.min(100, tasksScore + completionScore + commentScore - riskPenalty));

      return {
        ...m,
        tasks_assigned:   parseInt(m.tasks_assigned) || 0,
        tasks_completed:  parseInt(m.tasks_completed) || 0,
        comments_made:    parseInt(m.comments_made) || 0,
        avg_progress:     parseInt(m.avg_progress) || 0,
        at_risk_tasks:    parseInt(m.at_risk_tasks) || 0,
        collaboration_score: score,
        status: m.on_leave ? "on_leave" : m.travel_mode ? "travel" : "active",
      };
    });

    res.json({ members: members.sort((a, b) => b.collaboration_score - a.collaboration_score) });
  } catch (err) {
    console.error("Collaboration error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
