const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const pool    = require("../db");

const DEFAULTS = {
  morning_enabled: true, evening_enabled: false,
  send_hour_morning: 8, send_hour_evening: 18,
  weekdays: [1, 2, 3, 4, 5], channel: "email",
};

// GET /api/briefing-preferences — own preferences, or the schema defaults
// if no row exists yet (matches briefing_preferences' DB-level defaults,
// schema-v14.sql).
router.get("/", auth, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM briefing_preferences WHERE user_id = $1`, [req.user.id]);
    res.json(r.rows[0] || { user_id: req.user.id, ...DEFAULTS });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/briefing-preferences — upsert own preferences.
router.put("/", auth, async (req, res) => {
  const {
    morning_enabled   = DEFAULTS.morning_enabled,
    evening_enabled   = DEFAULTS.evening_enabled,
    send_hour_morning = DEFAULTS.send_hour_morning,
    send_hour_evening = DEFAULTS.send_hour_evening,
    weekdays          = DEFAULTS.weekdays,
  } = req.body || {};

  if (!Number.isInteger(send_hour_morning) || send_hour_morning < 0 || send_hour_morning > 23 ||
      !Number.isInteger(send_hour_evening) || send_hour_evening < 0 || send_hour_evening > 23) {
    return res.status(400).json({ message: "send_hour_morning/send_hour_evening must be 0-23" });
  }
  if (!Array.isArray(weekdays) || weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
    return res.status(400).json({ message: "weekdays must be integers 0-6 (0=Sunday)" });
  }

  try {
    const r = await pool.query(
      `INSERT INTO briefing_preferences
         (user_id, morning_enabled, evening_enabled, send_hour_morning, send_hour_evening, weekdays, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         morning_enabled   = EXCLUDED.morning_enabled,
         evening_enabled   = EXCLUDED.evening_enabled,
         send_hour_morning = EXCLUDED.send_hour_morning,
         send_hour_evening = EXCLUDED.send_hour_evening,
         weekdays          = EXCLUDED.weekdays,
         updated_at        = NOW()
       RETURNING *`,
      [req.user.id, morning_enabled, evening_enabled, send_hour_morning, send_hour_evening, weekdays]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
