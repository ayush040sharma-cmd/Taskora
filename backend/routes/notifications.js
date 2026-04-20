/**
 * Notifications Routes
 * GET   /api/notifications          — my notifications (unread first)
 * PATCH /api/notifications/:id/read — mark single as read
 * PATCH /api/notifications/read-all — mark all as read
 * GET   /api/notifications/count    — unread count (for badge)
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");

// GET /api/notifications
router.get("/", auth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  try {
    const r = await pool.query(
      `SELECT * FROM notifications WHERE user_id=$1
       ORDER BY read ASC, created_at DESC LIMIT $2`,
      [req.user.id, limit]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/notifications/count
router.get("/count", auth, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND read=FALSE",
      [req.user.id]
    );
    res.json({ count: parseInt(r.rows[0].count) });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", auth, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET read=TRUE WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/notifications/read-all
router.patch("/read-all", auth, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET read=TRUE WHERE user_id=$1 AND read=FALSE",
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
