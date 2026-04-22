/**
 * Natural Language Query Engine — rule-based, zero external dependencies
 * POST /api/nlquery/:workspaceId  { query: "show overdue tasks" }
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");
const ai      = require("../services/aiEngine");

// ── Intent patterns ───────────────────────────────────────────────────────────
const INTENTS = [
  { name: "overdue",       re: /overdue|past due|late/i },
  { name: "high_risk",     re: /high.?risk|at.?risk|risky|danger/i },
  { name: "blocked",       re: /block(ed)?|stuck|depend/i },
  { name: "unassigned",    re: /unassign|no.?owner|nobody|no.?one/i },
  { name: "my_tasks",      re: /my tasks?|assigned to me|mine/i },
  { name: "overloaded",    re: /overload|over.?capac|too much/i },
  { name: "due_today",     re: /due today|today/i },
  { name: "due_this_week", re: /this week|due.?week|week/i },
  { name: "done",          re: /complet(ed)?|done|finished/i },
  { name: "high_priority", re: /high.?prior|urgent|critical/i },
  { name: "by_person",     re: /assign(ed)? to (?<name>[a-z ]+)|tasks? (?:for|of) (?<name2>[a-z ]+)/i },
  { name: "summary",       re: /summar|overview|status|health/i },
  { name: "sprint",        re: /sprint|iteration/i },
  { name: "count",         re: /how many|count|total/i },
  { name: "search",        re: /find|search|look for|show me (.+)/i },
];

function detectIntent(query) {
  for (const intent of INTENTS) {
    const m = intent.re.exec(query);
    if (m) return { name: intent.name, match: m };
  }
  return { name: "search", match: null };
}

function extractName(query) {
  const m = /assign(?:ed)? to ([a-zA-Z ]+)|tasks? (?:for|of) ([a-zA-Z ]+)/i.exec(query);
  if (!m) return null;
  return (m[1] || m[2] || "").trim().toLowerCase();
}

function extractSearchTerm(query) {
  const m = /(?:find|search|look for|show me) (.+)/i.exec(query);
  return m ? m[1].trim() : query.trim();
}

// ── POST /api/nlquery/:workspaceId ────────────────────────────────────────────
router.post("/:workspaceId", auth, async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) return res.status(400).json({ message: "query required" });

  try {
    const ws = await pool.query(
      "SELECT id FROM workspaces WHERE id=$1 AND user_id=$2",
      [req.params.workspaceId, req.user.id]
    );
    if (!ws.rows.length) return res.status(403).json({ message: "Access denied" });

    const workspaceId = req.params.workspaceId;
    const { name: intent, match } = detectIntent(query);
    const now = new Date();

    let tasks = [], answer = "", type = "tasks";

    switch (intent) {

      case "overdue": {
        const r = await pool.query(
          `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_user_id
           WHERE t.workspace_id=$1 AND t.due_date < NOW() AND t.status != 'done'
           ORDER BY t.due_date ASC`,
          [workspaceId]
        );
        tasks = r.rows;
        answer = tasks.length === 0
          ? "No overdue tasks — great job! 🎉"
          : `Found ${tasks.length} overdue task${tasks.length !== 1 ? "s" : ""}.`;
        break;
      }

      case "high_risk": {
        const r = await pool.query(
          `SELECT t.*, u.name AS assignee_name,
                  (SELECT COUNT(*) FROM task_dependencies td
                   JOIN tasks dep ON td.depends_on_task_id=dep.id
                   WHERE td.task_id=t.id AND dep.status!='done')::int AS blocking_dep_count
           FROM tasks t LEFT JOIN users u ON u.id=t.assigned_user_id
           WHERE t.workspace_id=$1 AND t.status != 'done'`,
          [workspaceId]
        );
        const withRisk = r.rows
          .map(t => ({ ...t, _risk: ai.calculateRiskScore(t).risk_score }))
          .filter(t => t._risk >= 50)
          .sort((a, b) => b._risk - a._risk);
        tasks = withRisk;
        answer = tasks.length === 0
          ? "No high-risk tasks detected — project looks healthy! 💚"
          : `Found ${tasks.length} high-risk task${tasks.length !== 1 ? "s" : ""} (risk ≥ 50).`;
        break;
      }

      case "blocked": {
        const r = await pool.query(
          `SELECT t.*, u.name AS assignee_name,
                  (SELECT COUNT(*) FROM task_dependencies td
                   JOIN tasks dep ON td.depends_on_task_id=dep.id
                   WHERE td.task_id=t.id AND dep.status!='done')::int AS blocking_dep_count
           FROM tasks t LEFT JOIN users u ON u.id=t.assigned_user_id
           WHERE t.workspace_id=$1 AND t.status != 'done'
           HAVING (SELECT COUNT(*) FROM task_dependencies td
                   JOIN tasks dep ON td.depends_on_task_id=dep.id
                   WHERE td.task_id=t.id AND dep.status!='done') > 0`,
          [workspaceId]
        );
        tasks = r.rows;
        answer = tasks.length === 0
          ? "No blocked tasks right now."
          : `Found ${tasks.length} blocked task${tasks.length !== 1 ? "s" : ""} with unresolved dependencies.`;
        break;
      }

      case "unassigned": {
        const r = await pool.query(
          `SELECT t.* FROM tasks t
           WHERE t.workspace_id=$1 AND t.assigned_user_id IS NULL AND t.status != 'done'
           ORDER BY t.priority DESC, t.created_at ASC`,
          [workspaceId]
        );
        tasks = r.rows;
        answer = tasks.length === 0
          ? "All active tasks are assigned. ✅"
          : `Found ${tasks.length} unassigned task${tasks.length !== 1 ? "s" : ""}.`;
        break;
      }

      case "my_tasks": {
        const r = await pool.query(
          `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_user_id
           WHERE t.workspace_id=$1 AND t.assigned_user_id=$2 AND t.status != 'done'
           ORDER BY t.priority DESC, t.due_date ASC NULLS LAST`,
          [workspaceId, req.user.id]
        );
        tasks = r.rows;
        answer = tasks.length === 0
          ? "You have no open tasks assigned to you."
          : `You have ${tasks.length} open task${tasks.length !== 1 ? "s" : ""}.`;
        break;
      }

      case "due_today": {
        const r = await pool.query(
          `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_user_id
           WHERE t.workspace_id=$1 AND DATE(t.due_date) = CURRENT_DATE AND t.status != 'done'
           ORDER BY t.priority DESC`,
          [workspaceId]
        );
        tasks = r.rows;
        answer = tasks.length === 0
          ? "Nothing due today."
          : `${tasks.length} task${tasks.length !== 1 ? "s" : ""} due today.`;
        break;
      }

      case "due_this_week": {
        const r = await pool.query(
          `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_user_id
           WHERE t.workspace_id=$1
             AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
             AND t.status != 'done'
           ORDER BY t.due_date ASC`,
          [workspaceId]
        );
        tasks = r.rows;
        answer = tasks.length === 0
          ? "Nothing due in the next 7 days."
          : `${tasks.length} task${tasks.length !== 1 ? "s" : ""} due this week.`;
        break;
      }

      case "done": {
        const r = await pool.query(
          `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_user_id
           WHERE t.workspace_id=$1 AND t.status='done'
           ORDER BY t.updated_at DESC LIMIT 20`,
          [workspaceId]
        );
        tasks = r.rows;
        answer = `Showing ${tasks.length} recently completed tasks.`;
        break;
      }

      case "high_priority": {
        const r = await pool.query(
          `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_user_id
           WHERE t.workspace_id=$1 AND t.priority IN ('critical','high') AND t.status != 'done'
           ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 END, t.due_date ASC`,
          [workspaceId]
        );
        tasks = r.rows;
        answer = tasks.length === 0
          ? "No critical or high-priority open tasks."
          : `Found ${tasks.length} high-priority task${tasks.length !== 1 ? "s" : ""}.`;
        break;
      }

      case "overloaded": {
        const r = await pool.query(
          `SELECT u.name, wl.scheduled_hours, uc.daily_hours,
                  ROUND(wl.scheduled_hours / NULLIF(uc.daily_hours,0) * 100)::int AS load_pct
           FROM user_capacity uc
           JOIN users u ON u.id=uc.user_id
           LEFT JOIN workload_logs wl ON wl.user_id=uc.user_id AND wl.date=CURRENT_DATE
           WHERE u.id IN (
             SELECT DISTINCT assigned_user_id FROM tasks WHERE workspace_id=$1 AND assigned_user_id IS NOT NULL
           )
           ORDER BY load_pct DESC NULLS LAST`,
          [workspaceId]
        );
        type = "members";
        tasks = r.rows;
        const overloaded = r.rows.filter(m => m.load_pct > 100);
        answer = overloaded.length === 0
          ? "No team members are overloaded right now. ✅"
          : `${overloaded.length} member${overloaded.length !== 1 ? "s" : ""} overloaded: ${overloaded.map(m => `${m.name} (${m.load_pct}%)`).join(", ")}.`;
        break;
      }

      case "by_person": {
        const name = extractName(query);
        if (!name) { answer = "Could not extract a name from your query."; break; }
        const r = await pool.query(
          `SELECT t.*, u.name AS assignee_name FROM tasks t
           JOIN users u ON u.id=t.assigned_user_id
           WHERE t.workspace_id=$1 AND LOWER(u.name) LIKE $2 AND t.status != 'done'
           ORDER BY t.priority DESC`,
          [workspaceId, `%${name}%`]
        );
        tasks = r.rows;
        answer = tasks.length === 0
          ? `No open tasks found for "${name}".`
          : `Found ${tasks.length} open task${tasks.length !== 1 ? "s" : ""} assigned to people matching "${name}".`;
        break;
      }

      case "summary": {
        const r = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status != 'done')                           AS open,
             COUNT(*) FILTER (WHERE status = 'done')                            AS done,
             COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'done')       AS overdue,
             COUNT(*) FILTER (WHERE priority IN ('critical','high') AND status != 'done') AS high_pri,
             COUNT(*) FILTER (WHERE assigned_user_id IS NULL AND status != 'done') AS unassigned
           FROM tasks WHERE workspace_id=$1`,
          [workspaceId]
        );
        type = "summary";
        const s = r.rows[0];
        tasks = [s];
        answer = `Workspace summary: **${s.open} open**, **${s.done} done**, **${s.overdue} overdue**, **${s.high_pri} high-priority**, **${s.unassigned} unassigned**.`;
        break;
      }

      default: { // search
        const term = extractSearchTerm(query);
        const r = await pool.query(
          `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_user_id
           WHERE t.workspace_id=$1 AND (
             LOWER(t.title) LIKE $2 OR LOWER(t.description) LIKE $2
           ) AND t.status != 'done'
           ORDER BY t.priority DESC LIMIT 20`,
          [workspaceId, `%${term.toLowerCase()}%`]
        );
        tasks = r.rows;
        answer = tasks.length === 0
          ? `No tasks found matching "${term}".`
          : `Found ${tasks.length} task${tasks.length !== 1 ? "s" : ""} matching "${term}".`;
        break;
      }
    }

    res.json({ intent, answer, tasks: tasks.slice(0, 20), type, query });
  } catch (err) {
    console.error("NL query error:", err);
    res.status(500).json({ message: "Query failed" });
  }
});

module.exports = router;
