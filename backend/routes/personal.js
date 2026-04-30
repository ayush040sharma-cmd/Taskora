/**
 * Personal Dashboard Route
 * GET /api/personal/dashboard?workspace_id=X
 *
 * Returns everything needed for the Personal Execution Dashboard:
 * user info, today focus, next best action, day plan (time-blocked),
 * capacity, risk radar, progress momentum, smart activity feed, and task list.
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");
const wl      = require("../services/workloadEngine");

// ── Scoring ───────────────────────────────────────────────────────────────────

const PRIORITY_WEIGHT = { critical: 40, high: 30, medium: 20, low: 10 };

function urgencyScore(dueDateStr) {
  if (!dueDateStr) return 0;
  const now  = Date.now();
  const due  = new Date(dueDateStr).getTime();
  const diff = (due - now) / (1000 * 60 * 60 * 24); // days
  if (diff < 0)  return 50; // overdue
  if (diff < 1)  return 40; // due today
  if (diff < 2)  return 30; // due tomorrow
  if (diff < 4)  return 20;
  if (diff < 8)  return 10;
  return 5;
}

function scoreTask(task, freeHours) {
  const est = task.estimated_hours
    ? parseFloat(task.estimated_hours)
    : wl.getTaskHours(task.type).avg;
  const fitBonus    = est <= freeHours ? 10 : 0;
  const progressBonus = task.progress > 0 && task.progress < 100 ? 5 : 0;
  return (PRIORITY_WEIGHT[task.priority] || 10) + urgencyScore(task.due_date) + fitBonus + progressBonus;
}

function scoreReason(task, score, freeHours) {
  const est = task.estimated_hours
    ? parseFloat(task.estimated_hours)
    : wl.getTaskHours(task.type).avg;

  if (!task.due_date) {
    return task.priority === "high" || task.priority === "critical"
      ? "High priority — tackle it while you have capacity"
      : "Good moment to make progress on this";
  }

  const diff = (new Date(task.due_date) - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0)  return "Overdue — needs immediate attention";
  if (diff < 1)  return "Due today — must be done before EOD";
  if (diff < 2)  return "Due tomorrow — finish it today to stay safe";
  if (diff < 4)  return "Due soon — best to start now";
  if (est <= freeHours) return "Fits neatly in your remaining capacity today";
  return "High priority — start as early as possible";
}

// ── Time-blocking ─────────────────────────────────────────────────────────────

function buildDayPlan(tasks, dailyHours) {
  const START_HOUR   = 9;
  const LUNCH_START  = 12;
  const LUNCH_END    = 13;
  const MAX_BLOCK    = 4; // max hours per task block

  // Sort by score desc
  const sorted = [...tasks].sort((a, b) => b._score - a._score);

  const plan  = [];
  let cursor  = START_HOUR * 60; // minutes since midnight
  const endMin = (START_HOUR + dailyHours + 1) * 60; // +1 for lunch

  for (const task of sorted) {
    if (cursor >= endMin) break;

    const est   = task.estimated_hours
      ? parseFloat(task.estimated_hours)
      : wl.getTaskHours(task.type).avg;
    const remaining = Math.max(0.5, est * (1 - (task.progress || 0) / 100));
    const alloc  = Math.min(MAX_BLOCK, remaining);
    const allocMin = Math.round(alloc * 60);

    // Skip lunch
    if (cursor < LUNCH_START * 60 && cursor + allocMin > LUNCH_START * 60) {
      cursor = LUNCH_END * 60;
    }
    if (cursor >= endMin) break;

    const startH = Math.floor(cursor / 60);
    const startM = cursor % 60;
    const endCursor = cursor + allocMin;
    const endH   = Math.floor(endCursor / 60);
    const endM   = endCursor % 60;

    const fmt = (h, m) =>
      `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;

    plan.push({
      task_id:    task.id,
      title:      task.title,
      type:       task.type || "task",
      priority:   task.priority || "medium",
      start:      fmt(startH, startM),
      end:        fmt(endH, endM),
      hours:      alloc,
      is_partial: alloc < remaining,
      progress:   task.progress || 0,
    });

    cursor = endCursor;
    // Insert lunch break
    if (cursor > LUNCH_START * 60 && cursor <= LUNCH_END * 60) {
      cursor = LUNCH_END * 60;
    }
  }

  return plan;
}

// ── Risk detection ────────────────────────────────────────────────────────────

function detectRisks(tasks) {
  const now    = Date.now();
  const risks  = [];

  tasks.forEach(task => {
    if (task.status === "done") return;

    // Overdue
    if (task.due_date && new Date(task.due_date).getTime() < now) {
      risks.push({ task, riskType: "overdue", severity: "critical", label: "Overdue" });
      return;
    }

    // Due today
    const daysLeft = task.due_date
      ? (new Date(task.due_date).getTime() - now) / (1000 * 60 * 60 * 24)
      : null;
    if (daysLeft !== null && daysLeft < 1) {
      risks.push({ task, riskType: "due_today", severity: "high", label: "Due today" });
      return;
    }

    // Stuck in progress (no recent activity — using created_at as proxy)
    if (task.status === "inprogress" || task.status === "in_progress") {
      const daysSinceCreated = (now - new Date(task.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreated > 7 && (task.progress || 0) < 20) {
        risks.push({ task, riskType: "stuck", severity: "medium", label: "Stuck" });
        return;
      }
    }

    // High priority with no due date
    if ((task.priority === "high" || task.priority === "critical") && !task.due_date) {
      risks.push({ task, riskType: "no_deadline", severity: "low", label: "No deadline" });
    }

    // Due in 3 days and not started
    if (daysLeft !== null && daysLeft < 3 && (task.progress || 0) === 0) {
      risks.push({ task, riskType: "not_started", severity: "medium", label: "Not started" });
    }
  });

  // Sort: critical first, then high, medium, low
  const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  return risks
    .sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9))
    .slice(0, 8);
}

// ── Main route ────────────────────────────────────────────────────────────────

router.get("/dashboard", auth, async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });

  try {
    const userId = req.user.id;

    // Verify workspace membership
    const memberCheck = await pool.query(
      `SELECT wm.role FROM workspace_members wm
       WHERE wm.workspace_id=$1 AND wm.user_id=$2
       UNION
       SELECT 'owner' FROM workspaces WHERE id=$1 AND user_id=$2`,
      [workspace_id, userId]
    );
    if (!memberCheck.rows.length) {
      return res.status(403).json({ message: "Access denied" });
    }

    // User info
    const userRes = await pool.query(
      "SELECT id, name, email FROM users WHERE id=$1",
      [userId]
    );
    const user = userRes.rows[0];

    // Capacity
    const capRes = await pool.query(
      `SELECT daily_hours, travel_mode, travel_hours, on_leave
       FROM user_capacity WHERE user_id=$1`,
      [userId]
    );
    const cap = capRes.rows[0] || { daily_hours: 8, on_leave: false, travel_mode: false };
    const dailyHours  = wl.effectiveCapacity(cap);
    const nominalHours = parseFloat(cap.daily_hours) || 8;

    // My active tasks in this workspace
    const tasksRes = await pool.query(
      `SELECT t.id, t.title, t.status, t.priority, t.type, t.progress,
              t.due_date, t.estimated_hours, t.final_duration, t.estimated_days,
              t.created_at, t.completed_at, t.sprint_id
       FROM tasks t
       WHERE t.workspace_id=$1
         AND t.assigned_user_id=$2
         AND t.status != 'done'
       ORDER BY t.created_at DESC`,
      [workspace_id, userId]
    );
    const activeTasks = tasksRes.rows;

    // Completed tasks this week and last week
    const now   = new Date();
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // Mon=1…Sun=7
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    weekStart.setHours(0, 0, 0, 0);
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(weekStart.getDate() - 7);

    const doneRes = await pool.query(
      `SELECT id, title, completed_at, created_at, priority, type
       FROM tasks
       WHERE workspace_id=$1 AND assigned_user_id=$2 AND status='done'
       ORDER BY completed_at DESC NULLS LAST
       LIMIT 50`,
      [workspace_id, userId]
    );
    const doneTasks = doneRes.rows;

    const completedThisWeek = doneTasks.filter(t =>
      t.completed_at && new Date(t.completed_at) >= weekStart
    ).length;
    const completedPrevWeek = doneTasks.filter(t =>
      t.completed_at &&
      new Date(t.completed_at) >= prevWeekStart &&
      new Date(t.completed_at) < weekStart
    ).length;

    const trend = completedPrevWeek === 0
      ? (completedThisWeek > 0 ? "up" : "flat")
      : completedThisWeek > completedPrevWeek ? "up"
      : completedThisWeek < completedPrevWeek ? "down"
      : "flat";
    const trendPct = completedPrevWeek > 0
      ? Math.round(((completedThisWeek - completedPrevWeek) / completedPrevWeek) * 100)
      : 0;

    // Today focus stats
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);

    const overdue     = activeTasks.filter(t => t.due_date && new Date(t.due_date) < todayStart);
    const dueToday    = activeTasks.filter(t =>
      t.due_date &&
      new Date(t.due_date) >= todayStart &&
      new Date(t.due_date) <= todayEnd
    );
    const highPri     = activeTasks.filter(t => t.priority === "high" || t.priority === "critical");

    // Capacity usage
    let committedLoad = 0;
    try { committedLoad = wl.dailyCommittedLoad(activeTasks, cap); } catch (e) { committedLoad = 0; }
    const freeHours   = Math.max(0, dailyHours - committedLoad);
    const loadPercent = dailyHours > 0 ? Math.round((committedLoad / dailyHours) * 100) : 0;

    // Score each active task
    const scoredTasks = activeTasks.map(t => ({
      ...t,
      _score: scoreTask(t, freeHours),
    }));

    // Next best action
    const sortedByScore = [...scoredTasks].sort((a, b) => b._score - a._score);
    const nextTask      = sortedByScore[0] || null;
    const nextAction    = nextTask
      ? {
          task:   nextTask,
          score:  nextTask._score,
          reason: scoreReason(nextTask, nextTask._score, freeHours),
        }
      : null;

    // Day plan
    const dayPlan = buildDayPlan(scoredTasks, dailyHours || nominalHours);

    // Risk radar
    const riskRadar = detectRisks(activeTasks);

    // Activity feed — recent completed + status changes (approximate via completed_at)
    const feedItems = [];
    doneTasks.slice(0, 5).forEach(t => {
      feedItems.push({
        message: `Completed: ${t.title}`,
        type:    "completed",
        time:    t.completed_at || t.created_at,
      });
    });
    // Also add recently created active tasks
    activeTasks.slice(0, 3).forEach(t => {
      feedItems.push({
        message: `In progress: ${t.title}`,
        type:    "inprogress",
        time:    t.created_at,
      });
    });
    feedItems.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Tomorrow load estimate (rough)
    const tomorrowLoad = Math.min(100, loadPercent + (overdue.length * 10));

    const attentionCount = overdue.length + dueToday.length + highPri.filter(t => !t.due_date).length;

    res.json({
      user:        { id: user.id, name: user.name, daily_hours: nominalHours, on_leave: !!cap.on_leave, travel_mode: !!cap.travel_mode },
      today_focus: {
        attention_count:   attentionCount,
        due_today_count:   dueToday.length,
        overdue_count:     overdue.length,
        free_hours:        Math.round(freeHours * 10) / 10,
        recommended_task:  nextTask ? nextTask.title : null,
      },
      next_action:  nextAction,
      day_plan:     dayPlan,
      capacity: {
        daily_hours:        nominalHours,
        used_hours:         Math.round(committedLoad * 10) / 10,
        free_hours:         Math.round(freeHours * 10) / 10,
        load_percent:       loadPercent,
        tomorrow_load_pct:  tomorrowLoad,
        tomorrow_overloaded: tomorrowLoad > 90,
        on_leave:           !!cap.on_leave,
        travel_mode:        !!cap.travel_mode,
      },
      risk_radar:   riskRadar,
      progress: {
        completed_week:      completedThisWeek,
        completed_prev_week: completedPrevWeek,
        inprogress:          activeTasks.filter(t => t.status === "inprogress" || t.status === "in_progress").length,
        delayed:             overdue.length,
        trend,
        trend_pct:           trendPct,
      },
      activity_feed: feedItems.slice(0, 10),
      my_tasks:      scoredTasks,
    });
  } catch (err) {
    console.error("personal dashboard error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
