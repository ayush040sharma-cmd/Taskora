/**
 * AI Execution Brain — Rule-Based Risk & Delay Prediction Engine
 *
 * Spec (Section B): Rule-based heuristics first.
 * All predictions include: risk_score, delay_probability, confidence_score,
 * risk_level, reasoning, suggestions, ai_fallback flag.
 *
 * This module NEVER blocks the request — it returns synchronously.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const RISK_LEVELS = {
  low:      { min: 0,   max: 24 },
  medium:   { min: 25,  max: 49 },
  high:     { min: 50,  max: 74 },
  critical: { min: 75,  max: 100 },
};

function riskLevel(score) {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

// ── Feature extraction ────────────────────────────────────────────────────────

function extractFeatures(task, assigneeLoad = null, workspaceMeta = null) {
  const now = new Date();
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const daysUntilDue = dueDate
    ? Math.floor((dueDate - now) / (1000 * 60 * 60 * 24))
    : null;

  const createdAt = task.created_at ? new Date(task.created_at) : now;
  const updatedAt = task.updated_at ? new Date(task.updated_at) : createdAt;
  const daysSinceUpdate = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24));
  const createdDaysAgo  = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

  const progress = Math.min(100, Math.max(0, task.progress || 0));
  const completionPct = progress / 100;

  const estimatedHours = parseFloat(task.estimated_hours) || null;
  const actualHours    = parseFloat(task.actual_hours)    || 0;

  const priorityScore = {
    critical: 1.0, high: 0.75, medium: 0.5, low: 0.25,
  }[task.priority] || 0.5;

  // Assignee load metrics
  const assigneeLoadPct      = assigneeLoad?.load_percent      ?? null;
  const assigneeCapacityHours = assigneeLoad?.daily_capacity   ?? 8;
  const assigneeOnLeave       = assigneeLoad?.on_leave         ?? false;
  const assigneeTravelMode    = assigneeLoad?.travel_mode      ?? false;

  const blockingDeps = parseInt(task.blocking_dep_count) || 0;
  const isWeekendDue = dueDate ? (dueDate.getDay() === 0 || dueDate.getDay() === 6) : false;

  return {
    daysUntilDue,
    estimatedHours,
    actualHours,
    completionPct,
    blockingDeps,
    priorityScore,
    assigneeLoadPct,
    assigneeCapacityHours,
    assigneeOnLeave,
    assigneeTravelMode,
    daysSinceUpdate,
    createdDaysAgo,
    isWeekendDue,
    dueDate,
    progress,
  };
}

// ── Core rule engine ──────────────────────────────────────────────────────────

function calculateRiskScore(task, assigneeLoad = null) {
  const f = extractFeatures(task, assigneeLoad);
  let score = 0;
  const reasons = [];
  const suggestions = [];

  // ── Rule 1: Already overdue (+40 pts) ────────────────────────
  if (f.daysUntilDue !== null && f.daysUntilDue < 0) {
    const overdueDays = Math.abs(f.daysUntilDue);
    score += Math.min(40, 30 + overdueDays * 2);
    reasons.push(`Task is ${overdueDays} day${overdueDays !== 1 ? "s" : ""} overdue`);
    suggestions.push("Escalate immediately — task is past due date");
  }

  // ── Rule 2: Due soon with little progress (+35 pts) ──────────
  else if (f.daysUntilDue !== null && f.daysUntilDue <= 2 && f.completionPct < 0.2) {
    score += 35;
    reasons.push(`Due in ${f.daysUntilDue === 0 ? "today" : `${f.daysUntilDue} day${f.daysUntilDue !== 1 ? "s" : ""}`} with only ${Math.round(f.completionPct * 100)}% progress`);
    suggestions.push("Prioritize immediately or adjust the deadline");
  }

  // ── Rule 3: Due soon but less critical (+15 pts) ──────────────
  else if (f.daysUntilDue !== null && f.daysUntilDue <= 5 && f.completionPct < 0.5) {
    score += 15;
    reasons.push(`Due in ${f.daysUntilDue} days with ${Math.round(f.completionPct * 100)}% progress`);
    suggestions.push("Increase velocity or consider timeline adjustment");
  }

  // ── Rule 4: Assignee overloaded (+25 pts) ────────────────────
  if (f.assigneeLoadPct !== null && f.assigneeLoadPct > 100) {
    score += 25;
    reasons.push(`Assignee is overloaded (${f.assigneeLoadPct}% load)`);
    suggestions.push("Reassign task or reduce assignee's other work first");
  } else if (f.assigneeLoadPct !== null && f.assigneeLoadPct > 80) {
    score += 12;
    reasons.push(`Assignee is near capacity (${f.assigneeLoadPct}% load)`);
    suggestions.push("Monitor assignee capacity closely this week");
  }

  // ── Rule 5: Assignee on leave (+30 pts) ──────────────────────
  if (f.assigneeOnLeave) {
    score += 30;
    reasons.push("Assignee is currently on leave");
    suggestions.push("Reassign task to an available team member immediately");
  }

  // ── Rule 6: Blocking dependencies (+20 pts each, max 40) ─────
  if (f.blockingDeps > 0) {
    const depScore = Math.min(40, f.blockingDeps * 20);
    score += depScore;
    reasons.push(`${f.blockingDeps} unresolved blocking dependenc${f.blockingDeps === 1 ? "y" : "ies"}`);
    suggestions.push(`Resolve the ${f.blockingDeps} blocking task${f.blockingDeps !== 1 ? "s" : ""} first`);
  }

  // ── Rule 7: High estimated hours + short runway (+15 pts) ────
  if (f.estimatedHours && f.estimatedHours > 16 && f.daysUntilDue !== null && f.daysUntilDue < 3) {
    score += 15;
    reasons.push(`High-effort task (${f.estimatedHours}h) with only ${f.daysUntilDue} days remaining`);
    suggestions.push("Consider splitting task or extending deadline");
  }

  // ── Rule 8: Stale — no update in 5+ days + not done (+10 pts)
  if (f.daysSinceUpdate >= 5 && f.completionPct < 1) {
    score += 10;
    reasons.push(`No progress update in ${f.daysSinceUpdate} days`);
    suggestions.push("Check in with assignee on task status");
  }

  // ── Rule 9: High priority + not started (+10 pts) ────────────
  if (f.priorityScore >= 0.75 && f.completionPct < 0.05 && f.createdDaysAgo >= 2) {
    score += 10;
    reasons.push(`High priority task not yet started (created ${f.createdDaysAgo} days ago)`);
    suggestions.push("Start this task today — high priority work shouldn't wait");
  }

  // ── Rule 10: Weekend due date (+5 pts) ───────────────────────
  if (f.isWeekendDue) {
    score += 5;
    reasons.push("Task due on a weekend");
    suggestions.push("Move deadline to the following Monday");
  }

  // ── Rule 11: Travel mode assignee (+8 pts) ───────────────────
  if (f.assigneeTravelMode && !f.assigneeOnLeave) {
    score += 8;
    reasons.push("Assignee is in travel mode (reduced capacity)");
    suggestions.push("Account for reduced capacity during travel period");
  }

  score = Math.min(100, score);
  const level = riskLevel(score);

  // Delay probability: sigmoid-like mapping from risk score
  const delayProb = Math.min(0.99, Math.round((score / 100) * 0.95 * 1000) / 1000);

  // Confidence: higher when we have more data points
  const dataPoints = [
    f.daysUntilDue !== null,
    f.estimatedHours !== null,
    f.assigneeLoadPct !== null,
    f.completionPct > 0,
    f.blockingDeps >= 0,
  ].filter(Boolean).length;
  const confidence = Math.min(0.95, 0.5 + dataPoints * 0.08);

  // Cap suggestions at 3
  const finalSuggestions = [...new Set(suggestions)].slice(0, 3);

  return {
    risk_score:        score,
    risk_level:        level,
    delay_probability: delayProb,
    confidence_score:  Math.round(confidence * 100) / 100,
    reasoning:         reasons.length > 0 ? reasons.join(" | ") : "No significant risk factors detected",
    suggestions:       finalSuggestions,
    ai_fallback:       true,
    model_version:     "v1-rules",
  };
}

// ── Batch analysis for a workspace ───────────────────────────────────────────

/**
 * Analyze all active tasks in a workspace.
 * Returns array of { task_id, ...prediction }
 */
function analyzeWorkspaceTasks(tasks, workloadData = []) {
  // Build a map of user_id → workload info
  const loadMap = {};
  workloadData.forEach(u => { loadMap[u.user_id] = u; });

  return tasks
    .filter(t => t.status !== "done")
    .map(task => {
      const assigneeLoad = task.assigned_user_id ? loadMap[task.assigned_user_id] : null;
      const prediction   = calculateRiskScore(task, assigneeLoad);
      return {
        task_id: task.id,
        title:   task.title,
        ...prediction,
      };
    })
    .sort((a, b) => b.risk_score - a.risk_score);
}

// ── Project health score ──────────────────────────────────────────────────────

/**
 * Compute a 0–100 health score for a workspace based on task states.
 */
function calculateProjectHealth(tasks, workloadData = []) {
  const active = tasks.filter(t => t.status !== "done");
  if (active.length === 0) return { health_score: 100, at_risk_count: 0, message: "All tasks complete" };

  const loadMap = {};
  workloadData.forEach(u => { loadMap[u.user_id] = u; });

  let totalRisk = 0;
  let atRisk = 0;
  let overdue = 0;

  active.forEach(task => {
    const assigneeLoad = task.assigned_user_id ? loadMap[task.assigned_user_id] : null;
    const pred = calculateRiskScore(task, assigneeLoad);
    totalRisk += pred.risk_score;
    if (pred.risk_score >= 50) atRisk++;
    if (task.due_date && new Date(task.due_date) < new Date()) overdue++;
  });

  const avgRisk    = totalRisk / active.length;
  const healthScore = Math.max(0, Math.round(100 - avgRisk * 0.7 - (overdue / active.length) * 30));

  const message =
    healthScore >= 80 ? "On track" :
    healthScore >= 60 ? "Needs attention" :
    healthScore >= 40 ? "At risk" : "Critical — immediate action required";

  return {
    health_score:  healthScore,
    at_risk_count: atRisk,
    overdue_count: overdue,
    active_tasks:  active.length,
    avg_risk:      Math.round(avgRisk),
    message,
  };
}

// ── Team stress score ─────────────────────────────────────────────────────────

function calculateTeamStress(workloadData) {
  if (!workloadData.length) return { stress_score: 0, overloaded_count: 0 };
  const overloaded = workloadData.filter(u => u.load_percent > 100).length;
  const avgLoad    = workloadData.reduce((s, u) => s + (u.load_percent || 0), 0) / workloadData.length;
  const stress     = Math.min(100, Math.round(avgLoad * 0.6 + (overloaded / workloadData.length) * 40 * 100));
  return {
    stress_score:      stress,
    overloaded_count:  overloaded,
    avg_load:          Math.round(avgLoad),
  };
}

// ── Prescriptive suggestions ──────────────────────────────────────────────────

/**
 * Given a list of task predictions and workload data, generate
 * high-level prescriptive actions for the manager.
 */
function generatePrescriptiveAlerts(taskPredictions, workloadData) {
  const alerts = [];

  // Overloaded users with high-risk tasks
  const overloaded = workloadData.filter(u => u.load_percent > 100);
  overloaded.forEach(user => {
    const userTasks = taskPredictions.filter(
      t => t.risk_score >= 50 && workloadData
        .find(u2 => u2.user_id === user.user_id)
    );
    if (userTasks.length > 0) {
      alerts.push({
        type:     "overload_risk",
        severity: "high",
        message:  `${user.name} is overloaded (${user.load_percent}%) with ${userTasks.length} at-risk task${userTasks.length !== 1 ? "s" : ""}`,
        action:   "Reassign or defer some tasks",
        user_id:  user.user_id,
      });
    }
  });

  // Critical tasks
  const critical = taskPredictions.filter(t => t.risk_level === "critical").slice(0, 3);
  critical.forEach(task => {
    alerts.push({
      type:     "critical_task",
      severity: "critical",
      message:  `"${task.title}" is at critical risk (${task.risk_score}/100)`,
      action:   task.suggestions[0] || "Immediate attention required",
      task_id:  task.task_id,
    });
  });

  // Blocked tasks
  const blocked = taskPredictions.filter(t => t.reasoning?.includes("blocking dependenc")).slice(0, 2);
  blocked.forEach(task => {
    alerts.push({
      type:     "blocked_task",
      severity: "medium",
      message:  `"${task.title}" is blocked by unresolved dependencies`,
      action:   "Resolve blocking tasks to unblock this work",
      task_id:  task.task_id,
    });
  });

  return alerts.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity] || 3) - (order[b.severity] || 3);
  });
}

module.exports = {
  calculateRiskScore,
  analyzeWorkspaceTasks,
  calculateProjectHealth,
  calculateTeamStress,
  generatePrescriptiveAlerts,
  extractFeatures,
};
