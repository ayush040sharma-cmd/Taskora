/**
 * Audit Log Routes
 * GET /api/audit?workspace_id&limit&offset
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
  const { workspace_id, limit = 50, offset = 0 } = req.query;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id required" });
  try {
    const r = await pool.query(
      `SELECT al.*, u.name AS actor_name, u.email AS actor_email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE al.workspace_id=$1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [workspace_id, Math.min(parseInt(limit), 200), parseInt(offset)]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
