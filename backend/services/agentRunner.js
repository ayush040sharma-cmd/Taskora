/**
 * Multi-Agent Automation Runner — Phase 15
 *
 * Runs background agents on a schedule:
 *   Agent 1 (Risk Monitor)   — every hour: re-score all tasks, fire Slack alerts for new critical
 *   Agent 2 (Overdue Tagger) — every 6 hours: detect newly overdue tasks, notify workspace owners
 *   Agent 3 (Workload Sync)  — every 30 min: refresh workload_logs for all active users
 *   Agent 4 (Digest Mailer)  — daily 8am: send daily digest (when email configured)
 *
 * All agents are non-blocking and log to agent_runs table.
 */

const cron   = require("node-cron");
const pool   = require("../db");
const ai     = require("./aiEngine");
const axios  = require("axios");

let started = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function logRun(agentName, workspaceId, result, status = "ok", error = null) {
  await pool.query(
    `INSERT INTO agent_runs (agent_name, workspace_id, result, status, error_message)
     VALUES ($1,$2,$3,$4,$5)`,
    [agentName, workspaceId, JSON.stringify(result), status, error]
  ).catch(() => {});
}

async function getSlackWebhook(workspaceId) {
  const row = await pool.query(
    `SELECT config FROM workspace_integrations
     WHERE workspace_id=$1 AND type='slack' AND enabled=true`,
    [workspaceId]
  );
  return row.rows[0]?.config?.webhook_url || null;
}

async function sendSlack(webhookUrl, text, blocks = null) {
  await axios.post(webhookUrl, { text, blocks }, {
    headers: { "Content-Type": "application/json" },
    timeout: 5000,
  });
}

// ── Agent 1: Risk Monitor ─────────────────────────────────────────────────────
async function runRiskMonitor() {
  try {
    const wsRow = await pool.query("SELECT DISTINCT id FROM workspaces");
    for (const ws of wsRow.rows) {
      try {
        const tasksRow = await pool.query(
          `SELECT t.*,
                  (SELECT COUNT(*) FROM task_dependencies td
                   JOIN tasks dep ON td.depends_on_task_id=dep.id
                   WHERE td.task_id=t.id AND dep.status!='done')::int AS blocking_dep_count
           FROM tasks t WHERE t.workspace_id=$1 AND t.status != 'done'`,
          [ws.id]
        );

        const wlRow = await pool.query(
          `SELECT wl.user_id, wl.scheduled_hours, uc.daily_hours, uc.on_leave, uc.travel_mode, u.name
           FROM user_capacity uc JOIN users u ON u.id=uc.user_id
           LEFT JOIN workload_logs wl ON wl.user_id=uc.user_id AND wl.date=CURRENT_DATE
           WHERE u.id IN (
             SELECT DISTINCT assigned_user_id FROM tasks WHERE workspace_id=$1 AND assigned_user_id IS NOT NULL
           )`,
          [ws.id]
        );

        const loadMap = {};
        wlRow.rows.forEach(r => {
          const cap = parseFloat(r.daily_hours) || 8;
          const sch = parseFloat(r.scheduled_hours) || 0;
          loadMap[r.user_id] = { load_percent: Math.round((sch / cap) * 100), on_leave: r.on_leave, travel_mode: r.travel_mode };
        });

        const newCritical = [];
        for (const task of tasksRow.rows) {
          const load = task.assigned_user_id ? loadMap[task.assigned_user_id] : null;
          const pred = ai.calculateRiskScore(task, load);

          // Check if risk level worsened
          const prevScore = parseFloat(task.risk_score) || 0;
          const newCrit   = pred.risk_score >= 75 && prevScore < 75;

          await pool.query(
            `UPDATE tasks SET risk_score=$1, delay_probability=$2, confidence_score=$3,
                              ai_suggestion=$4, ai_last_analyzed_at=NOW() WHERE id=$5`,
            [pred.risk_score, pred.delay_probability, pred.confidence_score, pred.suggestions[0] || null, task.id]
          ).catch(() => {});

          if (newCrit) newCritical.push({ title: task.title, score: pred.risk_score, suggestion: pred.suggestions[0] });
        }

        // Slack alert for newly critical tasks
        if (newCritical.length > 0) {
          const webhookUrl = await getSlackWebhook(ws.id);
          if (webhookUrl) {
            const text = `🚨 *${newCritical.length} task${newCritical.length !== 1 ? "s" : ""} reached CRITICAL risk* in your workspace:\n` +
              newCritical.map(t => `• "${t.title}" (score: ${t.score}) — ${t.suggestion || "needs attention"}`).join("\n");
            await sendSlack(webhookUrl, text).catch(() => {});
          }
        }

        await logRun("risk_monitor", ws.id, {
          tasks_analyzed: tasksRow.rows.length,
          newly_critical: newCritical.length,
        });
      } catch (e) {
        await logRun("risk_monitor", ws.id, {}, "error", e.message);
      }
    }
  } catch (e) {
    console.error("[Agent:RiskMonitor]", e.message);
  }
}

// ── Agent 2: Overdue Tagger ───────────────────────────────────────────────────
async function runOverdueTagger() {
  try {
    const wsRow = await pool.query("SELECT id, user_id FROM workspaces");
    for (const ws of wsRow.rows) {
      try {
        // Find newly overdue tasks (due yesterday or before, never notified)
        const overdueRow = await pool.query(
          `SELECT t.id, t.title, t.due_date, u.name AS assignee_name, t.assigned_user_id
           FROM tasks t
           LEFT JOIN users u ON u.id=t.assigned_user_id
           WHERE t.workspace_id=$1
             AND t.due_date < NOW()
             AND t.status != 'done'
             AND (t.ai_last_analyzed_at IS NULL OR t.due_date::date != (t.ai_last_analyzed_at - INTERVAL '1 day')::date)
           LIMIT 10`,
          [ws.id]
        );

        if (overdueRow.rows.length > 0) {
          // Create in-app notifications for workspace owner
          for (const task of overdueRow.rows) {
            await pool.query(
              `INSERT INTO notifications (user_id, type, title, body, data)
               VALUES ($1, 'overdue', $2, $3, $4)`,
              [
                ws.user_id,
                `Task overdue: ${task.title}`,
                `"${task.title}" was due ${new Date(task.due_date).toLocaleDateString()}${task.assignee_name ? ` - assigned to ${task.assignee_name}` : ""}.`,
                JSON.stringify({ workspace_id: ws.id, task_id: task.id }),
              ]
            ).catch(() => {});
          }

          // Slack alert
          const webhookUrl = await getSlackWebhook(ws.id);
          if (webhookUrl) {
            const text = `⏰ *${overdueRow.rows.length} overdue task${overdueRow.rows.length !== 1 ? "s" : ""}*:\n` +
              overdueRow.rows.map(t =>
                `• "${t.title}" — due ${new Date(t.due_date).toLocaleDateString()}${t.assignee_name ? ` (${t.assignee_name})` : ""}`
              ).join("\n");
            await sendSlack(webhookUrl, text).catch(() => {});
          }
        }

        await logRun("overdue_tagger", ws.id, { overdue_found: overdueRow.rows.length });
      } catch (e) {
        await logRun("overdue_tagger", ws.id, {}, "error", e.message);
      }
    }
  } catch (e) {
    console.error("[Agent:OverdueTagger]", e.message);
  }
}

// ── Agent 3: Workload Sync ────────────────────────────────────────────────────
async function runWorkloadSync() {
  try {
    const usersRow = await pool.query(
      `SELECT DISTINCT uc.user_id, t.workspace_id
       FROM user_capacity uc
       JOIN tasks t ON t.assigned_user_id=uc.user_id
       WHERE t.status != 'done'`
    );

    for (const { user_id, workspace_id } of usersRow.rows) {
      try {
        const { refreshUserWorkloadLog } = require("./workloadLogger");
        await refreshUserWorkloadLog(user_id, workspace_id);
      } catch { /* ignore */ }
    }

    await logRun("workload_sync", null, { users_synced: usersRow.rows.length });
  } catch (e) {
    console.error("[Agent:WorkloadSync]", e.message);
  }
}

// ── Start all agents ──────────────────────────────────────────────────────────
function startAgents() {
  if (started) return;
  started = true;

  // Agent 1: Risk Monitor — every hour at minute 5
  cron.schedule("5 * * * *", () => {
    console.log("[Agent:RiskMonitor] Running…");
    runRiskMonitor();
  });

  // Agent 2: Overdue Tagger — every 6 hours
  cron.schedule("0 */6 * * *", () => {
    console.log("[Agent:OverdueTagger] Running…");
    runOverdueTagger();
  });

  // Agent 3: Workload Sync — every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    console.log("[Agent:WorkloadSync] Running…");
    runWorkloadSync();
  });

  console.log("✅ Background agents started (RiskMonitor, OverdueTagger, WorkloadSync)");
}

module.exports = { startAgents, runRiskMonitor, runOverdueTagger, runWorkloadSync };
