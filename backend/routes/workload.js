/**
 * Workload Routes — Phase 4 (hours-based + next-available-slot)
 *
 * GET /api/workload?workspace_id=X   — full team workload with smart allocation data
 * GET /api/workload/users?q=X        — user search for task assignment
 * GET /api/workload/slot/:userId     — next available slot for a specific user
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");
const wl      = require("../services/workloadEngine");

// ── GET /api/workload ─────────────────────────────────────────────────────────
router.get("/", auth, async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });

  try {
    // Verify workspace access
    const ws = await pool.query(
      "SELECT id FROM workspaces WHERE id=$1 AND user_id=$2",
      [workspace_id, req.user.id]
    );
    if (!ws.rows.length) return res.status(403).json({ message: "Access denied" });

    // All active tasks with assignee + capacity info
    const tasks = await pool.query(
      `SELECT t.*,
              u.id        AS uid,
              u.name      AS assignee_name,
              u.email     AS assignee_email,
              u.role      AS assignee_role,
              uc.daily_hours, uc.travel_mode, uc.travel_hours,
              uc.on_leave, uc.max_rfp, uc.max_proposals,
              uc.max_presentations, uc.max_upgrades
       FROM tasks t
       LEFT JOIN users u          ON u.id  = t.assigned_user_id
       LEFT JOIN user_capacity uc ON uc.user_id = u.id
       WHERE t.workspace_id = $1
         AND t.status NOT IN ('done', 'pending_approval')
         AND t.assigned_user_id IS NOT NULL
       ORDER BY t.assigned_user_id, t.created_at`,
      [workspace_id]
    );

    // Group tasks by assignee
    const userMap = {};
    for (const row of tasks.rows) {
      const uid = row.uid;
      if (!userMap[uid]) {
        userMap[uid] = {
          user_id: uid,
          name:    row.assignee_name,
          email:   row.assignee_email,
          role:    row.assignee_role || "member",
          cap: {
            daily_hours:         row.daily_hours        ?? wl.DEFAULT_DAILY_HOURS,
            travel_mode:         row.travel_mode        ?? false,
            travel_hours:        row.travel_hours       ?? 2,
            on_leave:            row.on_leave           ?? false,
            max_rfp:             row.max_rfp            ?? 1,
            max_proposals:       row.max_proposals      ?? 2,
            max_presentations:   row.max_presentations  ?? 2,
            max_upgrades:        row.max_upgrades       ?? 2,
          },
          tasks: [],
        };
      }
      userMap[uid].tasks.push(row);
    }

    const result = Object.values(userMap).map(({ user_id, name, email, role, cap, tasks: userTasks }) => {
      const dailyCap        = wl.effectiveCapacity(cap);
      const totalRemaining  = wl.totalActiveHours(userTasks, dailyCap);
      const totalCapacity   = dailyCap * wl.PLANNING_HORIZON;
      const loadPct         = totalCapacity > 0
        ? Math.min(200, Math.round((totalRemaining / totalCapacity) * 100))
        : 0;

      // Today's committed / free hours
      const allocatedToday  = wl.dailyCommittedLoad(userTasks, cap);
      const remainingToday  = Math.max(0, Math.round((dailyCap - allocatedToday) * 10) / 10);

      // Spec: Green < 80%, Yellow 80-100%, Red > 100%
      const status = cap.on_leave   ? "on_leave"
                   : loadPct > 100  ? "overloaded"
                   : loadPct >= 80  ? "moderate"
                   :                  "available";

      // Next available slot (queue clear)
      const slot = wl.nextAvailableSlot(userTasks, cap);

      // Daily load breakdown by task type
      const loadBreakdown = wl.dailyLoadBreakdown(userTasks, cap);

      // Enrich each task with its hours contribution
      const enrichedTasks = userTasks.map(t => ({
        id:              t.id,
        title:           t.title,
        type:            t.type    || "task",
        status:          t.status,
        priority:        t.priority,
        progress:        t.progress     || 0,
        due_date:        t.due_date,
        estimated_days:  t.estimated_days,
        final_duration:  t.final_duration,
        remaining_hours: Math.round(wl.remainingHours(t, dailyCap) * 10) / 10,
        type_hours:      wl.getTaskHours(t.type).avg,
      }));

      return {
        user_id,
        name,
        email,
        role,
        // ── capacity ────────────────────────────────
        total_hours:     dailyCap,
        allocated_hours: allocatedToday,
        remaining_hours: remainingToday,
        load_percent:    loadPct,
        total_remaining_hours: Math.round(totalRemaining * 10) / 10,
        status,
        travel_mode:     cap.travel_mode,
        on_leave:        cap.on_leave,
        // ── next available slot ──────────────────────
        next_available_date:    slot.date ? slot.date.toISOString().split('T')[0] : null,
        days_until_free:        slot.daysFromNow,
        next_available_message: slot.message,
        // ── tasks ────────────────────────────────────
        task_count:      userTasks.length,
        load_breakdown:  loadBreakdown,
        tasks:           enrichedTasks,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("Workload error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/workload/users?q=X ───────────────────────────────────────────────
router.get("/users", auth, async (req, res) => {
  const { q } = req.query;
  try {
    const result = await pool.query(
      `SELECT id, name, email, role FROM users
       WHERE ($1::text IS NULL OR name ILIKE $1 OR email ILIKE $1)
       ORDER BY name LIMIT 20`,
      [q ? `%${q}%` : null]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/workload/slot/:userId ────────────────────────────────────────────
// Returns next available slot for a specific user (used by assignment UI)
router.get("/slot/:userId", auth, async (req, res) => {
  const { workspace_id, task_hours } = req.query;
  const { userId } = req.params;

  try {
    // Get user capacity
    const capRow = await pool.query(
      `SELECT uc.*, u.name, u.email, u.role
       FROM users u
       LEFT JOIN user_capacity uc ON uc.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    if (!capRow.rows.length) return res.status(404).json({ message: "User not found" });

    const row = capRow.rows[0];
    const cap = {
      daily_hours:        row.daily_hours        ?? wl.DEFAULT_DAILY_HOURS,
      travel_mode:        row.travel_mode        ?? false,
      travel_hours:       row.travel_hours       ?? 2,
      on_leave:           row.on_leave           ?? false,
      max_rfp:            row.max_rfp            ?? 1,
      max_proposals:      row.max_proposals      ?? 2,
      max_presentations:  row.max_presentations  ?? 2,
      max_upgrades:       row.max_upgrades       ?? 2,
    };

    // Get their active tasks
    let taskQuery = `
      SELECT * FROM tasks
      WHERE assigned_user_id = $1
        AND status NOT IN ('done', 'pending_approval')`;
    const params = [userId];
    if (workspace_id) {
      taskQuery += ` AND workspace_id = $2`;
      params.push(workspace_id);
    }

    const taskRows = await pool.query(taskQuery, params);
    const newTaskH = task_hours ? parseFloat(task_hours) : 0;

    const slot        = wl.nextAvailableSlot(taskRows.rows, cap, newTaskH);
    const daily       = wl.effectiveCapacity(cap);
    const totalH      = wl.totalActiveHours(taskRows.rows, daily);
    const loadPct     = daily * wl.PLANNING_HORIZON > 0
      ? Math.min(200, Math.round((totalH / (daily * wl.PLANNING_HORIZON)) * 100))
      : 0;

    res.json({
      user_id:               parseInt(userId),
      name:                  row.name,
      email:                 row.email,
      daily_capacity:        daily,
      load_percent:          loadPct,
      total_remaining_hours: Math.round(totalH * 10) / 10,
      active_task_count:     taskRows.rows.length,
      next_available_date:   slot.date ? slot.date.toISOString().split('T')[0] : null,
      days_until_free:       slot.daysFromNow,
      next_available_message: slot.message,
      on_leave:              cap.on_leave,
      travel_mode:           cap.travel_mode,
    });
  } catch (err) {
    console.error("Slot error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
