/**
 * Calendar Events Routes
 * GET    /api/calendar?workspace_id&year&month  — events for a month
 * GET    /api/calendar/range?workspace_id&start&end — events in date range
 * POST   /api/calendar                           — create event
 * PUT    /api/calendar/:id                       — update event
 * DELETE /api/calendar/:id                       — delete event
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");

// ── Helper: visible by member ─────────────────────────────────
// Events visible if: workspace match OR personal (user_id match)
const EVENT_COLS = `
  ce.id, ce.workspace_id, ce.user_id, ce.title, ce.description,
  ce.start_date, ce.end_date, ce.type, ce.color, ce.task_id, ce.all_day,
  ce.created_at, u.name AS created_by_name,
  t.title AS task_title, t.status AS task_status
`;

// ── GET /api/calendar?workspace_id&year&month ────────────────
router.get("/", auth, async (req, res) => {
  const { workspace_id, year, month } = req.query;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });

  // month is 0-indexed on the client (JS Date.getMonth())
  const y = parseInt(year  || new Date().getFullYear());
  const m = parseInt(month !== undefined ? month : new Date().getMonth());

  // Start of the month view (include up to 6 days before for grid)
  const rangeStart = new Date(y, m, 1);
  rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay()); // back to Sunday

  // End of month view
  const rangeEnd = new Date(y, m + 1, 0);
  rangeEnd.setDate(rangeEnd.getDate() + (6 - rangeEnd.getDay())); // forward to Saturday

  try {
    const { rows } = await pool.query(
      `SELECT ${EVENT_COLS}
       FROM calendar_events ce
       LEFT JOIN users u ON u.id = ce.user_id
       LEFT JOIN tasks t ON t.id = ce.task_id
       WHERE ce.workspace_id = $1
         AND ce.start_date <= $3
         AND COALESCE(ce.end_date, ce.start_date) >= $2
       ORDER BY ce.start_date ASC, ce.created_at ASC`,
      [workspace_id, rangeStart.toISOString().split("T")[0], rangeEnd.toISOString().split("T")[0]]
    );

    // Also pull task due-dates as pseudo-events for the same range
    const tasks = await pool.query(
      `SELECT id, title, due_date, priority, type, status, assigned_user_id
       FROM tasks
       WHERE workspace_id = $1
         AND due_date IS NOT NULL
         AND due_date BETWEEN $2 AND $3
         AND status != 'done'`,
      [workspace_id, rangeStart.toISOString().split("T")[0], rangeEnd.toISOString().split("T")[0]]
    );

    res.json({ events: rows, task_deadlines: tasks.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/calendar/range ──────────────────────────────────
router.get("/range", auth, async (req, res) => {
  const { workspace_id, start, end } = req.query;
  if (!workspace_id || !start || !end) {
    return res.status(400).json({ message: "workspace_id, start, end required" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT ${EVENT_COLS}
       FROM calendar_events ce
       LEFT JOIN users u ON u.id = ce.user_id
       LEFT JOIN tasks t ON t.id = ce.task_id
       WHERE ce.workspace_id = $1
         AND ce.start_date <= $3
         AND COALESCE(ce.end_date, ce.start_date) >= $2
       ORDER BY ce.start_date ASC`,
      [workspace_id, start, end]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/calendar ───────────────────────────────────────
router.post("/", auth, async (req, res) => {
  const {
    workspace_id, title, description,
    start_date, end_date, type, color, task_id, all_day,
  } = req.body;

  if (!workspace_id || !title?.trim() || !start_date) {
    return res.status(400).json({ message: "workspace_id, title, start_date required" });
  }

  const TYPE_COLORS = {
    event:     "#6366f1",
    meeting:   "#0ea5e9",
    deadline:  "#ef4444",
    milestone: "#f59e0b",
    leave:     "#10b981",
    travel:    "#8b5cf6",
  };

  const resolvedColor = color || TYPE_COLORS[type] || "#6366f1";

  try {
    const { rows } = await pool.query(
      `INSERT INTO calendar_events
         (workspace_id, user_id, title, description, start_date, end_date, type, color, task_id, all_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        workspace_id, req.user.id, title.trim(), description || null,
        start_date, end_date || null, type || "event", resolvedColor,
        task_id || null, all_day !== false,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/calendar/:id ────────────────────────────────────
router.put("/:id", auth, async (req, res) => {
  const { title, description, start_date, end_date, type, color, task_id, all_day } = req.body;
  try {
    const fields  = { title, description, start_date, end_date, type, color, task_id, all_day };
    const sets    = [];
    const vals    = [];
    Object.entries(fields).forEach(([col, val]) => {
      if (val !== undefined) {
        vals.push(val === "" ? null : val);
        sets.push(`${col} = $${vals.length}`);
      }
    });
    if (!sets.length) return res.status(400).json({ message: "Nothing to update" });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE calendar_events SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE /api/calendar/:id ─────────────────────────────────
router.delete("/:id", auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM calendar_events WHERE id = $1 AND (user_id = $2 OR workspace_id IN (SELECT id FROM workspaces WHERE user_id = $2))",
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ message: "Not found or not authorized" });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
