const { z } = require("zod");

/**
 * The facts contract — docs/briefing-engine-plan.md §4.1, extended per the
 * Individual vs. Manager Brief content redesign. Strict and versioned: this
 * is the *only* thing the narration layer (Phase 3) and any renderer
 * (Phase 4+) are allowed to read. Bump schema_version on any breaking
 * change instead of silently changing shape — the redesign fields below are
 * all additive/optional, so schema_version stays at 1.
 */
const FactsSchema = z.object({
  schema_version: z.literal(1),
  persona: z.enum(["ic", "manager"]),
  user: z.object({
    id: z.number(),
    first_name: z.string(),
    tz: z.string(),
  }),
  date: z.string(), // YYYY-MM-DD, local to the user
  headline: z.object({
    execution_score: z.number().nullable(),
    execution_score_delta: z.number().nullable(),
    focus_time_minutes: z.number().nullable(),
    meetings: z.number(),
    high_risk_tasks: z.number(),
    blocked_tasks: z.number(),
  }),
  // One-sentence explanation of the execution score, derived from the same
  // metric_snapshots.inputs the score itself was computed from — never a
  // new number, just plain language about the existing ones.
  calculation_explainer: z.string().nullable().optional(),
  // Up to 7 days of execution_score history, oldest first. May be shorter
  // than 7 for a new user — missing days are omitted, never padded with 0.
  weekly_trend: z.array(z.object({
    value: z.number(),
    isToday: z.boolean().optional(),
  })).optional(),
  // One-sentence forward-looking note about tomorrow (deadline density +
  // meeting load), or null if tomorrow looks fine. Foresight, not alarm.
  risk_prediction: z.string().nullable().optional(),
  // One-sentence summary of today's focus time / meetings / open blockers.
  workload_summary: z.string().nullable().optional(),
  priorities: z.array(z.object({
    task_id: z.number(),
    title: z.string(),
    stars: z.number(), // 1-5, derived from rank position
    effort_minutes: z.number().nullable(),
    due_date: z.string().nullable().optional(),
    recommended_action: z.string().nullable().optional(),
    reason_codes: z.array(z.string()),
    reason_params: z.record(z.string(), z.any()),
  })),
  attention: z.array(z.object({
    type: z.string(),
    user: z.string(),
    load_pct: z.number(),
    suggested_action: z.record(z.string(), z.any()).nullable(),
  })),
  // Manager persona only — never populated for an IC brief. Section B of
  // the manager email; buildContext.js's buildTeamSection() is the only
  // place this is computed, and it's only called for persona === "manager".
  team: z.object({
    execution_score: z.number().nullable(),
    sprint_name: z.string().nullable(),
    sprint_confidence: z.number().nullable(),
    members_needing_attention: z.array(z.object({
      user: z.string(),
      load_pct: z.number(),
      risk_text: z.string().nullable(),
      recommendation: z.string().nullable(),
    })),
    risks: z.array(z.object({
      icon: z.string(),
      label: z.string(),
      text: z.string(),
    })),
    resource_suggestion: z.string().nullable(),
  }).optional(),
  projection: z.object({
    sprint_confidence_now: z.number().nullable(),
    sprint_confidence_if_done: z.number().nullable(),
  }),
  suppress: z.boolean(),
  suppress_reason: z.string().nullable(),
});

module.exports = { FactsSchema };
