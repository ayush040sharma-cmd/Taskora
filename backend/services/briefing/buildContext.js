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
      priorities: [],
      attention: [],
      projection: { sprint_confidence_now: null, sprint_confidence_if_done: null },
      suppress: true,
      suppress_reason: "no_workspace",
    });
  }

  const [headline, priorities, attention, projection] = await Promise.all([
    buildHeadline(userId, workspaceIds, localDate, type),
    buildPriorities(userId, workspaceIds, localDate),
    persona === "manager" ? buildAttention(userId, workspaceIds, localDate) : Promise.resolve([]),
    buildProjection(workspaceIds, localDate),
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
    headline,
    priorities,
    attention,
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
    `SELECT value FROM metric_snapshots
     WHERE user_id = $1 AND workspace_id = $2 AND metric = 'execution_score' AND local_date = $3::date`,
    [userId, workspaceId, localDate]
  );
  let executionScore = snapR.rows[0] ? parseFloat(snapR.rows[0].value) : null;
  if (executionScore === null) {
    const live = await computeExecutionScore(pool, { userId, workspaceId, localDate });
    executionScore = live.value;
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
    execution_score: executionScore,
    execution_score_delta: executionScoreDelta,
    focus_time_minutes: focusTimeMinutes,
    meetings: meetingsR.rows[0]?.n || 0,
    high_risk_tasks: riskR.rows[0]?.n || 0,
    blocked_tasks: blockedR.rows[0]?.n || 0,
  };
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
    reason_codes: t.reason_codes,
    reason_params: t.reason_params,
  }));
}

/**
 * Manager persona only. v1: flags overloaded teammates from today's
 * workload_logs. suggested_action is intentionally always null for now —
 * a real "who should take this" suggestion would duplicate
 * backend/routes/simulate.js's /suggest engine; wiring that in is a
 * follow-up, not done here.
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
