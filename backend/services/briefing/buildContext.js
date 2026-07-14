const pool   = require("../../db");
const wl     = require("../workloadEngine");
const { computeExecutionScore }              = require("../metrics/executionScore");
const { computeFocusTime }                   = require("../metrics/focusTime");
const { computeDependencyImpact }            = require("../metrics/dependencyImpact");
const { computeSprintConfidence, projectConfidenceIfDone } = require("../metrics/sprintConfidence");
const { todayISODate }                       = require("../metrics/_util");
const { rankTasks }                          = require("./rank");
const { FactsSchema }                        = require("./schema");

const MAX_PRIORITIES = 5;
const SUPPRESS_MIN_TASKS = 3;

/**
 * buildBriefingContext(userId, type, localDate) → validated facts JSON.
 * docs/briefing-engine-plan.md §4.1. This is the only function downstream
 * layers (narration, rendering) may call to get data — no other query paths.
 *
 * `type` is 'morning' | 'evening' — controls whether execution_score_delta
 * is populated (morning: always null, nothing has happened yet today).
 */
async function buildBriefingContext(userId, type, localDate = todayISODate(), { workspaceId } = {}) {
  const userR = await pool.query(
    `SELECT id, name, role, timezone FROM users WHERE id = $1`,
    [userId]
  );
  const user = userR.rows[0];
  if (!user) throw new Error(`User ${userId} not found`);

  const persona = ["manager", "super_boss"].includes(user.role) ? "manager" : "ic";
  const firstName = (user.name || "").split(" ")[0] || user.name || "there";

  const workspaceIds = await resolveWorkspaceIds(userId, workspaceId);

  if (!workspaceIds.length) {
    return validate({
      schema_version: 1,
      persona,
      user: { id: user.id, first_name: firstName, tz: user.timezone || "UTC" },
      date: localDate,
      headline: { execution_score: null, execution_score_delta: null, focus_time_minutes: null, meetings: 0, high_risk_tasks: 0, blocked_tasks: 0 },
      calculation_explainer: null,
      weekly_trend: [],
      risk_prediction: null,
      workload_summary: null,
      priorities: [],
      attention: [],
      projection: { sprint_confidence_now: null, sprint_confidence_if_done: null },
      suppress: true,
      suppress_reason: "no_workspace",
    });
  }

  const [headline, priorities, attention, projection, weeklyTrend, riskPrediction, team] = await Promise.all([
    buildHeadline(userId, workspaceIds, localDate, type),
    buildPriorities(userId, workspaceIds, localDate),
    persona === "manager" ? buildAttention(userId, workspaceIds, localDate) : Promise.resolve([]),
    buildProjection(workspaceIds, localDate),
    buildWeeklyTrend(userId, workspaceIds[0], localDate),
    buildRiskPrediction(userId, workspaceIds, localDate),
    persona === "manager" ? buildTeamSection(userId, workspaceIds, localDate) : Promise.resolve(undefined),
  ]);

  const taskCountR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tasks
     WHERE workspace_id = ANY($1) AND assigned_user_id = $2 AND status != 'done'`,
    [workspaceIds, userId]
  );
  const openTaskCount = taskCountR.rows[0]?.n || 0;

  const suppress = openTaskCount < SUPPRESS_MIN_TASKS || priorities.length === 0;

  return validate({
    schema_version: 1,
    persona,
    user: { id: user.id, first_name: firstName, tz: user.timezone || "UTC" },
    date: localDate,
    headline: headline.headline,
    calculation_explainer: headline.calculation_explainer,
    weekly_trend: weeklyTrend,
    risk_prediction: riskPrediction,
    workload_summary: buildWorkloadSummary(headline.headline),
    priorities,
    attention,
    team,
    projection,
    suppress,
    suppress_reason: suppress ? "insufficient_data" : null,
  });
}

async function resolveWorkspaceIds(userId, explicitWorkspaceId) {
  if (explicitWorkspaceId) return [explicitWorkspaceId];
  const r = await pool.query(
    `SELECT id FROM workspaces WHERE user_id = $1
     UNION
     SELECT workspace_id AS id FROM workspace_members WHERE user_id = $1`,
    [userId]
  );
  return r.rows.map(row => row.id);
}

async function buildHeadline(userId, workspaceIds, localDate, type) {
  const workspaceId = workspaceIds[0]; // execution_score is a single-workspace metric today

  const snapR = await pool.query(
    `SELECT value, inputs FROM metric_snapshots
     WHERE user_id = $1 AND workspace_id = $2 AND metric = 'execution_score' AND local_date = $3::date`,
    [userId, workspaceId, localDate]
  );
  let executionScore = snapR.rows[0] ? parseFloat(snapR.rows[0].value) : null;
  let scoreInputs = snapR.rows[0]?.inputs || null;
  if (executionScore === null) {
    const live = await computeExecutionScore(pool, { userId, workspaceId, localDate });
    executionScore = live.value;
    scoreInputs = live.inputs;
  }

  let executionScoreDelta = null;
  if (type === "evening") {
    const yesterday = shiftDate(localDate, -1);
    const prevR = await pool.query(
      `SELECT value FROM metric_snapshots
       WHERE user_id = $1 AND workspace_id = $2 AND metric = 'execution_score' AND local_date = $3::date`,
      [userId, workspaceId, yesterday]
    );
    if (prevR.rows[0]) {
      executionScoreDelta = Math.round(executionScore - parseFloat(prevR.rows[0].value));
    }
  }

  const focusR = await pool.query(
    `SELECT value FROM metric_snapshots
     WHERE user_id = $1 AND workspace_id = $2 AND metric = 'focus_time_minutes' AND local_date = $3::date`,
    [userId, workspaceId, localDate]
  );
  let focusTimeMinutes = focusR.rows[0] ? parseFloat(focusR.rows[0].value) : null;
  if (focusTimeMinutes === null) {
    const live = await computeFocusTime(pool, { userId, workspaceId, localDate });
    focusTimeMinutes = live.value;
  }

  const meetingsR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM calendar_events
     WHERE workspace_id = ANY($1) AND user_id = $2 AND type = 'meeting'
       AND start_date::date <= $3::date AND end_date::date >= $3::date`,
    [workspaceIds, userId, localDate]
  );

  const riskR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tasks
     WHERE workspace_id = ANY($1) AND assigned_user_id = $2 AND status != 'done' AND risk_score >= 75`,
    [workspaceIds, userId]
  );

  const blockedR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tasks
     WHERE workspace_id = ANY($1) AND assigned_user_id = $2 AND status != 'done'
       AND (status = 'blocked' OR (blocked_by_task_id IS NOT NULL AND unblocked_at IS NULL))`,
    [workspaceIds, userId]
  );

  return {
    headline: {
      execution_score: executionScore,
      execution_score_delta: executionScoreDelta,
      focus_time_minutes: focusTimeMinutes,
      meetings: meetingsR.rows[0]?.n || 0,
      high_risk_tasks: riskR.rows[0]?.n || 0,
      blocked_tasks: blockedR.rows[0]?.n || 0,
    },
    calculation_explainer: buildCalculationExplainer(scoreInputs),
  };
}

/**
 * One sentence explaining the score from its own stored components — never
 * a new number, just plain language about ones that already exist in
 * metric_snapshots.inputs (see services/metrics/executionScore.js for the
 * fixed weights: 35/25/20/20).
 */
function buildCalculationExplainer(inputs) {
  if (!inputs) return null;
  const factors = [
    { label: "task completion", value: inputs.completion_ratio ?? 1 },
    { label: "on-time delivery", value: inputs.on_time_ratio ?? 1 },
    { label: "staying unblocked", value: 1 - (inputs.blocked_ratio ?? 0) },
    { label: "workload balance", value: 1 - (inputs.overload_penalty ?? 0) },
  ];
  const weakest = factors.reduce((a, b) => (b.value < a.value ? b : a));
  return `Based on task completion, on-time delivery, staying unblocked, and workload balance — ${weakest.label} had the most room to improve today.`;
}

/**
 * Up to 7 days of execution_score history (oldest first). Missing days are
 * omitted rather than padded with 0 — a gap in history isn't a bad day, and
 * showing a fake zero would be exactly the kind of fabricated number the
 * hallucination firewall exists to prevent (docs/briefing-engine-plan.md §0)
 * — this just applies the same discipline to the deterministic facts layer.
 */
async function buildWeeklyTrend(userId, workspaceId, localDate) {
  const start = shiftDate(localDate, -6);
  const r = await pool.query(
    `SELECT local_date, value FROM metric_snapshots
     WHERE user_id = $1 AND workspace_id = $2 AND metric = 'execution_score'
       AND local_date BETWEEN $3::date AND $4::date
     ORDER BY local_date ASC`,
    [userId, workspaceId, start, localDate]
  );
  return r.rows.map(row => ({
    value: Math.round(parseFloat(row.value)),
    isToday: isSameDate(row.local_date, localDate),
  }));
}

function isSameDate(dbDate, localDate) {
  const d = new Date(dbDate).toISOString().slice(0, 10);
  return d === localDate;
}

async function buildPriorities(userId, workspaceIds, localDate) {
  const taskR = await pool.query(
    `SELECT t.id, t.title, t.due_date, t.risk_score, t.priority, t.type,
            t.estimated_hours, t.status, t.status_changed_at, t.sprint_id,
            s.end_date AS sprint_end_date
     FROM tasks t
     LEFT JOIN sprints s ON s.id = t.sprint_id AND s.status = 'active'
     WHERE t.workspace_id = ANY($1) AND t.assigned_user_id = $2 AND t.status != 'done'`,
    [workspaceIds, userId]
  );

  const candidates = [];
  for (const t of taskR.rows) {
    const dependencyImpact = await computeDependencyImpact(pool, t.id);
    const effortMinutes = t.estimated_hours
      ? Math.round(parseFloat(t.estimated_hours) * 60)
      : Math.round(wl.getTaskHours(t.type).avg * 60);

    const waitingOnYouHours = ["review", "pending_approval"].includes(t.status) && t.status_changed_at
      ? (Date.now() - new Date(t.status_changed_at).getTime()) / 3600000
      : 0;

    const sprintCritical = Boolean(
      t.sprint_end_date && businessDaysUntil(localDate, t.sprint_end_date) <= 2
    );

    candidates.push({
      task_id: t.id,
      title: t.title,
      due_date: t.due_date,
      risk_score: parseFloat(t.risk_score) || 0,
      priority: t.priority,
      type: t.type,
      dependency_impact: dependencyImpact,
      effort_minutes: effortMinutes,
      waiting_on_you_hours: waitingOnYouHours,
      sprint_critical: sprintCritical,
    });
  }

  const ranked = rankTasks(candidates, { focusMinutesRemaining: 480 }).slice(0, MAX_PRIORITIES);

  return ranked.map((t, i) => ({
    task_id: t.task_id,
    title: t.title,
    stars: Math.max(1, 5 - i), // rank position → 5..1
    effort_minutes: t.effort_minutes,
    due_date: t.due_date ? new Date(t.due_date).toISOString() : null,
    recommended_action: buildRecommendedAction(t, i),
    reason_codes: t.reason_codes,
    reason_params: t.reason_params,
  }));
}

/**
 * Deterministic, not LLM-narrated — same "never fabricate, just template"
 * discipline as the narration layer's fallback path, applied here because
 * this is a per-rank/per-reason-code mapping, not free text generation.
 */
function buildRecommendedAction(task, rankIndex) {
  if (rankIndex === 0) return "Start this first — it has the highest impact today";
  const codes = task.reason_codes || [];
  if (codes.includes("WAITING_ON_YOU_XH")) return "Quick action — someone's waiting on this";
  if (codes.includes("HIGH_RISK") && (task.effort_minutes ?? 60) <= 60) return "Good next task — high risk, small effort";
  if (codes.includes("SPRINT_CRITICAL")) return "Time-sensitive — this affects the sprint goal";
  if (codes.includes("QUICK_WIN")) return "Slot this into a gap between meetings";
  return "Next up when you're ready";
}

/**
 * Tomorrow's risk prediction — deadline density + meeting load. Foresight,
 * not alarm (docs/briefing-engine-plan.md content-redesign spec §8): only
 * fires when there's something genuinely worth planning around, returns
 * null otherwise rather than manufacturing a note to fill the space.
 */
async function buildRiskPrediction(userId, workspaceIds, localDate) {
  const tomorrow = shiftDate(localDate, 1);

  const dueR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tasks
     WHERE workspace_id = ANY($1) AND assigned_user_id = $2 AND status != 'done'
       AND due_date::date = $3::date`,
    [workspaceIds, userId, tomorrow]
  );
  const dueTomorrow = dueR.rows[0]?.n || 0;

  const meetR = await pool.query(
    `SELECT start_time, end_time, all_day FROM calendar_events
     WHERE workspace_id = ANY($1) AND user_id = $2 AND type = 'meeting'
       AND start_date::date <= $3::date AND end_date::date >= $3::date`,
    [workspaceIds, userId, tomorrow]
  );
  let meetingHours = 0;
  for (const ev of meetR.rows) {
    if (ev.all_day || !ev.start_time || !ev.end_time) { meetingHours += ev.all_day ? 8 : 1; continue; }
    meetingHours += timeDiffHours(ev.start_time, ev.end_time);
  }
  meetingHours = Math.round(meetingHours);

  if (dueTomorrow >= 2) {
    const meetingNote = meetingHours >= 2 ? `, and you already have ${meetingHours} hours of meetings booked` : "";
    return `Tomorrow looks tight — ${dueTomorrow} deadlines land the same day${meetingNote}. Consider finishing today's top task to give tomorrow some room.`;
  }
  if (dueTomorrow >= 1 && meetingHours >= 3) {
    return `Tomorrow has a deadline and ${meetingHours} hours of meetings booked — worth planning ahead today.`;
  }
  return null;
}

function timeDiffHours(startStr, endStr) {
  const toMinutes = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const diff = toMinutes(endStr) - toMinutes(startStr);
  return diff > 0 ? diff / 60 : 0;
}

function buildWorkloadSummary(headline) {
  if (headline.focus_time_minutes === null) return null;
  const hours = Math.floor(headline.focus_time_minutes / 60);
  const mins = headline.focus_time_minutes % 60;
  const focusText = mins ? `${hours}h ${mins}m` : `${hours}h`;
  const parts = [
    `${focusText} of focus time available today`,
    `${headline.meetings} meeting${headline.meetings === 1 ? "" : "s"} booked`,
  ];
  if (headline.blocked_tasks > 0) {
    parts.push(`${headline.blocked_tasks} task${headline.blocked_tasks === 1 ? "" : "s"} currently blocked`);
  }
  return parts.join(" · ") + ".";
}

/**
 * Manager persona only. Legacy shape kept as `attention` (schema-guaranteed
 * field, used elsewhere) — buildTeamSection() below computes the richer
 * version for the manager template specifically.
 */
async function buildAttention(userId, workspaceIds, localDate) {
  const r = await pool.query(
    `SELECT u.name, wl.scheduled_hours, wl.capacity_hours
     FROM workload_logs wl
     JOIN users u ON u.id = wl.user_id
     WHERE wl.workspace_id = ANY($1) AND wl.user_id != $2
       AND wl.date = $3::date AND wl.overload_flag = true AND wl.source = 'task'`,
    [workspaceIds, userId, localDate]
  );

  return r.rows.map(row => {
    const cap = parseFloat(row.capacity_hours) || 8;
    const sch = parseFloat(row.scheduled_hours) || 0;
    return {
      type: "OVERLOADED_PEER",
      user: row.name,
      load_pct: Math.round((sch / cap) * 100),
      suggested_action: null,
    };
  });
}

/**
 * Manager persona only — Section B of the manager brief. Never called for
 * an IC (see the Promise.resolve(undefined) branch in
 * buildBriefingContext), and `team` is an optional schema field an IC's
 * facts object never contains.
 */
async function buildTeamSection(userId, workspaceIds, localDate) {
  const workspaceId = workspaceIds[0];

  const teamScoreR = await pool.query(
    `SELECT AVG(value)::numeric(5,1) AS avg_score, COUNT(*)::int AS n
     FROM metric_snapshots
     WHERE workspace_id = $1 AND metric = 'execution_score' AND local_date = $2::date AND user_id IS NOT NULL`,
    [workspaceId, localDate]
  );
  const teamExecutionScore = (teamScoreR.rows[0]?.n || 0) > 0
    ? Math.round(parseFloat(teamScoreR.rows[0].avg_score))
    : null;

  const sprintR = await pool.query(
    `SELECT id, name FROM sprints WHERE workspace_id = ANY($1) AND status = 'active' ORDER BY end_date ASC LIMIT 1`,
    [workspaceIds]
  );
  const sprint = sprintR.rows[0] || null;
  let sprintConfidence = null;
  if (sprint) {
    const snapR = await pool.query(
      `SELECT value FROM metric_snapshots WHERE sprint_id = $1 AND metric = 'sprint_confidence' AND local_date = $2::date`,
      [sprint.id, localDate]
    );
    sprintConfidence = snapR.rows[0] ? Math.round(parseFloat(snapR.rows[0].value)) : null;
  }

  const overloadedR = await pool.query(
    `SELECT u.id, u.name, wl.scheduled_hours, wl.capacity_hours
     FROM workload_logs wl JOIN users u ON u.id = wl.user_id
     WHERE wl.workspace_id = ANY($1) AND wl.user_id != $2
       AND wl.date = $3::date AND wl.overload_flag = true AND wl.source = 'task'
     ORDER BY (wl.scheduled_hours / NULLIF(wl.capacity_hours, 0)) DESC`,
    [workspaceIds, userId, localDate]
  );

  const membersNeedingAttention = [];
  for (const row of overloadedR.rows) {
    const cap = parseFloat(row.capacity_hours) || 8;
    const sch = parseFloat(row.scheduled_hours) || 0;
    const loadPct = Math.round((sch / cap) * 100);

    let riskText = `At ${loadPct}% load`;
    if (sprint) {
      const atRiskR = await pool.query(
        `SELECT COUNT(*)::int AS n FROM tasks
         WHERE sprint_id = $1 AND assigned_user_id = $2 AND status != 'done'
           AND (risk_score >= 60 OR (due_date IS NOT NULL AND due_date < NOW() + INTERVAL '3 days'))`,
        [sprint.id, row.id]
      );
      const atRisk = atRiskR.rows[0]?.n || 0;
      if (atRisk > 0) riskText = `${atRisk} sprint task${atRisk === 1 ? "" : "s"} may get delayed at this pace`;
    }

    const lowPriorityR = await pool.query(
      `SELECT title FROM tasks
       WHERE workspace_id = ANY($1) AND assigned_user_id = $2 AND status = 'todo'
       ORDER BY CASE priority WHEN 'low' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC
       LIMIT 1`,
      [workspaceIds, row.id]
    );
    const recommendation = lowPriorityR.rows[0]
      ? `Consider reassigning "${lowPriorityR.rows[0].title}" or reviewing its deadline`
      : "Redistribute low-priority tasks or review deadlines";

    membersNeedingAttention.push({ user: row.name, load_pct: loadPct, risk_text: riskText, recommendation });
  }

  const depRiskR = await pool.query(
    `SELECT t.id, t.title,
            (SELECT COUNT(*) FROM task_dependencies td WHERE td.depends_on_task_id = t.id)::int AS downstream
     FROM tasks t
     WHERE t.workspace_id = ANY($1) AND t.status = 'blocked'
     ORDER BY downstream DESC LIMIT 1`,
    [workspaceIds]
  );

  const deadlineRiskR = await pool.query(
    `SELECT title, due_date FROM tasks
     WHERE workspace_id = ANY($1) AND status != 'done'
       AND due_date IS NOT NULL AND due_date BETWEEN NOW() AND NOW() + INTERVAL '5 days'
       AND (status_changed_at IS NULL OR status_changed_at < NOW() - INTERVAL '3 days')
     ORDER BY due_date ASC LIMIT 1`,
    [workspaceIds]
  );

  const risks = [];
  if (depRiskR.rows[0] && depRiskR.rows[0].downstream > 0) {
    const d = depRiskR.rows[0];
    risks.push({
      icon: "🔗", label: "Dependency risk",
      text: `"${d.title}" is blocked, and ${d.downstream} other task${d.downstream === 1 ? "" : "s"} can't start until it's resolved.`,
    });
  }
  if (deadlineRiskR.rows[0]) {
    const d = deadlineRiskR.rows[0];
    risks.push({
      icon: "📅", label: "Deadline risk",
      text: `"${d.title}" is due soon with no recent update.`,
    });
  }

  // Resource suggestion reuses the same overload/headroom signal already
  // computed above rather than duplicating routes/simulate.js's assignment
  // engine — a full "best assignee" recommendation should call that engine
  // directly in a future pass instead of this simpler headroom lookup.
  let resourceSuggestion = null;
  if (membersNeedingAttention.length) {
    const most = membersNeedingAttention[0];
    const overloadedIds = overloadedR.rows.map(r => r.id);
    const headroomR = await pool.query(
      `SELECT u.name, wl.scheduled_hours, wl.capacity_hours
       FROM workload_logs wl JOIN users u ON u.id = wl.user_id
       WHERE wl.workspace_id = ANY($1) AND wl.user_id != $2
         AND wl.user_id != ALL($3::int[])
         AND wl.date = $4::date AND wl.source = 'task'
       ORDER BY (wl.scheduled_hours / NULLIF(wl.capacity_hours, 0)) ASC LIMIT 1`,
      [workspaceIds, userId, overloadedIds.length ? overloadedIds : [0], localDate]
    );
    resourceSuggestion = headroomR.rows[0]
      ? `One decision worth making today: move a task from ${most.user} to ${headroomR.rows[0].name}, who has headroom this week.`
      : `${most.user} is overloaded — worth reviewing their task list today.`;
  }

  return {
    execution_score: teamExecutionScore,
    sprint_name: sprint?.name || null,
    sprint_confidence: sprintConfidence,
    members_needing_attention: membersNeedingAttention,
    risks,
    resource_suggestion: resourceSuggestion,
  };
}

async function buildProjection(workspaceIds, localDate) {
  const sprintR = await pool.query(
    `SELECT id, workspace_id FROM sprints WHERE workspace_id = ANY($1) AND status = 'active'
     ORDER BY end_date ASC LIMIT 1`,
    [workspaceIds]
  );
  const sprint = sprintR.rows[0];
  if (!sprint) return { sprint_confidence_now: null, sprint_confidence_if_done: null };

  const snapR = await pool.query(
    `SELECT value, inputs FROM metric_snapshots
     WHERE sprint_id = $1 AND metric = 'sprint_confidence' AND local_date = $2::date`,
    [sprint.id, localDate]
  );

  let now = snapR.rows[0] ? parseFloat(snapR.rows[0].value) : null;
  let inputs = snapR.rows[0]?.inputs || null;

  if (now === null) {
    const live = await computeSprintConfidence(pool, { sprintId: sprint.id, workspaceId: sprint.workspace_id, localDate });
    now = live.value;
    inputs = live.inputs;
  }

  const ifDone = inputs ? projectConfidenceIfDone(inputs, 0) : null; // 0 = no completion assumed yet at build time

  return { sprint_confidence_now: now, sprint_confidence_if_done: ifDone };
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function businessDaysUntil(fromStr, toStr) {
  const from = new Date(fromStr);
  const to = new Date(toStr);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function validate(facts) {
  const result = FactsSchema.safeParse(facts);
  if (!result.success) {
    throw new Error(`Facts failed schema validation: ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
}

module.exports = { buildBriefingContext };
