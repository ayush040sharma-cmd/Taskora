const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const { refreshUserWorkloadLog } = require("../services/workloadLogger");
const { audit } = require("../services/auditService");
const { validate, schemas } = require("../utils/validate");
const { notifyOne } = require("../services/notificationService");
const { enforceLimit } = require("../middleware/planEnforce");
const { FEATURES }     = require("../config/licensing");
const { getAccessLevel, hasAtLeast, requireEditAccess } = require("../middleware/accessLevel");
const { resolveDueDate } = require("../utils/resolveDueDate");

async function countTasksInWorkspace(req) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM tasks WHERE workspace_id = $1", [req.body.workspace_id]);
  return rows[0].c;
}

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
              btu.name AS blocked_tagged_user_name,
              (SELECT COUNT(*) FROM task_dependencies td
               JOIN tasks dep ON td.depends_on_task_id = dep.id
               WHERE td.task_id = t.id AND dep.status != 'done')::int AS blocking_dep_count,
              (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id)::int AS comment_count
       FROM tasks t
       LEFT JOIN users u   ON t.assigned_user_id = u.id
       LEFT JOIN user_capacity uc ON u.id = uc.user_id
       LEFT JOIN users btu ON t.blocked_tagged_user_id = btu.id
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

// GET /api/tasks/team-intel/:workspaceId
// Returns ALL tasks assigned to ANY member of the workspace, across ALL their workspaces
router.get("/team-intel/:workspaceId", auth, async (req, res) => {
  const wsId = parseInt(req.params.workspaceId);
  if (isNaN(wsId)) return res.status(400).json({ message: "Invalid workspace ID" });

  try {
    // Must be owner or member of this workspace
    const access = await pool.query(
      `SELECT 1 FROM workspaces WHERE id = $1 AND user_id = $2
       UNION ALL
       SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2
       LIMIT 1`,
      [wsId, req.user.id]
    );
    if (!access.rows.length) return res.status(403).json({ message: "Access denied" });

    // Get ALL member user IDs for this workspace (owner + workspace_members)
    const memberRes = await pool.query(
      `SELECT user_id FROM workspace_members WHERE workspace_id = $1
       UNION
       SELECT user_id FROM workspaces WHERE id = $1`,
      [wsId]
    );
    if (!memberRes.rows.length) return res.json([]);
    const memberIds = memberRes.rows.map(r => r.user_id);

    // Single query: tasks assigned to any member OR in any member-owned workspace
    // NOTE: tasks table has no updated_at — use status_changed_at for ordering
    const taskRes = await pool.query(
      `SELECT t.*,
              COALESCE(t.assigned_user_id, w.user_id)  AS effective_assignee_id,
              COALESCE(u.name,  wo.name)                AS assignee_name,
              COALESCE(u.email, wo.email)               AS assignee_email,
              uc.on_leave     AS assignee_on_leave,
              uc.travel_mode  AS assignee_travel_mode,
              uc.daily_hours  AS assignee_daily_hours,
              w.name          AS workspace_name,
              w.user_id       AS workspace_owner_id,
              s.name          AS sprint_name,
              (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id)::int  AS comment_count,
              (SELECT COUNT(*) FROM task_dependencies td
               JOIN tasks dep ON td.depends_on_task_id = dep.id
               WHERE td.task_id = t.id AND dep.status != 'done')::int            AS blocking_dep_count
       FROM tasks t
       LEFT JOIN users         u   ON t.assigned_user_id = u.id
       LEFT JOIN workspaces    w   ON t.workspace_id = w.id
       LEFT JOIN users         wo  ON w.user_id = wo.id
       LEFT JOIN user_capacity uc  ON u.id = uc.user_id
       LEFT JOIN sprints        s  ON t.sprint_id = s.id
       WHERE t.assigned_user_id = ANY($1::int[])
          OR t.workspace_id IN (SELECT id FROM workspaces WHERE user_id = ANY($1::int[]))
       ORDER BY
         CASE WHEN t.status = 'blocked' THEN 0 ELSE 1 END,
         t.due_date ASC NULLS LAST,
         t.status_changed_at DESC NULLS LAST`,
      [memberIds]
    );

    res.json(taskRes.rows);
  } catch (err) {
    console.error("Team Intel error:", err);
    res.status(500).json({ message: "Team Intel query failed", detail: err.message });
  }
});

// GET /api/tasks/:id  — single task with comment count
router.get("/:id", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*,
              u.name  AS assignee_name,
              u.email AS assignee_email,
              btu.name AS blocked_tagged_user_name,
              (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id)::int AS comment_count
       FROM tasks t
       LEFT JOIN users u ON t.assigned_user_id = u.id
       LEFT JOIN users btu ON t.blocked_tagged_user_id = btu.id
       WHERE t.id = $1
         AND (
           EXISTS (SELECT 1 FROM workspaces WHERE id = t.workspace_id AND user_id = $2)
           OR EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = t.workspace_id AND user_id = $2)
         )`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Task not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get single task error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/tasks
router.post("/", auth, validate(schemas.createTask), requireEditAccess, enforceLimit(FEATURES.TASK_LIMIT, countTasksInWorkspace), async (req, res) => {
  const {
    title, description, status, priority, due_date, start_date,
    workspace_id, type, estimated_days, progress, assigned_user_id, sprint_id,
    estimated_duration, final_duration, recurrence, team_id,
    blocked_reason, blocked_severity, blocked_expected_resolution, blocked_tagged_user_id,
  } = req.body;

  if (!title || !workspace_id) {
    return res.status(400).json({ message: "Title and workspace_id are required" });
  }

  try {
    const access = await pool.query(
      `SELECT 1 FROM workspaces WHERE id = $1 AND user_id = $2
       UNION
       SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspace_id, req.user.id]
    );
    if (!access.rows.length) return res.status(403).json({ message: "Access denied" });

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
        estimated_hours, actual_hours, recurrence, team_id,
        blocked_reason, blocked_severity, blocked_expected_resolution, blocked_tagged_user_id,
        date_blocked
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [
        title,
        description || null,
        status || "todo",
        priority || "medium",
        resolveDueDate({ due_date, start_date }),
        start_date || null,
        workspace_id,
        assigned_user_id || null,
        position,
        type || "task",
        estimated_days || 1,
        progress || 0,
        sprint_id || null,
        (estimated_duration || estimated_days || 1) * 8,
        (final_duration || estimated_days || 1) * 8,
        recurrence || null,
        team_id || null,
        status === "blocked" ? (blocked_reason || null) : null,
        status === "blocked" ? (blocked_severity || "medium") : null,
        status === "blocked" ? (blocked_expected_resolution || null) : null,
        status === "blocked" ? (blocked_tagged_user_id || null) : null,
        status === "blocked" ? new Date() : null,
      ]
    );
    const task = result.rows[0];

    // Emit real-time event to workspace room
    const io = req.app.get("io");
    if (io) io.to(`workspace:${workspace_id}`).emit("task:created", task);

    // Notify assignee (skip if assigning to yourself)
    if (assigned_user_id && assigned_user_id !== req.user.id) {
      notifyOne(
        assigned_user_id,
        "task_assigned",
        "New task assigned to you",
        `"${task.title}" has been assigned to you by ${req.user.name}.`,
        { task_id: task.id, task_title: task.title, workspace_id }
      ).catch(() => {});
    }

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
  try {
    const taskCheck = await pool.query(
      `SELECT t.id, t.status, t.assigned_user_id, t.title, t.workspace_id FROM tasks t
       WHERE t.id = $1
         AND (
           EXISTS (SELECT 1 FROM workspaces WHERE id = t.workspace_id AND user_id = $2)
           OR EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = t.workspace_id AND user_id = $2)
         )`,
      [req.params.id, req.user.id]
    );
    if (!taskCheck.rows.length) return res.status(404).json({ message: "Task not found" });

    const accessLevel = await getAccessLevel(taskCheck.rows[0].workspace_id, req.user.id);
    if (!hasAtLeast(accessLevel, "editor")) {
      return res.status(403).json({ message: "You have view-only access to this workspace" });
    }

    const prevStatus = taskCheck.rows[0].status;
    const newStatus  = req.body.status;

    // Build dynamic SET clause — only update fields explicitly present in body.
    // This allows null to clear nullable fields (due_date, assignee, etc.)
    const ALLOWED = [
      "title", "description", "status", "priority", "due_date", "start_date",
      "position", "progress", "type", "estimated_days", "assigned_user_id",
      "sprint_id", "estimated_duration", "final_duration", "recurrence",
      "team_id",
      // Blocked workflow fields
      "blocked_by_task_id", "blocked_reason", "blocked_severity", "blocked_expected_resolution",
      "blocked_tagged_user_id",
    ];
    const setClauses = [];
    const params     = [];
    let   idx        = 1;

    for (const field of ALLOWED) {
      if (field in req.body) {
        setClauses.push(`${field} = $${idx}`);
        params.push(req.body[field] ?? null);
        idx++;
      }
    }

    // Track when status changes
    if (newStatus && newStatus !== prevStatus) {
      setClauses.push("status_changed_at = NOW()");
    }

    // Handle completed_at for status transitions
    if (newStatus === "done" && prevStatus !== "done") {
      setClauses.push("completed_at = NOW()");
    } else if (newStatus && newStatus !== "done" && prevStatus === "done") {
      setClauses.push("completed_at = NULL");
    }

    // Handle blocked workflow transitions
    if (newStatus === "blocked" && prevStatus !== "blocked") {
      setClauses.push("date_blocked = NOW()");
      setClauses.push("unblocked_at = NULL");
    } else if (newStatus && newStatus !== "blocked" && prevStatus === "blocked") {
      setClauses.push("unblocked_at = NOW()");
      // Clear blocked fields when unblocking
      if (!("blocked_by_task_id" in req.body)) {
        setClauses.push("blocked_by_task_id = NULL");
      }
      if (!("blocked_reason" in req.body)) {
        setClauses.push("blocked_reason = NULL");
      }
      if (!("blocked_tagged_user_id" in req.body)) {
        setClauses.push("blocked_tagged_user_id = NULL");
      }
    }

    if (setClauses.length === 0) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );
    const updated = result.rows[0];

    // Emit real-time event to workspace room
    const io = req.app.get("io");
    if (io) io.to(`workspace:${updated.workspace_id}`).emit("task:updated", updated);

    // Notify new assignee when assignment changes (skip if assigning to yourself)
    const prevAssignee = taskCheck.rows[0].assigned_user_id;
    if (
      "assigned_user_id" in req.body &&
      updated.assigned_user_id &&
      updated.assigned_user_id !== prevAssignee &&
      updated.assigned_user_id !== req.user.id
    ) {
      notifyOne(
        updated.assigned_user_id,
        "task_assigned",
        "Task assigned to you",
        `"${updated.title}" has been assigned to you by ${req.user.name}.`,
        { task_id: updated.id, task_title: updated.title, workspace_id: updated.workspace_id }
      ).catch(() => {});
    }

    // Refresh workload log for assignee (non-blocking)
    if (updated.assigned_user_id) {
      refreshUserWorkloadLog(updated.assigned_user_id, updated.workspace_id).catch(() => {});
    }

    // Audit — only log meaningful changes, skip pure position reorders
    if (newStatus && newStatus !== prevStatus) {
      const action = newStatus === "done" ? "task_completed" : "task_moved";
      audit({ workspace_id: updated.workspace_id, actor_id: req.user.id, action, target_type: "task", target_id: updated.id, meta: { task_title: updated.title, from: prevStatus, to: newStatus } }).catch(() => {});
    } else if ("assigned_user_id" in req.body && req.body.assigned_user_id !== taskCheck.rows[0].assigned_user_id) {
      audit({ workspace_id: updated.workspace_id, actor_id: req.user.id, action: "task_assigned", target_type: "task", target_id: updated.id, meta: { task_title: updated.title } }).catch(() => {});
    } else if (req.body.title && req.body.title !== taskCheck.rows[0].title) {
      audit({ workspace_id: updated.workspace_id, actor_id: req.user.id, action: "task_renamed", target_type: "task", target_id: updated.id, meta: { task_title: req.body.title } }).catch(() => {});
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
       WHERE t.id = $1
         AND (
           EXISTS (SELECT 1 FROM workspaces WHERE id = t.workspace_id AND user_id = $2)
           OR EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = t.workspace_id AND user_id = $2)
         )`,
      [req.params.id, req.user.id]
    );
    if (!taskCheck.rows.length) return res.status(404).json({ message: "Task not found" });

    const { workspace_id, assigned_user_id, title: taskTitle } = taskCheck.rows[0];

    const accessLevel = await getAccessLevel(workspace_id, req.user.id);
    if (!hasAtLeast(accessLevel, "editor")) {
      return res.status(403).json({ message: "You have view-only access to this workspace" });
    }

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
      `SELECT 1 FROM workspaces WHERE id = $1 AND user_id = $2
       UNION
       SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
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
    const taskCheck = await pool.query(
      `SELECT t.id FROM tasks t
       WHERE t.id = $1
         AND (
           EXISTS (SELECT 1 FROM workspaces WHERE id = t.workspace_id AND user_id = $2)
           OR EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = t.workspace_id AND user_id = $2)
         )`,
      [req.params.id, req.user.id]
    );
    if (!taskCheck.rows.length) return res.status(404).json({ message: "Task not found" });

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
    const taskCheck = await pool.query(
      `SELECT t.id FROM tasks t
       WHERE t.id = $1
         AND (
           EXISTS (SELECT 1 FROM workspaces WHERE id = t.workspace_id AND user_id = $2)
           OR EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = t.workspace_id AND user_id = $2)
         )`,
      [req.params.id, req.user.id]
    );
    if (!taskCheck.rows.length) return res.status(404).json({ message: "Task not found" });

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
      `SELECT 1 FROM workspaces WHERE id = $1 AND user_id = $2
       UNION
       SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
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

// ── GET /api/tasks/workspace/:workspaceId/blocked-analytics ──────────────────
router.get("/workspace/:workspaceId/blocked-analytics", auth, async (req, res) => {
  try {
    const access = await Promise.all([
      pool.query("SELECT id FROM workspaces WHERE id=$1 AND user_id=$2", [req.params.workspaceId, req.user.id]),
      pool.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [req.params.workspaceId, req.user.id]),
    ]);
    if (!access[0].rows.length && !access[1].rows.length) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [blockedTasks, avgBlock, mostBlockingUser, severityCounts] = await Promise.all([
      // All blocked tasks with details
      pool.query(
        `SELECT t.id, t.title, t.status, t.priority, t.blocked_reason,
                t.blocked_severity, t.blocked_expected_resolution, t.date_blocked,
                t.blocked_by_task_id,
                bt.title AS blocked_by_task_title,
                t.blocked_tagged_user_id,
                btu.name AS blocked_tagged_user_name,
                u.name AS assignee_name, u.email AS assignee_email,
                EXTRACT(EPOCH FROM (NOW() - t.date_blocked))/3600 AS hours_blocked
         FROM tasks t
         LEFT JOIN tasks bt ON bt.id = t.blocked_by_task_id
         LEFT JOIN users u  ON u.id = t.assigned_user_id
         LEFT JOIN users btu ON btu.id = t.blocked_tagged_user_id
         WHERE t.workspace_id = $1 AND t.status = 'blocked'
         ORDER BY t.date_blocked ASC`,
        [req.params.workspaceId]
      ),

      // Average block time across all ever-blocked tasks (including resolved)
      pool.query(
        `SELECT ROUND(AVG(
           EXTRACT(EPOCH FROM (COALESCE(unblocked_at, NOW()) - date_blocked))/3600
         ))::int AS avg_hours
         FROM tasks
         WHERE workspace_id=$1 AND date_blocked IS NOT NULL`,
        [req.params.workspaceId]
      ),

      // Most blocking person: person whose tasks are most often blocking others
      pool.query(
        `SELECT u.name, u.id AS user_id, COUNT(*)::int AS block_count
         FROM tasks t
         JOIN task_dependencies td ON td.depends_on_task_id = t.id
         JOIN tasks blocked_t ON blocked_t.id = td.task_id AND blocked_t.status = 'blocked'
         LEFT JOIN users u ON u.id = t.assigned_user_id
         WHERE t.workspace_id = $1 AND t.status != 'done'
         GROUP BY u.id, u.name
         ORDER BY block_count DESC LIMIT 1`,
        [req.params.workspaceId]
      ),

      // Severity breakdown
      pool.query(
        `SELECT COALESCE(blocked_severity,'medium') AS severity, COUNT(*)::int AS count
         FROM tasks
         WHERE workspace_id=$1 AND status='blocked'
         GROUP BY blocked_severity`,
        [req.params.workspaceId]
      ),
    ]);

    // Most common block reason
    const reasons = blockedTasks.rows
      .map(t => t.blocked_reason)
      .filter(Boolean);
    const reasonCounts = {};
    for (const r of reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;
    const mostCommonReason = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Oldest blocked task
    const oldest = blockedTasks.rows[0] || null;

    res.json({
      blocked_tasks:        blockedTasks.rows,
      total_blocked:        blockedTasks.rows.length,
      avg_block_time_hours: avgBlock.rows[0]?.avg_hours || 0,
      most_blocking_user:   mostBlockingUser.rows[0] || null,
      most_common_reason:   mostCommonReason,
      oldest_blocked_task:  oldest,
      severity_breakdown:   severityCounts.rows,
    });
  } catch (err) {
    console.error("Blocked analytics error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
