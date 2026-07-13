const { z } = require("zod");

/**
 * The facts contract — docs/briefing-engine-plan.md §4.1. Strict and
 * versioned: this is the *only* thing the narration layer (Phase 3) and any
 * renderer (Phase 4+) are allowed to read. Bump schema_version on any
 * breaking change instead of silently changing shape.
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
  priorities: z.array(z.object({
    task_id: z.number(),
    title: z.string(),
    stars: z.number(), // 1-5, derived from rank position
    effort_minutes: z.number().nullable(),
    reason_codes: z.array(z.string()),
    reason_params: z.record(z.string(), z.any()),
  })),
  attention: z.array(z.object({
    type: z.string(),
    user: z.string(),
    load_pct: z.number(),
    suggested_action: z.record(z.string(), z.any()).nullable(),
  })),
  projection: z.object({
    sprint_confidence_now: z.number().nullable(),
    sprint_confidence_if_done: z.number().nullable(),
  }),
  suppress: z.boolean(),
  suppress_reason: z.string().nullable(),
});

module.exports = { FactsSchema };
