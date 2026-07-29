/**
 * Ranking engine — docs/briefing-engine-plan.md §4.2.
 *
 * Never sorts by due date alone. Reason codes are a closed enum the LLM
 * narration layer (Phase 3) is only allowed to render, never invent.
 */
const REASON_CODES = [
  "BLOCKS_N_TASKS",
  "RELEASE_DEPENDENCY",
  "WAITING_ON_YOU_XH",
  "BLOCKING_PERSON",
  "OVERDUE_XD",
  "HIGH_RISK",
  "QUICK_WIN",
  "SAFE_TO_DEFER",
  "SPRINT_CRITICAL",
];

/**
 * candidates: array of {
 *   task_id, title, due_date, risk_score, dependency_impact, effort_minutes,
 *   priority, type, waiting_on_you_hours, sprint_critical
 * }
 *
 * score(task) =
 *     0.30 · dependency_impact_norm   — how many people you unblock
 *   + 0.20 · risk_score_norm
 *   + 0.15 · business_value_norm      — priority × task type weight
 *   + 0.15 · deadline_pressure        — clamp(1 / days_to_due, 0, 1)
 *   + 0.10 · waiting_on_you_norm      — PR/approval aging proxy
 *   + 0.10 · effort_fit               — does it fit today's remaining focus time?
 * tie-break: shorter effort first
 */
function rankTasks(candidates, { focusMinutesRemaining = 480 } = {}) {
  if (!candidates.length) return [];

  const maxDepImpact = Math.max(1, ...candidates.map(c => c.dependency_impact || 0));

  const scored = candidates.map(c => {
    const dependencyImpactNorm = (c.dependency_impact || 0) / maxDepImpact;
    const riskNorm             = clamp01((c.risk_score || 0) / 100);
    const businessValueNorm    = businessValueOf(c);
    const deadlinePressure     = deadlinePressureOf(c.due_date);
    const waitingOnYouNorm     = clamp01((c.waiting_on_you_hours || 0) / 48);
    const effortMinutes        = c.effort_minutes ?? 60;
    const effortFit            = focusMinutesRemaining > 0
      ? clamp01(1 - Math.max(0, effortMinutes - focusMinutesRemaining) / focusMinutesRemaining)
      : 0.5;

    const score =
      0.30 * dependencyImpactNorm +
      0.20 * riskNorm +
      0.15 * businessValueNorm +
      0.15 * deadlinePressure +
      0.10 * waitingOnYouNorm +
      0.10 * effortFit;

    const { codes, params } = reasonCodesFor(c);

    return { ...c, score, reason_codes: codes, reason_params: params };
  });

  scored.sort((a, b) => b.score - a.score || (a.effort_minutes ?? 60) - (b.effort_minutes ?? 60));
  return scored;
}

function reasonCodesFor(c) {
  const codes = [];
  const params = {};

  if ((c.dependency_impact || 0) > 0) {
    codes.push("BLOCKS_N_TASKS");
    params.n = c.dependency_impact;
  }
  if (c.sprint_critical) codes.push("SPRINT_CRITICAL");
  if ((c.risk_score || 0) >= 75) codes.push("HIGH_RISK");

  if (c.due_date) {
    const daysOverdue = Math.floor((Date.now() - new Date(c.due_date).getTime()) / 86400000);
    if (daysOverdue > 0) {
      codes.push("OVERDUE_XD");
      params.days = daysOverdue;
    }
  }
  if ((c.waiting_on_you_hours || 0) >= 4) {
    codes.push("WAITING_ON_YOU_XH");
    params.hours = Math.round(c.waiting_on_you_hours);
  }
  if ((c.effort_minutes ?? 60) <= 30 && !codes.length) codes.push("QUICK_WIN");
  if (!codes.length) codes.push("SAFE_TO_DEFER");

  return { codes, params };
}

function businessValueOf(c) {
  const priorityWeight = { high: 1, medium: 0.6, low: 0.3 }[c.priority] || 0.5;
  const typeWeight = ["rfp", "proposal", "upgrade"].includes(c.type) ? 1 : 0.7;
  return clamp01(priorityWeight * typeWeight);
}

function deadlinePressureOf(dueDate) {
  if (!dueDate) return 0;
  const daysToDue = (new Date(dueDate).getTime() - Date.now()) / 86400000;
  if (daysToDue <= 0) return 1; // already due/overdue — max pressure
  return clamp01(1 / daysToDue);
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

module.exports = { rankTasks, REASON_CODES };
