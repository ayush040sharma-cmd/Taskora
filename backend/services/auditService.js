/**
 * Audit Log Service
 * Writes immutable audit records for key actions.
 */

const pool = require("../db");

/**
 * Log an action.
 * @param {object} opts
 * @param {number} opts.workspace_id
 * @param {number} opts.actor_id     — user performing the action
 * @param {string} opts.action       — e.g. 'task_assigned'
 * @param {string} opts.target_type  — e.g. 'task'
 * @param {number} opts.target_id
 * @param {object} [opts.meta]       — additional JSON context
 */
async function audit({ workspace_id, actor_id, action, target_type, target_id, meta = {} }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (workspace_id, actor_id, action, target_type, target_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [workspace_id, actor_id, action, target_type, target_id, JSON.stringify(meta)]
    );
  } catch (err) {
    // Never let audit failures break the main flow
    console.error("Audit log error:", err.message);
  }
}

module.exports = { audit };
