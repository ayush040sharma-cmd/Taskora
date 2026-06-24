/**
 * POST /api/seed/demo  — fill current workspace with realistic dummy data
 * Safe to run multiple times (clears old seeded data first).
 */
const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");

const today   = () => new Date();
const addDays = (n) => { const d = today(); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
const subDays = (n) => addDays(-n);

router.post("/demo", auth, async (req, res) => {
  const { workspace_id } = req.body;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });

  // Verify ownership or membership
  const access = await pool.query(
    `SELECT w.id FROM workspaces w
     LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $2
     WHERE w.id = $1 AND (w.user_id = $2 OR wm.user_id IS NOT NULL)`,
    [workspace_id, req.user.id]
  );
  if (!access.rows.length) return res.status(403).json({ message: "Access denied" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Get all members of this workspace (owner + members) ──────────────────
    const membersRes = await client.query(
      `SELECT DISTINCT u.id, u.name, u.email, u.role
       FROM (
         SELECT wm.user_id FROM workspace_members wm WHERE wm.workspace_id = $1
         UNION
         SELECT w.user_id FROM workspaces w WHERE w.id = $1
       ) AS c
       JOIN users u ON u.id = c.user_id
       ORDER BY u.name`,
      [workspace_id]
    );
    const members = membersRes.rows;
    if (!members.length) return res.status(400).json({ message: "No users found in workspace" });

    // Helper: pick a member by index (wraps around)
    const pick = (i) => members[i % members.length];

    // ── Clear old demo data ──────────────────────────────────────────────────
    await client.query("DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE workspace_id=$1)", [workspace_id]);
    await client.query("DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE workspace_id=$1)", [workspace_id]);
    await client.query("DELETE FROM task_dependencies WHERE task_id IN (SELECT id FROM tasks WHERE workspace_id=$1)", [workspace_id]);
    await client.query("DELETE FROM task_dependencies WHERE depends_on_task_id IN (SELECT id FROM tasks WHERE workspace_id=$1)", [workspace_id]);
    await client.query("DELETE FROM tasks WHERE workspace_id=$1", [workspace_id]);
    await client.query("DELETE FROM sprints WHERE workspace_id=$1", [workspace_id]);
    await client.query("DELETE FROM calendar_events WHERE workspace_id=$1", [workspace_id]);
    await client.query("DELETE FROM audit_logs WHERE workspace_id=$1", [workspace_id]);

    // ── User capacity ────────────────────────────────────────────────────────
    const capacityConfigs = [
      { daily: 8, cf: 6, internal: 2, travel: false, leave: false },
      { daily: 8, cf: 5, internal: 3, travel: true,  leave: false },
      { daily: 7, cf: 4, internal: 3, travel: false, leave: true, leaveStart: addDays(3), leaveEnd: addDays(7) },
      { daily: 8, cf: 6, internal: 2, travel: false, leave: false },
    ];
    for (let i = 0; i < members.length; i++) {
      const c = capacityConfigs[i % capacityConfigs.length];
      await client.query(
        `INSERT INTO user_capacity
           (user_id, daily_hours, customer_facing_hours, internal_hours,
            travel_mode, travel_hours, on_leave, leave_start, leave_end,
            max_rfp, max_proposals, max_presentations, max_upgrades)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,2,3,2,2)
         ON CONFLICT (user_id) DO UPDATE SET
           daily_hours=EXCLUDED.daily_hours, customer_facing_hours=EXCLUDED.customer_facing_hours,
           internal_hours=EXCLUDED.internal_hours, travel_mode=EXCLUDED.travel_mode,
           on_leave=EXCLUDED.on_leave, leave_start=EXCLUDED.leave_start, leave_end=EXCLUDED.leave_end`,
        [members[i].id, c.daily, c.cf, c.internal,
         c.travel, c.travel ? 2 : 0, c.leave,
         c.leave ? c.leaveStart : null, c.leave ? c.leaveEnd : null]
      );
    }

    // ── Sprint ────────────────────────────────────────────────────────────────
    const sprintRes = await client.query(
      `INSERT INTO sprints (workspace_id, name, goal, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [workspace_id,
       "Sprint 1 — Q2 Enterprise Push",
       "Deliver RFP submissions and close 2 enterprise proposals",
       subDays(7), addDays(7)]
    );
    const sprintId = sprintRes.rows[0].id;

    // ── Tasks ─────────────────────────────────────────────────────────────────
    const TASKS = [
      // TODO
      { title: "Prepare RFP response for HDFC Bank",
        description: "Draft a complete RFP response including technical architecture, pricing, and implementation timeline.",
        type: "rfp", priority: "high", status: "todo",
        due: addDays(8), start: addDays(1), est_hours: 56, progress: 0, pos: 0, sprint: sprintId,
        risk_score: 72, delay_prob: 0.58, ai_suggestion: "Due date is tight — break into subtasks and assign a reviewer now.",
        assigneeIdx: 0 },

      { title: "Prepare Quarterly Business Review deck",
        description: "Compile Q1 performance data, revenue metrics, and forward-looking projections for leadership.",
        type: "presentation", priority: "high", status: "todo",
        due: addDays(5), start: addDays(1), est_hours: 24, progress: 0, pos: 1, sprint: sprintId,
        risk_score: 45, delay_prob: 0.31, ai_suggestion: "Assign a reviewer 2 days before deadline.",
        assigneeIdx: 1 },

      { title: "Research AI-based fraud detection vendors",
        description: "Evaluate 3–5 vendors and prepare a comparison matrix for the client advisory board.",
        type: "task", priority: "medium", status: "todo",
        due: addDays(12), start: addDays(2), est_hours: 40, progress: 0, pos: 2, sprint: null,
        risk_score: 18, delay_prob: 0.12, ai_suggestion: null,
        assigneeIdx: 2 },

      { title: "Set up staging environment for v3.2 release",
        description: "Provision staging, run smoke tests, and validate deployment pipeline for the upcoming release.",
        type: "upgrade", priority: "medium", status: "todo",
        due: addDays(14), start: addDays(3), est_hours: 32, progress: 0, pos: 3, sprint: null,
        risk_score: 28, delay_prob: 0.22, ai_suggestion: "Coordinate with DevOps on infra availability.",
        assigneeIdx: 3 % members.length },

      { title: "Proposal: Telecom Churn Reduction Solution",
        description: "Formal proposal for a telecom client showcasing the churn prediction module with ROI projections.",
        type: "proposal", priority: "high", status: "todo",
        due: addDays(10), start: addDays(1), est_hours: 48, progress: 0, pos: 4, sprint: sprintId,
        risk_score: 55, delay_prob: 0.42, ai_suggestion: "Get pricing approval from commercial team early.",
        assigneeIdx: 0 },

      // IN PROGRESS
      { title: "API integration with CRM for Vodafone project",
        description: "Integrate analytics output with the CRM via REST API. Handle auth, rate limiting, and retries.",
        type: "task", priority: "high", status: "inprogress",
        due: addDays(2), start: subDays(7), est_hours: 64, progress: 55, pos: 0, sprint: sprintId,
        risk_score: 81, delay_prob: 0.71, ai_suggestion: "At risk of delay — add circuit breaker for CRM downtime.",
        assigneeIdx: 2 },

      { title: "RFP: Airtel Revenue Assurance Platform",
        description: "Complete response to Airtel's RFP. Currently in technical specification phase.",
        type: "rfp", priority: "high", status: "inprogress",
        due: addDays(1), start: subDays(10), est_hours: 80, progress: 70, pos: 1, sprint: sprintId,
        risk_score: 65, delay_prob: 0.54, ai_suggestion: "Pricing section is a blocker — escalate to commercial team.",
        assigneeIdx: 0 },

      { title: "Build sprint burndown dashboard",
        description: "Create an internal burndown chart and velocity tracker for daily standups.",
        type: "story", priority: "medium", status: "inprogress",
        due: addDays(3), start: subDays(4), est_hours: 24, progress: 40, pos: 2, sprint: sprintId,
        risk_score: 32, delay_prob: 0.24, ai_suggestion: null,
        assigneeIdx: 1 },

      { title: "POC: GPT-based anomaly detection for billing",
        description: "Prototype a GPT-4 powered billing anomaly detector using 3 months of anonymised data.",
        type: "poc", priority: "medium", status: "inprogress",
        due: addDays(6), start: subDays(5), est_hours: 72, progress: 30, pos: 3, sprint: null,
        risk_score: 42, delay_prob: 0.35, ai_suggestion: "Request more training data to push accuracy above 85%.",
        assigneeIdx: 3 % members.length },

      { title: "Bug: Revenue counter double-counts refunded transactions",
        description: "QA reported: refunded transactions are counted twice in the revenue aggregation pipeline.",
        type: "bug", priority: "high", status: "inprogress",
        due: subDays(1), start: subDays(2), est_hours: 16, progress: 20, pos: 4, sprint: sprintId,
        risk_score: 88, delay_prob: 0.79, ai_suggestion: "OVERDUE — assign a second dev to unblock immediately.",
        assigneeIdx: 2 },

      // DONE
      { title: "Onboard new analyst to platform",
        description: "Complete onboarding: tool access, VPN setup, code walkthroughs, and stakeholder intros.",
        type: "task", priority: "low", status: "done",
        due: subDays(4), start: subDays(7), est_hours: 24, progress: 100, pos: 0, sprint: sprintId,
        risk_score: 5, delay_prob: 0.03, ai_suggestion: null,
        assigneeIdx: 1 },

      { title: "Complete SOC 2 evidence collection",
        description: "Gather and submit all required evidence for the SOC 2 Type II audit.",
        type: "task", priority: "high", status: "done",
        due: subDays(5), start: subDays(11), est_hours: 48, progress: 100, pos: 1, sprint: null,
        risk_score: 8, delay_prob: 0.05, ai_suggestion: null,
        assigneeIdx: 0 },

      { title: "Presentation: AI Roadmap for BSNL Account",
        description: "Delivered product roadmap presentation to BSNL stakeholders covering AI-driven capabilities.",
        type: "presentation", priority: "medium", status: "done",
        due: subDays(6), start: subDays(8), est_hours: 16, progress: 100, pos: 2, sprint: null,
        risk_score: 4, delay_prob: 0.02, ai_suggestion: null,
        assigneeIdx: 2 },

      { title: "Fix login redirect loop in staging",
        description: "OAuth redirect loop caused session cookies to not be set correctly behind the load balancer.",
        type: "bug", priority: "high", status: "done",
        due: subDays(7), start: subDays(7), est_hours: 8, progress: 100, pos: 3, sprint: sprintId,
        risk_score: 3, delay_prob: 0.02, ai_suggestion: null,
        assigneeIdx: 3 % members.length },
    ];

    const createdTasks = [];
    for (const t of TASKS) {
      const assignee = pick(t.assigneeIdx);
      const r = await client.query(
        `INSERT INTO tasks
           (title, description, type, priority, status, assigned_user_id, workspace_id,
            due_date, start_date, estimated_hours, progress, sprint_id, position,
            risk_score, delay_probability, ai_suggestion, ai_last_analyzed_at, confidence_score)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),0.85)
         RETURNING id`,
        [t.title, t.description, t.type, t.priority, t.status, assignee.id, workspace_id,
         t.due, t.start, t.est_hours, t.progress, t.sprint, t.pos,
         t.risk_score, t.delay_prob, t.ai_suggestion]
      );
      createdTasks.push({ ...t, id: r.rows[0].id, assignee });
    }

    // ── Subtasks ──────────────────────────────────────────────────────────────
    const SUBTASKS = [
      { taskIdx: 0, items: [
        { title: "Review client RFP document", done: true },
        { title: "Technical architecture section", done: false },
        { title: "Pricing and commercial model", done: false },
        { title: "Implementation timeline", done: false },
        { title: "Risk & mitigation plan", done: false },
      ]},
      { taskIdx: 5, items: [
        { title: "OAuth2 auth flow", done: true },
        { title: "Map data schema to CRM fields", done: true },
        { title: "Handle rate limiting (500 req/min)", done: false },
        { title: "Error retry with exponential backoff", done: false },
        { title: "Integration tests", done: false },
      ]},
      { taskIdx: 6, items: [
        { title: "Executive summary", done: true },
        { title: "Technical specification", done: true },
        { title: "SLA and service terms", done: true },
        { title: "Pricing matrix", done: false },
        { title: "Client references section", done: false },
      ]},
      { taskIdx: 9, items: [
        { title: "Reproduce with test dataset", done: true },
        { title: "Identify root cause in aggregation query", done: false },
        { title: "Apply fix and write regression test", done: false },
      ]},
    ];
    for (const s of SUBTASKS) {
      const task = createdTasks[s.taskIdx];
      for (const item of s.items) {
        await client.query(
          "INSERT INTO subtasks (task_id, title, done) VALUES ($1,$2,$3)",
          [task.id, item.title, item.done]
        );
      }
    }

    // ── Task Dependencies ─────────────────────────────────────────────────────
    // Bug must be fixed before RFP (blocker example)
    await client.query(
      "INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [createdTasks[6].id, createdTasks[9].id]
    );
    // Staging setup before QBR deck
    await client.query(
      "INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [createdTasks[1].id, createdTasks[3].id]
    );

    // ── Comments ──────────────────────────────────────────────────────────────
    const COMMENTS = [
      { taskIdx: 5, text: "Auth flow done — OAuth2 client credentials. Adjusted from bearer tokens.", minsAgo: 72*60, userIdx: 2 },
      { taskIdx: 5, text: "Good progress. Add a circuit breaker if the CRM goes down.", minsAgo: 48*60, userIdx: 1 },
      { taskIdx: 5, text: "Circuit breaker added. Rate limiting next — they allow 500 req/min but we're hitting 600.", minsAgo: 24*60, userIdx: 2 },
      { taskIdx: 6, text: "Executive summary done. Technical spec 80% — need SLA inputs from product.", minsAgo: 96*60, userIdx: 0 },
      { taskIdx: 6, text: "SLA template shared. Adapt sections 3.2 and 4.1 for this client.", minsAgo: 72*60, userIdx: 1 },
      { taskIdx: 6, text: "Pricing matrix is the blocker — waiting on commercial team for GST treatment.", minsAgo: 24*60, userIdx: 0 },
      { taskIdx: 9, text: "Reproduced with 10k transactions — the GROUP BY doesn't exclude refunds.", minsAgo: 24*60, userIdx: 2 },
      { taskIdx: 9, text: "Critical — affects monthly summary reports. Please prioritise.", minsAgo: 18*60, userIdx: 1 },
      { taskIdx: 9, text: "Fix: add `AND transaction_type != 'refund'`. Pushed to staging.", minsAgo: 4*60, userIdx: 0 },
      { taskIdx: 8, text: "Initial prototype ~78% accuracy on 3 months of anonymised data.", minsAgo: 48*60, userIdx: 3 % members.length },
      { taskIdx: 8, text: "78% is promising! Add feature importance to explain anomaly scores.", minsAgo: 24*60, userIdx: 1 },
    ];
    for (const c of COMMENTS) {
      const task    = createdTasks[c.taskIdx];
      const user    = pick(c.userIdx);
      const created = new Date(Date.now() - c.minsAgo * 60 * 1000);
      await client.query(
        "INSERT INTO task_comments (task_id, user_id, content, created_at) VALUES ($1,$2,$3,$4)",
        [task.id, user.id, c.text, created]
      );
    }

    // ── Calendar Events ───────────────────────────────────────────────────────
    const EVENTS = [
      { title: "Sprint Kickoff", type: "event",    start: subDays(7),  color: "#6366f1", desc: "Sprint planning and goal-setting session." },
      { title: "Daily Standup",  type: "meeting",  start: addDays(0),  color: "#0ea5e9", desc: "Team standup — 15 min check-in on blockers." },
      { title: "RFP Internal Review", type: "meeting", start: addDays(1), color: "#0ea5e9", desc: "Review draft RFP before submission." },
      { title: "RFP Submission Deadline", type: "deadline", start: addDays(1), color: "#ef4444", desc: "Final RFP due — no extensions." },
      { title: "Sprint Demo Day", type: "milestone", start: addDays(7), color: "#f59e0b", desc: "Sprint demo and retrospective with the full team." },
      { title: "HDFC Bank RFP Deadline", type: "deadline", start: addDays(8), color: "#ef4444", desc: "HDFC Bank RFP submission. No extensions." },
      { title: "Sprint Planning", type: "event",   start: addDays(9),  color: "#6366f1", desc: "Next sprint planning and capacity allocation." },
      { title: "QBR with Leadership", type: "meeting", start: addDays(5), color: "#0ea5e9", desc: "Quarterly Business Review with SVP and regional heads." },
      { title: "Team Leave", type: "leave",        start: addDays(3),  end: addDays(7), color: "#10b981", desc: "Planned team leave — reduced capacity this week." },
      { title: "Rohith — Travel Mode", type: "travel", start: subDays(2), end: addDays(3), color: "#8b5cf6", desc: "Working from branch office — reduced hours (6h/day)." },
    ];
    for (const ev of EVENTS) {
      await client.query(
        `INSERT INTO calendar_events (workspace_id, user_id, title, type, start_date, end_date, description, color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [workspace_id, pick(0).id, ev.title, ev.type, ev.start, ev.end || null, ev.desc, ev.color]
      );
    }

    // ── Audit Log (Activity Feed) ─────────────────────────────────────────────
    const AUDIT = [
      { action: "task_created",   taskIdx: 0,  minsAgo: 8*60,     actorIdx: 0 },
      { action: "task_assigned",  taskIdx: 0,  minsAgo: 8*60,     actorIdx: 0 },
      { action: "task_created",   taskIdx: 5,  minsAgo: 7*24*60,  actorIdx: 1 },
      { action: "task_moved",     taskIdx: 5,  minsAgo: 5*24*60,  actorIdx: 2, to: "inprogress" },
      { action: "task_created",   taskIdx: 6,  minsAgo: 10*24*60, actorIdx: 0 },
      { action: "task_moved",     taskIdx: 6,  minsAgo: 8*24*60,  actorIdx: 0, to: "inprogress" },
      { action: "task_completed", taskIdx: 10, minsAgo: 4*24*60,  actorIdx: 1 },
      { action: "task_completed", taskIdx: 11, minsAgo: 5*24*60,  actorIdx: 0 },
      { action: "task_created",   taskIdx: 9,  minsAgo: 2*24*60,  actorIdx: 2 },
      { action: "leave_started",  taskIdx: null, minsAgo: 3*24*60, actorIdx: 3 % members.length },
      { action: "travel_mode_on", taskIdx: null, minsAgo: 2*24*60, actorIdx: 2 },
      { action: "task_completed", taskIdx: 12, minsAgo: 6*24*60,  actorIdx: 2 },
      { action: "task_assigned",  taskIdx: 5,  minsAgo: 7*24*60,  actorIdx: 1 },
    ];
    for (const a of AUDIT) {
      const actor   = pick(a.actorIdx);
      const task    = a.taskIdx !== null ? createdTasks[a.taskIdx] : null;
      const created = new Date(Date.now() - a.minsAgo * 60 * 1000);
      const meta    = JSON.stringify({ task_title: task?.title || null, to: a.to || null, actor_name: actor.name });
      // Try both column-name variants the table might use
      try {
        await client.query(
          `INSERT INTO audit_logs (workspace_id, actor_id, action, target_type, target_id, meta, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [workspace_id, actor.id, a.action, task ? "task" : "user", task ? task.id : actor.id, meta, created]
        );
      } catch {
        try {
          await client.query(
            `INSERT INTO audit_logs (workspace_id, user_id, action, entity_type, entity_id, details, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [workspace_id, actor.id, a.action, task ? "task" : "user", task ? task.id : actor.id, meta, created]
          );
        } catch { /* audit is non-critical — skip */ }
      }
    }

    await client.query("COMMIT");

    res.json({
      ok: true,
      summary: {
        tasks:    createdTasks.length,
        sprint:   1,
        calendar: EVENTS.length,
        comments: COMMENTS.length,
        audit:    AUDIT.length,
        members:  members.length,
      }
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed error:", err);
    res.status(500).json({ message: "Seed failed: " + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
