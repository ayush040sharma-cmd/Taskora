/**
 * Audit Log Service
 * Writes immutable audit records for key actions.
 * Never throws — audit failures must never break main flow.
 */

const pool = require("../db");

async function audit({ workspace_id, actor_id, action, target_type, target_id, meta = {} }) {
  try {
    // Try the full schema first
    await pool.query(
      `INSERT INTO audit_logs (workspace_id, actor_id, action, target_type, target_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [workspace_id || null, actor_id, action, target_type || null, target_id || null, JSON.stringify(meta)]
    );
  } catch (err) {
    // Table might use different column names (user_id/details) — try alternate schema
    try {
      await pool.query(
        `INSERT INTO audit_logs (workspace_id, user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workspace_id || null, actor_id, action, target_type || null, target_id || null, JSON.stringify(meta)]
      );
    } catch {
      // Silently ignore — audit is non-critical
      console.warn("Audit log skipped:", action);
    }
  }
}

module.exports = { audit };
