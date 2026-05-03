/**
 * Alert Service — logs security events to DB and pushes real-time notifications
 * via Socket.io to any connected admin/dashboard client.
 */
const pool   = require("../db");
const logger = require("../utils/logger");

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

class AlertService {
  constructor() {
    this._io = null;
  }

  /** Call once after Socket.io is initialised in server.js */
  setIO(io) {
    this._io = io;
  }

  /**
   * Write an event to security_events and push it to all connected clients.
   */
  async logEvent({ ip, method, url, threat_type, severity, details, user_id, user_agent, blocked = false }) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO security_events
           (ip, method, url, threat_type, severity, details, user_id, user_agent, blocked)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [ip, method, url, threat_type, severity,
         JSON.stringify(details || {}), user_id || null, user_agent || null, blocked]
      );
      const event = rows[0];

      // Push to every connected socket (dashboard listens on "security:threat")
      if (this._io) this._io.emit("security:threat", event);

      logger.warn(`[FIREWALL] ${severity.toUpperCase()} | ${threat_type} | ${ip} → ${method} ${url}`);
      return event;
    } catch (err) {
      logger.error(`AlertService.logEvent failed: ${err.message}`);
      return null;
    }
  }

  /** Returns true if the IP is actively blocked (not expired). */
  async isBlocked(ip) {
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM blocked_ips
         WHERE ip = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
        [ip]
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Add or refresh an IP block.
   * @param {string} ip
   * @param {string} reason
   * @param {string} blockedBy — "auto" or "admin:<userId>"
   * @param {number|null} durationHours — null = permanent
   */
  async blockIP(ip, reason, blockedBy = "auto", durationHours = null) {
    try {
      const expiresAt = durationHours
        ? new Date(Date.now() + durationHours * 3_600_000).toISOString()
        : null;

      await pool.query(
        `INSERT INTO blocked_ips (ip, reason, blocked_by, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (ip) DO UPDATE
           SET reason     = EXCLUDED.reason,
               blocked_at = NOW(),
               blocked_by = EXCLUDED.blocked_by,
               expires_at = EXCLUDED.expires_at`,
        [ip, reason, blockedBy, expiresAt]
      );

      if (this._io) this._io.emit("security:blocked", { ip, reason, blockedBy, expiresAt });
      logger.warn(`[FIREWALL] Blocked IP ${ip} (${blockedBy}): ${reason}`);
    } catch (err) {
      logger.error(`AlertService.blockIP failed: ${err.message}`);
    }
  }

  async unblockIP(ip) {
    await pool.query("DELETE FROM blocked_ips WHERE ip = $1", [ip]);
    if (this._io) this._io.emit("security:unblocked", { ip });
    logger.info(`[FIREWALL] Unblocked IP: ${ip}`);
  }

  /** Worst severity from an array of threat objects */
  static worstSeverity(threats) {
    return threats.reduce((best, t) =>
      SEVERITY_RANK[t.severity] < SEVERITY_RANK[best.severity] ? t : best
    );
  }
}

module.exports = new AlertService();
