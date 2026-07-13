/**
 * Inbound webhooks from third-party providers. Never guarded by user auth —
 * each provider has its own verification mechanism instead.
 */
const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const logger  = require("../utils/logger");

// ── POST /api/webhooks/resend ─────────────────────────────────────────────────
// Delivery-event webhook (delivered/opened/clicked/bounced/complained) for
// briefing emails — docs/briefing-engine-plan.md §6.3.
//
// KNOWN GAP: Resend signs these with svix, and that signature is not
// verified here — the `svix` package isn't installed, and adding it is a
// separate dependency decision, not made as part of this pass. Until it's
// added, this endpoint trusts payload *shape* but not *authenticity* —
// don't treat email_events as tamper-proof (e.g. for anything
// billing/security-sensitive) until signature verification is added.
router.post("/resend", express.json(), async (req, res) => {
  try {
    const { type, data } = req.body || {};
    if (!type) return res.status(400).json({ message: "Missing event type" });

    const messageId = data?.email_id || null;
    let runId = null;
    if (messageId) {
      const r = await pool.query(
        `SELECT id FROM briefing_runs WHERE provider_message_id = $1`,
        [messageId]
      );
      runId = r.rows[0]?.id || null;
    }

    const eventName = type.replace(/^email\./, ""); // Resend sends 'email.delivered', etc.
    await pool.query(
      `INSERT INTO email_events (run_id, event, payload) VALUES ($1,$2,$3)`,
      [runId, eventName, JSON.stringify(req.body)]
    );

    if (runId && ["bounced", "complained"].includes(eventName)) {
      await handleAutoSuppression(runId, eventName);
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    logger.error("Resend webhook processing failed", { error: e.message });
    // Ack with 200 anyway — Resend retries on non-2xx, and a bug on our end
    // shouldn't turn into a retry storm against this endpoint.
    res.status(200).json({ ok: true });
  }
});

/**
 * Auto-suppression per docs/briefing-engine-plan.md §6.3: 2 hard bounces or
 * 1 spam complaint turns off briefing_preferences for that user. Protects
 * the sending domain's reputation — this is not optional.
 */
async function handleAutoSuppression(runId, eventName) {
  const runR = await pool.query(`SELECT user_id FROM briefing_runs WHERE id = $1`, [runId]);
  const userId = runR.rows[0]?.user_id;
  if (!userId) return;

  if (eventName === "complained") {
    await suppressUser(userId, "spam complaint");
    return;
  }

  const bounceR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_events ee
     JOIN briefing_runs br ON br.id = ee.run_id
     WHERE br.user_id = $1 AND ee.event = 'bounced'`,
    [userId]
  );
  if ((bounceR.rows[0]?.n || 0) >= 2) {
    await suppressUser(userId, "2+ bounces");
  }
}

async function suppressUser(userId, reason) {
  await pool.query(
    `UPDATE briefing_preferences SET morning_enabled = false, evening_enabled = false WHERE user_id = $1`,
    [userId]
  );
  logger.warn("Briefing auto-suppressed", { userId, reason });
}

module.exports = router;
