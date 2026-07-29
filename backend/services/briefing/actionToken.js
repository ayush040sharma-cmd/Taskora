const jwt    = require("jsonwebtoken");
const crypto = require("crypto");
const pool   = require("../../db");

const TOKEN_TTL_SECONDS = 15 * 60; // 15 min, per docs/briefing-engine-plan.md §7.1

/**
 * Issue a one-click email action. Writes a briefing_actions row (the
 * source of truth for "what does this token authorize") and returns a
 * short-lived, single-use JWT whose only claim is the row's jti — the
 * token identifies *intent*, not authorization. The actual mutation only
 * ever happens via the authenticated confirm step
 * (routes/briefingActions.js), never from the GET a link-prefetcher hits.
 */
async function issueActionToken({ runId, kind, params, userId }) {
  const jti = crypto.randomUUID();

  await pool.query(
    `INSERT INTO briefing_actions (run_id, jti, kind, params) VALUES ($1,$2,$3,$4)`,
    [runId, jti, kind, JSON.stringify(params)]
  );

  const token = jwt.sign({ jti, kind, userId }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
  });

  return { token, jti };
}

/**
 * Verify a token's signature/expiry and that its jti hasn't been consumed
 * yet. Read-only — callers decide whether to actually consume it.
 */
async function verifyActionToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET); // throws on bad/expired signature

  const r = await pool.query(
    `SELECT * FROM briefing_actions WHERE jti = $1`,
    [decoded.jti]
  );
  const action = r.rows[0];
  if (!action) throw new Error("Unknown action token");
  if (action.consumed_at) throw new Error("Action already used");

  return { decoded, action };
}

async function consumeActionToken(jti) {
  await pool.query(`UPDATE briefing_actions SET consumed_at = NOW() WHERE jti = $1`, [jti]);
}

module.exports = { issueActionToken, verifyActionToken, consumeActionToken };
