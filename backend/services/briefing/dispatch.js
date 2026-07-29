const pool   = require("../../db");
const logger = require("../../utils/logger");
const { buildBriefingContext } = require("./buildContext");
const { narrate }              = require("./narrate");
const { renderBriefingEmail }  = require("./renderEmail");
const { sendEmail }            = require("../emailService");

const MAX_ATTEMPTS = 3;

/**
 * Send (or record-as-suppressed) one briefing for one user/brief_type/day.
 *
 * Idempotent by design: relies on briefing_runs' UNIQUE(user_id, brief_type,
 * local_date) (schema-v14.sql) — a row already in 'sent' or 'suppressed'
 * state is a no-op. Safe to call from both the in-process cron
 * (agentRunner.js) and the external dead-man's-switch tick endpoint
 * (routes/internal.js) without risking a double-send if both fire close
 * together.
 */
async function dispatchOne(userId, briefType, localDate) {
  const existingR = await pool.query(
    `SELECT id, status FROM briefing_runs WHERE user_id=$1 AND brief_type=$2 AND local_date=$3::date`,
    [userId, briefType, localDate]
  );
  if (existingR.rows.length && ["sent", "suppressed"].includes(existingR.rows[0].status)) {
    return { skipped: true, reason: `already_${existingR.rows[0].status}` };
  }

  const runId = existingR.rows[0]?.id || (await pool.query(
    `INSERT INTO briefing_runs (user_id, brief_type, local_date, status)
     VALUES ($1,$2,$3::date,'generating') RETURNING id`,
    [userId, briefType, localDate]
  )).rows[0].id;

  try {
    const type = briefType.startsWith("morning") ? "morning" : "evening";
    const facts = await buildBriefingContext(userId, type, localDate);

    if (facts.suppress) {
      await pool.query(
        `UPDATE briefing_runs SET status='suppressed', suppress_reason=$1, facts=$2 WHERE id=$3`,
        [facts.suppress_reason, JSON.stringify(facts), runId]
      );
      return { skipped: true, reason: facts.suppress_reason };
    }

    const narration = await narrate(facts);
    const { subject, html, text } = renderBriefingEmail(facts, narration);

    const userR = await pool.query(`SELECT email FROM users WHERE id=$1`, [userId]);
    const toEmail = userR.rows[0]?.email;
    if (!toEmail) throw new Error("user has no email on file");

    const result = await sendEmail({ template: `briefing_${briefType}`, to: toEmail, subject, html, text });
    if (!result.sent) throw new Error(result.error || "send failed");

    await pool.query(
      `UPDATE briefing_runs
       SET status='sent', facts=$1, narration_source=$2, provider_message_id=$3,
           sent_at=NOW(), attempts=attempts+1
       WHERE id=$4`,
      [JSON.stringify(facts), narration.source, result.id || null, runId]
    );
    return { sent: true, runId };
  } catch (e) {
    const attemptsR = await pool.query(`SELECT attempts FROM briefing_runs WHERE id=$1`, [runId]);
    const attempts = (attemptsR.rows[0]?.attempts || 0) + 1;
    // Exponential backoff is enforced by the scheduler's hourly cadence itself
    // (each tick is ~1hr apart) rather than a separate timer — 'queued' means
    // "try again next tick," up to MAX_ATTEMPTS.
    const status = attempts >= MAX_ATTEMPTS ? "failed" : "queued";
    await pool.query(
      `UPDATE briefing_runs SET status=$1, attempts=$2, error=$3 WHERE id=$4`,
      [status, attempts, e.message, runId]
    );
    logger.error("Briefing dispatch failed", { userId, briefType, localDate, error: e.message, attempts });
    return { failed: true, error: e.message, attempts };
  }
}

module.exports = { dispatchOne };
