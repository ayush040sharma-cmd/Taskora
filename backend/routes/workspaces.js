const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const { validate, schemas } = require("../utils/validate");
const { enforceLimit } = require("../middleware/planEnforce");
const { FEATURES }     = require("../config/licensing");
const logger = require("../utils/logger");

async function countOwnedWorkspaces(req) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM workspaces WHERE user_id = $1", [req.user.id]);
  return rows[0].c;
}

// GET /api/workspaces
// Returns workspaces the user owns OR is a member of
router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT w.*
       FROM workspaces w
       LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
       WHERE w.user_id = $1 OR wm.user_id = $1
       ORDER BY w.created_at ASC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get workspaces error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

const WORKSPACE_TEMPLATES = {
  software: {
    tasks: [
      { title: "Set up project repository", status: "todo", priority: "high", type: "task" },
      { title: "Define API contracts", status: "todo", priority: "high", type: "story" },
      { title: "Write unit tests", status: "todo", priority: "medium", type: "task" },
      { title: "Set up CI/CD pipeline", status: "todo", priority: "medium", type: "upgrade" },
      { title: "Code review guidelines", status: "todo", priority: "low", type: "task" },
    ],
    teams: ["Engineering", "QA", "DevOps"],
  },
  marketing: {
    tasks: [
      { title: "Q3 campaign brief", status: "todo", priority: "high", type: "task" },
      { title: "Content calendar planning", status: "todo", priority: "high", type: "story" },
      { title: "Social media audit", status: "todo", priority: "medium", type: "task" },
      { title: "Blog posts backlog", status: "todo", priority: "low", type: "task" },
    ],
    teams: ["Content", "Design", "Paid Media"],
  },
  presales: {
    tasks: [
      { title: "Customer discovery call", status: "todo", priority: "high", type: "task" },
      { title: "RFP response template", status: "todo", priority: "high", type: "rfp" },
      { title: "Demo environment setup", status: "todo", priority: "medium", type: "upgrade" },
      { title: "Competitive analysis", status: "todo", priority: "medium", type: "task" },
    ],
    teams: ["Sales", "Solutions Engineering", "Marketing"],
  },
  recruitment: {
    tasks: [
      { title: "Define job requirements", status: "todo", priority: "high", type: "task" },
      { title: "Post job openings", status: "todo", priority: "high", type: "task" },
      { title: "Screen applications", status: "todo", priority: "medium", type: "task" },
      { title: "Schedule interviews", status: "todo", priority: "medium", type: "task" },
      { title: "Offer letter templates", status: "todo", priority: "low", type: "task" },
    ],
    teams: ["HR", "Hiring Managers", "Legal"],
  },
  compliance: {
    tasks: [
      { title: "Data privacy audit", status: "todo", priority: "high", type: "task" },
      { title: "Policy documentation", status: "todo", priority: "high", type: "task" },
      { title: "Security controls review", status: "todo", priority: "high", type: "upgrade" },
      { title: "Employee compliance training", status: "todo", priority: "medium", type: "task" },
    ],
    teams: ["Legal", "Security", "Operations"],
  },
  research: {
    tasks: [
      { title: "Literature review", status: "todo", priority: "high", type: "task" },
      { title: "Research hypothesis definition", status: "todo", priority: "high", type: "story" },
      { title: "Data collection plan", status: "todo", priority: "medium", type: "task" },
      { title: "Analysis methodology", status: "todo", priority: "medium", type: "task" },
      { title: "Final report structure", status: "todo", priority: "low", type: "task" },
    ],
    teams: ["Research", "Data", "Editorial"],
  },
};

async function seedWorkspaceTemplate(workspaceId, userId, template) {
  const tmpl = WORKSPACE_TEMPLATES[template];
  if (!tmpl) return;

  try {
    // Create starter tasks
    for (let i = 0; i < tmpl.tasks.length; i++) {
      const t = tmpl.tasks[i];
      await pool.query(
        `INSERT INTO tasks (title, status, priority, type, workspace_id, position)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [t.title, t.status, t.priority, t.type, workspaceId, i + 1]
      ).catch(() => {});
    }

    // Create default teams
    for (const teamName of tmpl.teams) {
      const teamRes = await pool.query(
        `INSERT INTO teams (workspace_id, name, created_by)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`,
        [workspaceId, teamName, userId]
      ).catch(() => ({ rows: [] }));

      const teamId = teamRes.rows[0]?.id;
      if (teamId) {
        await pool.query(
          `INSERT INTO team_members (team_id, user_id, role, added_by)
           VALUES ($1,$2,'lead',$2) ON CONFLICT DO NOTHING`,
          [teamId, userId]
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.error("Template seed error:", err.message);
  }
}

// POST /api/workspaces
router.post("/", auth, validate(schemas.createWorkspace), enforceLimit(FEATURES.PROJECT_LIMIT, countOwnedWorkspaces), async (req, res) => {
  const { name, template } = req.body;
  if (!name) return res.status(400).json({ message: "Workspace name is required" });

  try {
    const result = await pool.query(
      "INSERT INTO workspaces (name, user_id, template) VALUES ($1, $2, $3) RETURNING *",
      [name, req.user.id, template || null]
    );
    const workspace = result.rows[0];

    // Seed template tasks and teams (non-blocking)
    if (template && WORKSPACE_TEMPLATES[template]) {
      seedWorkspaceTemplate(workspace.id, req.user.id, template).catch(() => {});
    }

    res.status(201).json(workspace);
  } catch (err) {
    console.error("Create workspace error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/workspaces/:id/summary
router.get("/:id/summary", auth, async (req, res) => {
  const wsId = req.params.id;
  try {
    const ws = await pool.query(
      `SELECT w.id, w.name FROM workspaces w
       WHERE w.id = $1
         AND (w.user_id = $2 OR EXISTS (
           SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2
         ))`,
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
    logger.error(`Delete workspace error: ${err.message}`, { workspaceId: req.params.id, userId: req.user.id, stack: err.stack });
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
