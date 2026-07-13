/**
 * One-click email action flow — docs/briefing-engine-plan.md §7.1.
 * NEVER MUTATE ON GET: Outlook Safe Links, Gmail's link proxy, and
 * corporate mail scanners pre-fetch every URL in an email. The GET route
 * below only reads; the mutation only happens from the POST .../confirm
 * route, which additionally requires the confirming user's own session —
 * the token proves what was suggested, the session proves who's confirming.
 */
const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const pool    = require("../db");
const logger  = require("../utils/logger");
const { verifyActionToken, consumeActionToken } = require("../services/briefing/actionToken");

// ── GET /api/briefing-actions/:token ──────────────────────────────────────────
// Read-only — safe for a link-prefetcher to hit. Returns just enough for the
// frontend confirm sheet to render; does not perform params.kind's action.
router.get("/:token", auth, async (req, res) => {
  try {
    const { action } = await verifyActionToken(req.params.token);
    res.json({ kind: action.kind, params: action.params, run_id: action.run_id });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// ── POST /api/briefing-actions/:token/confirm ─────────────────────────────────
router.post("/:token/confirm", auth, async (req, res) => {
  try {
    const { decoded, action } = await verifyActionToken(req.params.token);
    if (decoded.userId !== req.user.id) {
      return res.status(403).json({ message: "This action isn't addressed to you" });
    }

    const result = await performAction(action.kind, action.params, req.user.id);
    await consumeActionToken(decoded.jti);

    res.json({ ok: true, result });
  } catch (e) {
    logger.error("Briefing action confirm failed", { error: e.message });
    res.status(400).json({ message: e.message });
  }
});

/**
 * No current briefing content issues REASSIGN/APPROVE tokens yet —
 * services/briefing/buildContext.js's buildAttention() intentionally leaves
 * suggested_action null for now (documented there). This is real, working
 * infrastructure ahead of its caller: OPEN_TASK/REVIEW_BLOCKER work today
 * (pure navigation, no mutation needed), REASSIGN/APPROVE are ready for
 * when a future pass wires suggested_action generation into Phase 2.
 */
async function performAction(kind, params, actingUserId) {
  switch (kind) {
    case "OPEN_TASK":
    case "REVIEW_BLOCKER":
      return { task_id: params.task_id }; // navigation only, no mutation

    case "REASSIGN": {
      const r = await pool.query(
        `UPDATE tasks SET assigned_user_id = $1 WHERE id = $2 RETURNING id`,
        [params.to_user_id, params.task_id]
      );
      if (!r.rows.length) throw new Error("Task not found");
      return { task_id: r.rows[0].id, reassigned_to: params.to_user_id };
    }

    case "APPROVE": {
      const r = await pool.query(
        `UPDATE approvals SET status = 'approved', approver_id = $1, resolved_at = NOW()
         WHERE id = $2 AND status = 'pending' RETURNING id`,
        [actingUserId, params.approval_id]
      );
      if (!r.rows.length) throw new Error("Approval not found or already resolved");
      return { approval_id: r.rows[0].id };
    }

    default:
      throw new Error(`Unknown action kind: ${kind}`);
  }
}

module.exports = router;
