/**
 * Seed script — fills Subex Team Workspace with realistic dummy data
 * Run: node backend/seed-data.js
 *
 * Seeds: tasks, subtasks, comments, calendar events, capacity, notifications
 */

require("dotenv").config();
const pool = require("./db");

const WORKSPACE_NAME = "Subex Team Workspace";

async function seed() {
  const client = await pool.connect();
  try {
    // ── Look up users & workspace ──────────────────────────────────────────────
    const usersRes = await client.query(
      `SELECT u.id, u.name, u.email, u.role
       FROM users u
       WHERE u.email IN (
         'nishanth.shetty@subex.com',
         'ayush.sharma@subex.com',
         'rohith.kumar@subex.com',
         'harish.gd@subex.com'
       )`
    );

    const users = {};
    usersRes.rows.forEach(u => {
      if (u.email === "nishanth.shetty@subex.com") users.nishanth = u;
      if (u.email === "ayush.sharma@subex.com")    users.ayush    = u;
      if (u.email === "rohith.kumar@subex.com")    users.rohith   = u;
      if (u.email === "harish.gd@subex.com")       users.harish   = u;
    });

    if (!users.nishanth) {
      console.error("❌ Users not found. Run `node backend/seed-users.js` first.");
      process.exit(1);
    }

    const wsRes = await client.query(
      "SELECT id FROM workspaces WHERE name = $1 AND user_id = $2",
      [WORKSPACE_NAME, users.nishanth.id]
    );
    if (!wsRes.rows.length) {
      console.error("❌ Workspace not found. Run `node backend/seed-users.js` first.");
      process.exit(1);
    }
    const wsId = wsRes.rows[0].id;
    console.log(`\n📦 Workspace: "${WORKSPACE_NAME}" (id=${wsId})`);
    console.log("👥 Users:", Object.entries(users).map(([k, u]) => `${u.name} (id=${u.id})`).join(", "));

    await client.query("BEGIN");

    // ── Clear existing seeded data ─────────────────────────────────────────────
    console.log("\n🗑  Clearing old data…");
    await client.query("DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE workspace_id = $1)", [wsId]);
    await client.query("DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE workspace_id = $1)", [wsId]);
    await client.query("DELETE FROM calendar_events WHERE workspace_id = $1", [wsId]);
    await client.query("DELETE FROM tasks WHERE workspace_id = $1", [wsId]);
    await client.query("DELETE FROM sprints WHERE workspace_id = $1", [wsId]);

    // ── Capacity ───────────────────────────────────────────────────────────────
    console.log("\n⚡ Setting capacity…");
    const capacities = [
      { userId: users.nishanth.id, daily: 8, cf: 6, internal: 2, travel: false, leave: false },
      { userId: users.ayush.id,    daily: 8, cf: 5, internal: 3, travel: false, leave: false },
      { userId: users.rohith.id,   daily: 7, cf: 5, internal: 2, travel: true,  travelHours: 2, leave: false },
      { userId: users.harish.id,   daily: 8, cf: 6, internal: 2, travel: false, leave: true,
        leaveStart: "2026-05-05", leaveEnd: "2026-05-09" },
    ];
    for (const c of capacities) {
      await client.query(
        `INSERT INTO user_capacity
           (user_id, daily_hours, customer_facing_hours, internal_hours,
            travel_mode, travel_hours, on_leave, leave_start, leave_end,
            max_rfp, max_proposals, max_presentations, max_upgrades)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,2,2,2)
         ON CONFLICT (user_id) DO UPDATE SET
           daily_hours = EXCLUDED.daily_hours,
           customer_facing_hours = EXCLUDED.customer_facing_hours,
           internal_hours = EXCLUDED.internal_hours,
           travel_mode = EXCLUDED.travel_mode,
           travel_hours = EXCLUDED.travel_hours,
           on_leave = EXCLUDED.on_leave,
           leave_start = EXCLUDED.leave_start,
           leave_end = EXCLUDED.leave_end`,
        [c.userId, c.daily, c.cf, c.internal,
         c.travel || false, c.travelHours || 0,
         c.leave || false, c.leaveStart || null, c.leaveEnd || null]
      );
    }
    console.log("  ✓ Capacity set for all 4 users (Rohith: travel mode, Harish: planned leave 5–9 May)");

    // ── Sprint ─────────────────────────────────────────────────────────────────
    console.log("\n🏃 Creating sprint…");
    const sprintRes = await client.query(
      `INSERT INTO sprints (workspace_id, name, goal, start_date, end_date, status)
       VALUES ($1, 'Sprint 7 — Q2 Enterprise Push', 'Deliver RFP submissions and close 2 enterprise proposals', '2026-04-21', '2026-05-02', 'active')
       RETURNING id`,
      [wsId]
    );
    const sprintId = sprintRes.rows[0].id;
    console.log(`  ✓ Sprint created (id=${sprintId})`);

    // ── Tasks ──────────────────────────────────────────────────────────────────
    console.log("\n📋 Creating tasks…");

    const TASKS = [
      // ── Todo ──
      {
        title: "Prepare RFP response for HDFC Bank",
        description: "Draft a complete RFP response including technical architecture, pricing, and implementation timeline for HDFC Bank's core banking modernisation tender.",
        type: "rfp", priority: "high", status: "todo",
        assignee: users.ayush.id,
        due: "2026-05-08", start: "2026-04-28", est_days: 7, est_hours: 56,
        sprint: sprintId, position: 0,
      },
      {
        title: "Prepare Quarterly Business Review deck",
        description: "Compile Q1 performance data, revenue metrics, and forward-looking projections for the QBR with leadership.",
        type: "presentation", priority: "high", status: "todo",
        assignee: users.nishanth.id,
        due: "2026-05-05", start: "2026-04-29", est_days: 3, est_hours: 24,
        sprint: sprintId, position: 1,
      },
      {
        title: "Research AI-based fraud detection vendors",
        description: "Evaluate 3–5 vendors for fraud detection capabilities to present to the client advisory board. Focus on Subex HydraX competitors.",
        type: "task", priority: "medium", status: "todo",
        assignee: users.rohith.id,
        due: "2026-05-12", start: "2026-05-01", est_days: 5, est_hours: 40,
        sprint: null, position: 2,
      },
      {
        title: "Set up staging environment for v3.2 release",
        description: "Provision AWS staging environment, run smoke tests, and validate deployment pipeline for the upcoming v3.2 product release.",
        type: "upgrade", priority: "medium", status: "todo",
        assignee: users.harish.id,
        due: "2026-05-15", start: "2026-05-06", est_days: 4, est_hours: 32,
        sprint: null, position: 3,
      },
      {
        title: "Proposal: Telecom Churn Reduction Solution",
        description: "Write a formal proposal for a leading telecom client showcasing Subex's churn prediction module with ROI projections.",
        type: "proposal", priority: "high", status: "todo",
        assignee: users.ayush.id,
        due: "2026-05-10", start: "2026-04-30", est_days: 6, est_hours: 48,
        sprint: sprintId, position: 4,
      },

      // ── In Progress ──
      {
        title: "API integration with CRM for Vodafone project",
        description: "Integrate Subex analytics output with the client's CRM via REST API. Handle auth, rate limiting, and error retries.",
        type: "task", priority: "high", status: "inprogress",
        assignee: users.rohith.id,
        due: "2026-05-02", start: "2026-04-22", est_days: 8, est_hours: 64,
        progress: 55, sprint: sprintId, position: 0,
      },
      {
        title: "RFP: Airtel Revenue Assurance Platform",
        description: "Complete response to Airtel's revenue assurance RFP. Currently in technical specification phase.",
        type: "rfp", priority: "high", status: "inprogress",
        assignee: users.ayush.id,
        due: "2026-04-30", start: "2026-04-18", est_days: 10, est_hours: 80,
        progress: 70, sprint: sprintId, position: 1,
      },
      {
        title: "Build burndown dashboard for Sprint 7",
        description: "Create an internal burndown chart and velocity tracker to be shared in daily standups.",
        type: "story", priority: "medium", status: "inprogress",
        assignee: users.nishanth.id,
        due: "2026-04-30", start: "2026-04-25", est_days: 3, est_hours: 24,
        progress: 40, sprint: sprintId, position: 2,
      },
      {
        title: "POC: GPT-based anomaly detection for billing",
        description: "Prototype a GPT-4 powered billing anomaly detector using 3 months of anonymised transaction data.",
        type: "poc", priority: "medium", status: "inprogress",
        assignee: users.harish.id,
        due: "2026-05-06", start: "2026-04-24", est_days: 9, est_hours: 72,
        progress: 30, sprint: null, position: 3,
      },
      {
        title: "Bug: Revenue counter double-counts refunded transactions",
        description: "Reported by QA: refunded transactions are being counted twice in the revenue aggregation pipeline. Affects summary reports.",
        type: "bug", priority: "high", status: "inprogress",
        assignee: users.rohith.id,
        due: "2026-04-30", start: "2026-04-28", est_days: 2, est_hours: 16,
        progress: 20, sprint: sprintId, position: 4,
      },

      // ── Done ──
      {
        title: "Onboard new analyst to Subex platform",
        description: "Complete onboarding checklist: tool access, VPN setup, code walkthroughs, and introductions to key stakeholders.",
        type: "task", priority: "low", status: "done",
        assignee: users.nishanth.id,
        due: "2026-04-25", start: "2026-04-21", est_days: 3, est_hours: 24,
        progress: 100, sprint: sprintId, position: 0,
      },
      {
        title: "Complete SOC 2 evidence collection",
        description: "Gather and submit all required evidence for SOC 2 Type II audit — access logs, encryption certificates, and change management records.",
        type: "task", priority: "high", status: "done",
        assignee: users.ayush.id,
        due: "2026-04-24", start: "2026-04-17", est_days: 6, est_hours: 48,
        progress: 100, sprint: null, position: 1,
      },
      {
        title: "Presentation: AI Roadmap for BSNL Account",
        description: "Delivered product roadmap presentation to BSNL stakeholders covering AI-driven revenue assurance capabilities for FY26–27.",
        type: "presentation", priority: "medium", status: "done",
        assignee: users.rohith.id,
        due: "2026-04-23", start: "2026-04-21", est_days: 2, est_hours: 16,
        progress: 100, sprint: null, position: 2,
      },
      {
        title: "Fix login redirect loop in staging environment",
        description: "OAuth redirect loop caused session cookies to not be set correctly in the staging environment behind the load balancer.",
        type: "bug", priority: "high", status: "done",
        assignee: users.harish.id,
        due: "2026-04-22", start: "2026-04-22", est_days: 1, est_hours: 8,
        progress: 100, sprint: sprintId, position: 3,
      },
    ];

    const createdTasks = [];
    for (const t of TASKS) {
      const r = await client.query(
        `INSERT INTO tasks
           (title, description, type, priority, status, assigned_user_id,
            workspace_id, due_date, start_date, estimated_days, estimated_hours,
            progress, sprint_id, position, recurrence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NULL)
         RETURNING id`,
        [
          t.title, t.description, t.type, t.priority, t.status, t.assignee,
          wsId, t.due, t.start, t.est_days, t.est_hours,
          t.progress || 0, t.sprint || null, t.position,
        ]
      );
      createdTasks.push({ ...t, id: r.rows[0].id });
    }
    console.log(`  ✓ Created ${createdTasks.length} tasks`);

    // ── Subtasks ───────────────────────────────────────────────────────────────
    console.log("\n✅ Creating subtasks…");
    const subtaskData = [
      // RFP for HDFC Bank
      { taskIdx: 0, items: [
        { title: "Review client RFP document (47 pages)", done: true },
        { title: "Technical architecture section", done: false },
        { title: "Pricing and commercial model", done: false },
        { title: "Implementation timeline & milestones", done: false },
        { title: "Risk & mitigation plan", done: false },
      ]},
      // API integration
      { taskIdx: 5, items: [
        { title: "Auth token flow — OAuth2 client credentials", done: true },
        { title: "Map Subex data schema to CRM fields", done: true },
        { title: "Handle rate limiting (500 req/min)", done: false },
        { title: "Error retry logic with exponential backoff", done: false },
        { title: "Integration tests", done: false },
      ]},
      // Airtel RFP
      { taskIdx: 6, items: [
        { title: "Executive summary", done: true },
        { title: "Technical specification", done: true },
        { title: "SLA and service terms", done: true },
        { title: "Pricing matrix", done: false },
        { title: "Client references section", done: false },
      ]},
      // Bug fix
      { taskIdx: 9, items: [
        { title: "Reproduce issue with test dataset", done: true },
        { title: "Identify root cause in aggregation pipeline", done: false },
        { title: "Apply fix and write regression test", done: false },
      ]},
    ];
    let subtaskCount = 0;
    for (const s of subtaskData) {
      const task = createdTasks[s.taskIdx];
      for (const item of s.items) {
        await client.query(
          `INSERT INTO subtasks (task_id, title, done) VALUES ($1, $2, $3)`,
          [task.id, item.title, item.done]
        );
        subtaskCount++;
      }
    }
    console.log(`  ✓ Created ${subtaskCount} subtasks`);

    // ── Comments ───────────────────────────────────────────────────────────────
    console.log("\n💬 Creating comments…");
    const commentData = [
      // API integration task
      { taskIdx: 5, comments: [
        { user: users.rohith.id, text: "Started with auth flow — the client uses OAuth2 client credentials, not bearer tokens. Adjusted the implementation accordingly.", ago: 3 * 24 * 60 },
        { user: users.nishanth.id, text: "Good progress. Make sure to add a circuit breaker if the CRM is down — we can't block the main pipeline.", ago: 2 * 24 * 60 },
        { user: users.rohith.id, text: "Circuit breaker added using opossum. Rate limiting is next — they allow 500 req/min but we're hitting 600 on peak load.", ago: 1 * 24 * 60 },
        { user: users.ayush.id, text: "Can we batch the API calls? Sending individual records is inefficient. Check if the CRM supports bulk endpoints.", ago: 6 * 60 },
      ]},
      // Airtel RFP
      { taskIdx: 6, comments: [
        { user: users.ayush.id, text: "Executive summary is done. Technical spec is 80% — need inputs from the product team on the SLA section.", ago: 4 * 24 * 60 },
        { user: users.nishanth.id, text: "@Ayush — I've shared the standard SLA template in Confluence. Adapt sections 3.2 and 4.1 for Airtel's requirements.", ago: 3 * 24 * 60 },
        { user: users.ayush.id, text: "Pricing matrix is the blocker now — waiting on the commercial team to confirm GST treatment on managed services.", ago: 1 * 24 * 60 },
      ]},
      // Bug
      { taskIdx: 9, comments: [
        { user: users.harish.id, text: "Reproduced with a dataset of 10k transactions — confirmed the bug. The issue is in the GROUP BY in the revenue aggregation query, it doesn't exclude refund records.", ago: 1 * 24 * 60 },
        { user: users.nishanth.id, text: "Critical — this affects the monthly summary reports. Please prioritise.", ago: 18 * 60 },
        { user: users.rohith.id, text: "The fix is simple: add `AND transaction_type != 'refund'` to the WHERE clause. Pushed to staging for QA review.", ago: 4 * 60 },
      ]},
      // POC
      { taskIdx: 8, comments: [
        { user: users.harish.id, text: "Initial prototype is running on 3 months of anonymised billing data. Accuracy is ~78% — need more data to push beyond 85%.", ago: 2 * 24 * 60 },
        { user: users.nishanth.id, text: "78% is promising. Can we add feature importance to explain which signals drive the anomaly score?", ago: 1 * 24 * 60 },
      ]},
    ];
    let commentCount = 0;
    for (const c of commentData) {
      const task = createdTasks[c.taskIdx];
      for (const cm of c.comments) {
        const createdAt = new Date(Date.now() - cm.ago * 60 * 1000);
        await client.query(
          `INSERT INTO task_comments (task_id, user_id, content, created_at) VALUES ($1, $2, $3, $4)`,
          [task.id, cm.user, cm.text, createdAt]
        );
        commentCount++;
      }
    }
    console.log(`  ✓ Created ${commentCount} comments`);

    // ── Calendar Events ────────────────────────────────────────────────────────
    console.log("\n📅 Creating calendar events…");
    const today = new Date("2026-04-29");
    const fmt = (d) => d.toISOString().split("T")[0];
    const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

    const EVENTS = [
      // Past events
      {
        title: "Sprint 7 Kickoff",
        type: "event",
        start: "2026-04-21", end: "2026-04-21",
        desc: "Sprint planning session for Sprint 7 — Q2 Enterprise Push.",
        user: users.nishanth.id, color: "#6366f1",
      },
      {
        title: "QBR Prep — Internal Review",
        type: "meeting",
        start: "2026-04-25", end: "2026-04-25",
        desc: "Internal review of Q1 metrics before the QBR with leadership.",
        user: users.nishanth.id, color: "#0ea5e9",
      },
      {
        title: "SOC 2 Evidence Deadline",
        type: "deadline",
        start: "2026-04-24", end: "2026-04-24",
        desc: "All SOC 2 evidence must be submitted by EOD.",
        user: users.ayush.id, color: "#ef4444",
      },
      // Current week
      {
        title: "Daily Standup",
        type: "meeting",
        start: fmt(today), end: fmt(today),
        desc: "Team standup — 15 min check-in on blockers and progress.",
        user: users.nishanth.id, color: "#0ea5e9",
      },
      {
        title: "Airtel RFP Internal Review",
        type: "meeting",
        start: fmt(addDays(today, 1)), end: fmt(addDays(today, 1)),
        desc: "Review draft RFP response before submission. All stakeholders required.",
        user: users.nishanth.id, color: "#0ea5e9",
      },
      {
        title: "Airtel RFP Submission Deadline",
        type: "deadline",
        start: "2026-04-30", end: "2026-04-30",
        desc: "Final RFP response must be submitted to Airtel procurement portal by 5PM IST.",
        user: users.ayush.id, color: "#ef4444",
      },
      // Next week
      {
        title: "Harish Leave — Out of Office",
        type: "leave",
        start: "2026-05-05", end: "2026-05-09",
        desc: "Harish on approved leave. Please reassign any critical tasks.",
        user: users.harish.id, color: "#10b981",
      },
      {
        title: "Sprint 7 Demo Day",
        type: "milestone",
        start: "2026-05-02", end: "2026-05-02",
        desc: "Sprint 7 demo and retrospective with the full team.",
        user: users.nishanth.id, color: "#f59e0b",
      },
      {
        title: "HDFC Bank RFP Deadline",
        type: "deadline",
        start: "2026-05-08", end: "2026-05-08",
        desc: "HDFC Bank RFP response submission deadline. No extensions.",
        user: users.ayush.id, color: "#ef4444",
      },
      {
        title: "Sprint 8 Planning",
        type: "event",
        start: "2026-05-05", end: "2026-05-05",
        desc: "Plan Sprint 8 deliverables and capacity allocation.",
        user: users.nishanth.id, color: "#6366f1",
      },
      {
        title: "Rohith — Travel to Bangalore Office",
        type: "travel",
        start: "2026-04-28", end: "2026-05-03",
        desc: "Rohith working from Bangalore office. Reduced hours (6h/day due to travel).",
        user: users.rohith.id, color: "#8b5cf6",
      },
      {
        title: "QBR with Leadership",
        type: "meeting",
        start: "2026-05-06", end: "2026-05-06",
        desc: "Quarterly Business Review with SVP and regional heads.",
        user: users.nishanth.id, color: "#0ea5e9",
      },
    ];

    for (const ev of EVENTS) {
      await client.query(
        `INSERT INTO calendar_events
           (workspace_id, user_id, title, type, start_date, end_date, description, color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [wsId, ev.user, ev.title, ev.type, ev.start, ev.end || null, ev.desc, ev.color]
      );
    }
    console.log(`  ✓ Created ${EVENTS.length} calendar events`);

    await client.query("COMMIT");

    // ── Summary ────────────────────────────────────────────────────────────────
    console.log("\n✅ All dummy data seeded successfully!\n");
    console.log("┌─────────────────────────────────────────────────────────┐");
    console.log("│  Seeded Data Summary                                    │");
    console.log("├─────────────────────────────────────────────────────────┤");
    console.log(`│  Tasks:         ${String(createdTasks.length).padEnd(39)}│`);
    console.log(`│  Subtasks:      ${String(subtaskCount).padEnd(39)}│`);
    console.log(`│  Comments:      ${String(commentCount).padEnd(39)}│`);
    console.log(`│  Calendar:      ${String(EVENTS.length).padEnd(39)}│`);
    console.log(`│  Sprint:        Sprint 7 — Q2 Enterprise Push           │`);
    console.log(`│  Capacity:      Rohith (travel), Harish (leave May 5–9) │`);
    console.log("└─────────────────────────────────────────────────────────┘\n");
    console.log("Login at http://localhost:5173 with:");
    console.log("  nishanth.shetty@subex.com / Subex@2024!  (Manager)");
    console.log("  ayush.sharma@subex.com    / Subex@2024!  (Analyst)\n");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Seeding failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
