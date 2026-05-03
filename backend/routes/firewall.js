/**
 * Firewall Admin API
 *
 * GET  /api/firewall/events        — paginated security event log
 * GET  /api/firewall/stats         — threat counts by type / severity
 * GET  /api/firewall/blocked-ips   — active blocklist
 * POST /api/firewall/block/:ip     — manually block an IP
 * POST /api/firewall/unblock/:ip   — remove a block
 */
const express      = require("express");
const router       = express.Router();
const pool         = require("../db");
const auth         = require("../middleware/auth");
const alertService = require("../services/alertService");

// ── GET /api/firewall/events ──────────────────────────────────────────────────
router.get("/events", auth, async (req, res) => {
  const { limit = 100, offset = 0, severity, threat_type, ip: filterIp } = req.query;

  try {
    const conditions = [];
    const params     = [];

    if (severity)   { params.push(severity);   conditions.push(`severity    = $${params.length}`); }
    if (threat_type){ params.push(threat_type); conditions.push(`threat_type = $${params.length}`); }
    if (filterIp)   { params.push(filterIp);   conditions.push(`ip          = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count query uses same conditions
    const countParams = [...params];
    const { rows: countRow } = await pool.query(
      `SELECT COUNT(*) FROM security_events ${where}`,
      countParams
    );

    params.push(Math.min(parseInt(limit) || 100, 500), parseInt(offset) || 0);
    const { rows } = await pool.query(
      `SELECT * FROM security_events ${where}
       ORDER BY timestamp DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ events: rows, total: parseInt(countRow[0].count) });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/firewall/stats ───────────────────────────────────────────────────
router.get("/stats", auth, async (req, res) => {
  try {
    const [byType, bySeverity, last24h, blocked, topIPs, recentTrend] = await Promise.all([
      pool.query(
        `SELECT threat_type, COUNT(*)::int AS count
         FROM security_events GROUP BY threat_type ORDER BY count DESC`
      ),
      pool.query(
        `SELECT severity, COUNT(*)::int AS count
         FROM security_events GROUP BY severity`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM security_events WHERE timestamp > NOW() - INTERVAL '24 hours'`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM blocked_ips
         WHERE expires_at IS NULL OR expires_at > NOW()`
      ),
      pool.query(
        `SELECT ip, COUNT(*)::int AS count
         FROM security_events GROUP BY ip ORDER BY count DESC LIMIT 10`
      ),
      pool.query(
        `SELECT DATE_TRUNC('hour', timestamp) AS hour, COUNT(*)::int AS count
         FROM security_events
         WHERE timestamp > NOW() - INTERVAL '24 hours'
         GROUP BY hour ORDER BY hour ASC`
      ),
    ]);

    res.json({
      by_type:      byType.rows,
      by_severity:  bySeverity.rows,
      last_24h:     last24h.rows[0].count,
      blocked_ips:  blocked.rows[0].count,
      top_ips:      topIPs.rows,
      hourly_trend: recentTrend.rows,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/firewall/blocked-ips ────────────────────────────────────────────
router.get("/blocked-ips", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM blocked_ips
       WHERE expires_at IS NULL OR expires_at > NOW()
       ORDER BY blocked_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/firewall/block/:ip ─────────────────────────────────────────────
router.post("/block/:ip", auth, async (req, res) => {
  const { reason = "Manual admin block", duration_hours = null } = req.body;
  await alertService.blockIP(req.params.ip, reason, `admin:${req.user.id}`, duration_hours);
  res.json({ message: "IP blocked" });
});

// ── POST /api/firewall/unblock/:ip ───────────────────────────────────────────
router.post("/unblock/:ip", auth, async (req, res) => {
  await alertService.unblockIP(req.params.ip);
  res.json({ message: "IP unblocked" });
});

module.exports = router;
