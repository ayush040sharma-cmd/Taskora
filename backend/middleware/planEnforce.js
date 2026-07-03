/**
 * Feature Licensing middleware — Phase 3 (requireFeature) + Phase 6 (enforceLimit).
 *
 * Pipeline this sits in (nothing upstream of this file is touched by it):
 *   Authentication (auth.js) -> RBAC (rbac.js / permission.js) -> Licensing -> Business Logic
 *
 * Exposes requireFeature(feature) and enforceLimit(feature, getCurrentCount) —
 * NOT requirePlan(plan). Every decision is driven by config/licensing.js's
 * PLAN_FEATURES; no plan name, feature name, or numeric ceiling is ever
 * hardcoded here.
 *
 * NOTE: requireFeature() is for boolean capability features (GANTT, SPRINTS,
 * SIMULATION, JARVIS, AI_REASONING, EXPORT, PORTFOLIO_AI, SMART_ASSIGNMENT,
 * FORECAST). enforceLimit() is for the three numeric *_LIMIT features
 * (PROJECT_LIMIT, TASK_LIMIT, MEMBER_LIMIT) — it needs a per-route
 * getCurrentCount(req) callback because "how do you count this resource" is
 * inherently route-specific (workspaces owned by a user vs. tasks in a
 * workspace vs. members in a workspace); the *threshold* it's compared
 * against always comes from PLAN_FEATURES, never from the route.
 */

const jwt   = require("jsonwebtoken");
const pool  = require("../db");
const { isInternalUser }                          = require("../utils/isInternalUser");
const { FEATURES, PLANS, PLAN_FEATURES, UNLIMITED } = require("../config/licensing");

const KNOWN_FEATURES = new Set(Object.values(FEATURES));

// Plan order used only to pick which plan to *suggest* in a 403 response —
// not part of the access-control decision itself. INTERNAL is excluded;
// it's not something a user upgrades to.
const UPGRADE_PATH = [PLANS.FREE, PLANS.PRO, PLANS.ENTERPRISE];

function suggestPlanFor(feature) {
  for (const plan of UPGRADE_PATH) {
    if (PLAN_FEATURES[plan]?.[feature] === true) return plan;
  }
  return PLANS.ENTERPRISE; // defensive fallback
}

// Same idea as suggestPlanFor, but for a numeric *_LIMIT feature: the first
// plan (in upgrade order) whose ceiling is UNLIMITED or strictly higher than
// the plan the user is currently on.
function suggestPlanForLimit(feature, currentLimit) {
  for (const plan of UPGRADE_PATH) {
    const val = PLAN_FEATURES[plan]?.[feature];
    if (val === UNLIMITED) return plan;
    if (typeof val === "number" && typeof currentLimit === "number" && val > currentLimit) return plan;
  }
  return PLANS.ENTERPRISE; // defensive fallback
}

/**
 * Resolve { isInternal, userPlan } for req.user. Prefers the values auth.js
 * (Phase 4) already resolved and normalized onto req.user — avoids a second
 * DB round-trip per request. Falls back to a direct lookup only if this
 * middleware is ever mounted without auth.js having run first first (same
 * defensiveness pattern used for req.user itself below).
 */
async function resolveUserPlan(req) {
  let isInternal = req.user.isInternal;
  let userPlan   = req.user.plan;

  if (isInternal === undefined || userPlan === undefined) {
    const { rows } = await pool.query("SELECT plan, email FROM users WHERE id = $1", [req.user.id]);
    const normalizedPlan = (rows[0]?.plan || "").toUpperCase();
    isInternal = isInternalUser(rows[0]?.email);
    userPlan   = PLANS[normalizedPlan] || PLANS.FREE;
  }

  return { isInternal, userPlan };
}

// Shared by both requireFeature and enforceLimit: recovers req.user if this
// middleware is ever mounted without auth.js running first. Never trusts a
// forged token any more than auth.js does.
async function ensureReqUser(req) {
  if (req.user) return true;
  const token = req.cookies?.taskora_token || req.headers.authorization?.split(" ")[1];
  if (!token) return false; // no token — let the route's own auth return 401
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return true;
  } catch {
    return false; // bad/expired token — let the route's own auth return 403
  }
}

/**
 * requireFeature(feature) — route middleware factory for boolean capability features.
 *
 * Logic:
 *   Internal user (by email domain)? -> allow
 *   else load the user's plan -> does PLAN_FEATURES[plan][feature] === true?
 *     yes -> continue
 *     no  -> 403 { code: "PLAN_UPGRADE_REQUIRED", requiredPlan, feature }
 */
function requireFeature(feature) {
  if (!KNOWN_FEATURES.has(feature)) {
    throw new Error(`requireFeature(): unknown feature "${feature}" — must be one of FEATURES in config/licensing.js`);
  }

  return async (req, res, next) => {
    if (!(await ensureReqUser(req))) return next();

    try {
      const { isInternal, userPlan } = await resolveUserPlan(req);
      if (isInternal) return next();

      const planFeatures = PLAN_FEATURES[userPlan] || PLAN_FEATURES[PLANS.FREE];

      if (planFeatures[feature] === true) {
        req.userPlan = userPlan;
        return next();
      }

      return res.status(403).json({
        code:         "PLAN_UPGRADE_REQUIRED",
        requiredPlan: suggestPlanFor(feature),
        feature,
      });
    } catch (err) {
      next(err);
    }
  };
}

/**
 * enforceLimit(feature, getCurrentCount) — route middleware factory for the
 * numeric *_LIMIT features (PROJECT_LIMIT, TASK_LIMIT, MEMBER_LIMIT).
 *
 * getCurrentCount(req) -> Promise<number>: counts the resource *before* this
 * request's create would add one more (e.g. workspaces already owned, tasks
 * already in the target workspace, members already in the target workspace).
 * This is the only route-specific part — the threshold itself always comes
 * from PLAN_FEATURES[plan][feature].
 *
 * Logic:
 *   Internal user? -> allow
 *   plan's limit is UNLIMITED? -> allow
 *   currentCount < limit? -> allow
 *   else -> 403 { code: "LIMIT_EXCEEDED", feature, limit, current, requiredPlan }
 */
function enforceLimit(feature, getCurrentCount) {
  if (!KNOWN_FEATURES.has(feature)) {
    throw new Error(`enforceLimit(): unknown feature "${feature}" — must be one of FEATURES in config/licensing.js`);
  }
  if (!feature.endsWith("_LIMIT")) {
    throw new Error(`enforceLimit(): "${feature}" is not a *_LIMIT feature — use requireFeature() for capability features`);
  }
  if (typeof getCurrentCount !== "function") {
    throw new Error("enforceLimit(): getCurrentCount(req) callback is required");
  }

  return async (req, res, next) => {
    if (!(await ensureReqUser(req))) return next();

    try {
      const { isInternal, userPlan } = await resolveUserPlan(req);
      if (isInternal) return next();

      const planFeatures = PLAN_FEATURES[userPlan] || PLAN_FEATURES[PLANS.FREE];
      const limit = planFeatures[feature];

      if (limit === UNLIMITED) return next();

      const current = await getCurrentCount(req);

      if (current < limit) return next();

      return res.status(403).json({
        code:         "LIMIT_EXCEEDED",
        feature,
        limit,
        current,
        requiredPlan: suggestPlanForLimit(feature, limit),
      });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireFeature, enforceLimit };
