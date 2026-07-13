/**
 * Internal system endpoints — never reachable by normal user auth, guarded
 * by a shared secret instead (X-Internal-Secret header vs INTERNAL_TICK_SECRET).
 */

const express   = require("express");
const crypto    = require("crypto");
const rateLimit = require("express-rate-limit");
const router    = express.Router();
const logger    = require("../utils/logger");
const { runSchedulerTick } = require("../services/briefing");

const tickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests." },
});

function verifyInternalSecret(req, res, next) {
  const configured = process.env.INTERNAL_TICK_SECRET;
  const provided    = req.headers["x-internal-secret"];

  if (!configured) {
    logger.error("INTERNAL_TICK_SECRET is not set — refusing internal tick request");
    return res.status(503).json({ message: "Internal endpoint not configured" });
  }
  if (
    !provided ||
    provided.length !== configured.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(configured))
  ) {
    logger.warn("Internal tick request rejected: bad or missing X-Internal-Secret", { ip: req.ip });
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

// ── POST /api/internal/briefings/tick ─────────────────────────────────────────
// Dead-man's-switch entry point for the daily briefing scheduler — meant to be
// hit by an external cron (GitHub Actions or cron-job.org; see
// .github/workflows/keepalive.yml for the same ping pattern already in use)
// as a fallback alongside the in-process node-cron job in agentRunner.js.
// Both call the exact same runSchedulerTick() — whichever fires first for a
// given user/hour wins, briefing_runs' UNIQUE constraint makes the other a
// harmless no-op.
router.post("/briefings/tick", tickLimiter, verifyInternalSecret, async (req, res) => {
  logger.info("Internal briefings tick received", { ip: req.ip });
  try {
    const result = await runSchedulerTick();
    res.json({ ok: true, received_at: new Date().toISOString(), ...result });
  } catch (e) {
    logger.error("Internal briefings tick failed", { error: e.message });
    res.status(500).json({ ok: false, message: "Scheduler tick failed" });
  }
});

module.exports = router;
