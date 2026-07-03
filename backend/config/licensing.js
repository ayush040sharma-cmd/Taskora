/**
 * Licensing framework — Phase 2 (foundation only, nothing enforced yet).
 *
 * Pipeline this config exists to support (built in a later phase):
 *   Authentication -> RBAC -> Feature Licensing -> Business Logic
 *
 * This file is the single source of truth for plan/feature data. No plan name
 * or feature name should ever be hardcoded anywhere else in the app — import
 * FEATURES/PLANS from here instead of using string literals.
 *
 * Two kinds of feature values appear in PLAN_FEATURES:
 *   - Capability features (GANTT, JARVIS, ...)   -> boolean (true = allowed)
 *   - Limit features (*_LIMIT)                   -> a number, or UNLIMITED
 */

// ── Feature registry ──────────────────────────────────────────────────────────
// Keys are the canonical feature identifiers used everywhere in the licensing
// system. Add new features here first; nowhere else.
const FEATURES = Object.freeze({
  GANTT:             "GANTT",
  SPRINTS:           "SPRINTS",
  SIMULATION:        "SIMULATION",
  JARVIS:            "JARVIS",
  AI_REASONING:      "AI_REASONING",
  EXPORT:            "EXPORT",
  PORTFOLIO_AI:      "PORTFOLIO_AI",
  SMART_ASSIGNMENT:  "SMART_ASSIGNMENT",
  FORECAST:          "FORECAST",
  PROJECT_LIMIT:     "PROJECT_LIMIT",
  TASK_LIMIT:        "TASK_LIMIT",
  MEMBER_LIMIT:      "MEMBER_LIMIT",
});

// ── Plan registry ─────────────────────────────────────────────────────────────
const PLANS = Object.freeze({
  FREE:       "FREE",
  PRO:        "PRO",
  ENTERPRISE: "ENTERPRISE",
  INTERNAL:   "INTERNAL",
});

// Sentinel for "no cap" on a *_LIMIT feature (kept distinct from boolean `true`,
// since limit features are numbers, not capabilities).
const UNLIMITED = null;

// ── Plan -> feature grants ────────────────────────────────────────────────────
// FREE, PRO, ENTERPRISE are hand-authored from the approved pricing spec.
// INTERNAL is derived below, not hand-authored, so it can never drift out of
// sync with the feature registry as new features are added.
const PLAN_FEATURES = Object.freeze({
  [PLANS.FREE]: Object.freeze({
    [FEATURES.GANTT]:            false,
    [FEATURES.SPRINTS]:          false,
    [FEATURES.SIMULATION]:       false,
    [FEATURES.JARVIS]:           false,
    [FEATURES.AI_REASONING]:     false,
    [FEATURES.EXPORT]:           false,
    [FEATURES.PORTFOLIO_AI]:     false,
    [FEATURES.SMART_ASSIGNMENT]: false,
    [FEATURES.FORECAST]:         false,
    [FEATURES.PROJECT_LIMIT]:    3,
    [FEATURES.TASK_LIMIT]:       10, // per project
    [FEATURES.MEMBER_LIMIT]:     3,
  }),

  [PLANS.PRO]: Object.freeze({
    [FEATURES.GANTT]:            true,
    [FEATURES.SPRINTS]:          true,
    [FEATURES.SIMULATION]:       false, // full What-If engine is Enterprise-only
    [FEATURES.JARVIS]:           true,
    [FEATURES.AI_REASONING]:     true,
    [FEATURES.EXPORT]:           true,
    [FEATURES.PORTFOLIO_AI]:     false,
    [FEATURES.SMART_ASSIGNMENT]: true,
    [FEATURES.FORECAST]:         true,
    [FEATURES.PROJECT_LIMIT]:    UNLIMITED,
    [FEATURES.TASK_LIMIT]:       UNLIMITED,
    [FEATURES.MEMBER_LIMIT]:     25,
  }),

  [PLANS.ENTERPRISE]: Object.freeze({
    [FEATURES.GANTT]:            true,
    [FEATURES.SPRINTS]:          true,
    [FEATURES.SIMULATION]:       true,
    [FEATURES.JARVIS]:           true,
    [FEATURES.AI_REASONING]:     true,
    [FEATURES.EXPORT]:           true,
    [FEATURES.PORTFOLIO_AI]:     true,
    [FEATURES.SMART_ASSIGNMENT]: true,
    [FEATURES.FORECAST]:         true,
    [FEATURES.PROJECT_LIMIT]:    UNLIMITED,
    [FEATURES.TASK_LIMIT]:       UNLIMITED,
    [FEATURES.MEMBER_LIMIT]:     UNLIMITED,
  }),

  // Derived, not hand-authored: every capability feature -> true,
  // every *_LIMIT feature -> UNLIMITED. Adding a new feature to FEATURES
  // above automatically grants it to INTERNAL with no edit needed here.
  [PLANS.INTERNAL]: Object.freeze(
    Object.fromEntries(
      Object.values(FEATURES).map(key => [
        key,
        key.endsWith("_LIMIT") ? UNLIMITED : true,
      ])
    )
  ),
});

module.exports = { FEATURES, PLANS, PLAN_FEATURES, UNLIMITED };
