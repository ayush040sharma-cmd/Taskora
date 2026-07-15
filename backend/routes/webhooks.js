/**
 * Inbound webhooks from third-party providers. Never guarded by user auth —
 * each provider has its own verification mechanism instead.
 */
const express = require("express");
const router  = express.Router();
const { Webhook } = require("svix");
const pool    = require("../db");
const logger  = require("../utils/logger");

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

// ── POST /api/webhooks/resend ─────────────────────────────────────────────────
// Delivery-event webhook (delivered/opened/clicked/bounced/complained) for
// briefing emails — docs/briefing-engine-plan.md §6.3.
//
// Resend signs these with svix. When RESEND_WEBHOOK_SECRET is configured,
// every request is verified against it and rejected on failure (fail
// closed). If the secret isn't set — e.g. local dev, before the endpoint
// is registered in the Resend dashboard — the payload's shape is still
// trusted but not its authenticity; that gap is logged loudly so it's
// never silently the case in an environment where it matters.
router.post("/resend", express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}), async (req, res) => {
  try {
    if (RESEND_WEBHOOK_SECRET) {
      try {
        new Webhook(RESEND_WEBHOOK_SECRET).verify(req.rawBody, {
          "svix-id": req.header("svix-id"),
          "svix-timestamp": req.header("svix-timestamp"),
          "svix-signature": req.header("svix-signature"),
        });
      } catch (verifyErr) {
        logger.warn("Resend webhook signature verification failed", { error: verifyErr.message });
        return res.status(401).json({ message: "Invalid signature" });
      }
    } else {
      logger.warn("RESEND_WEBHOOK_SECRET not set — accepting Resend webhook without signature verification");
    }

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
