const { z } = require("zod");
const logger = require("../../utils/logger");

const NarrationSchema = z.object({
  subject: z.string(),
  day_characterisation: z.string(),
  priority_reasons: z.array(z.object({ task_id: z.number(), text: z.string() })),
  closing_recommendation: z.string(),
});

// claude-haiku-4-5-20251001 is the exact model id already used for LLM
// fallback elsewhere in this codebase (backend/routes/jarvis.js) — reused
// here for consistency. Manager briefs use Sonnet per
// docs/briefing-engine-plan.md §5.1 ("higher stakes, lower volume").
const MODEL_BY_PERSONA = {
  ic: "claude-haiku-4-5-20251001",
  manager: "claude-sonnet-5",
};

// Narration runs in a background send, not an interactive request/response
// path, so it can afford more headroom than jarvis.js's 3s interactive
// timeout — but it must still have SOME ceiling so a hung API call can't
// stall the whole dispatch loop (Phase 4).
const LLM_TIMEOUT_MS = 8000;

/**
 * narrate(facts) → { subject, day_characterisation, priority_reasons,
 * closing_recommendation, source: 'llm' | 'fallback' }.
 *
 * THE ONE ARCHITECTURAL DECISION THAT MATTERS (docs/briefing-engine-plan.md
 * §0): the LLM never produces a number. It receives the frozen `facts`
 * object and may only write the subject line, characterise the day in one
 * sentence, and turn reason codes into natural language. If it emits any
 * digit that doesn't already appear somewhere in `facts`, the entire output
 * is rejected — not edited, not partially trusted — and a deterministic
 * template is sent instead. No `ANTHROPIC_API_KEY` configured is treated
 * the same as any other narration failure: fall back, never skip the send.
 */
async function narrate(facts) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...deterministicNarration(facts), source: "fallback" };
  }

  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const anthropic = new Anthropic.default();
    const model = MODEL_BY_PERSONA[facts.persona] || MODEL_BY_PERSONA.ic;

    const result = await Promise.race([
      anthropic.messages.create({
        model,
        max_tokens: 500,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: JSON.stringify(facts) }],
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("narration_timeout")), LLM_TIMEOUT_MS)),
    ]);

    const raw = result.content?.[0]?.text?.trim() || "";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn("Narration rejected: LLM did not return valid JSON");
      return { ...deterministicNarration(facts), source: "fallback" };
    }

    const zodResult = NarrationSchema.safeParse(parsed);
    if (!zodResult.success) {
      logger.warn("Narration rejected: schema mismatch", { issues: zodResult.error.issues });
      return { ...deterministicNarration(facts), source: "fallback" };
    }

    if (!passesNumberFirewall(facts, zodResult.data)) {
      logger.warn("Narration rejected: unsanctioned number emitted", { userId: facts.user.id });
      return { ...deterministicNarration(facts), source: "fallback" };
    }

    return { ...zodResult.data, source: "llm" };
  } catch (e) {
    logger.warn("Narration failed, using deterministic fallback", { error: e.message });
    return { ...deterministicNarration(facts), source: "fallback" };
  }
}

function buildSystemPrompt() {
  return `You are writing a short daily work briefing email for a Taskora user. You will receive a JSON object called "facts" — this is the ONLY information you may use. Do not invent, estimate, round, or restate any number that does not already appear somewhere in the facts JSON. Your job is narration only, not analysis:

1. Write a short subject line (under 60 characters).
2. Characterise the day in one sentence.
3. For each item in facts.priorities, turn its reason_codes and reason_params into one natural-language sentence — do not add reasons that aren't implied by the codes given.
4. Write one closing recommendation sentence.

Respond with ONLY valid JSON, no markdown fences, matching exactly this shape:
{"subject": "...", "day_characterisation": "...", "priority_reasons": [{"task_id": <number copied from facts>, "text": "..."}], "closing_recommendation": "..."}`;
}

// ── The hallucination firewall ────────────────────────────────────────────────

function passesNumberFirewall(facts, narration) {
  const allowed = collectAllNumbers(facts);
  const emittedText = [
    narration.subject,
    narration.day_characterisation,
    ...narration.priority_reasons.map(r => r.text),
    narration.closing_recommendation,
  ].join(" ");
  const emitted = extractNumbers(emittedText);
  return emitted.every(n => allowed.has(n));
}

function collectAllNumbers(value, acc = new Set()) {
  if (value === null || value === undefined) return acc;
  if (typeof value === "number") {
    acc.add(String(value));
    return acc;
  }
  if (typeof value === "string") {
    extractNumbers(value).forEach(n => acc.add(n));
    return acc;
  }
  if (Array.isArray(value)) {
    value.forEach(v => collectAllNumbers(v, acc));
    return acc;
  }
  if (typeof value === "object") {
    Object.values(value).forEach(v => collectAllNumbers(v, acc));
    return acc;
  }
  return acc;
}

function extractNumbers(text) {
  if (!text) return [];
  return String(text).match(/\d+(\.\d+)?/g) || [];
}

// ── Deterministic fallback — first-class, not a stub ──────────────────────────

const REASON_CODE_TEMPLATES = {
  BLOCKS_N_TASKS:      p => `Blocks ${p.n ?? "other"} downstream task${p.n === 1 ? "" : "s"}.`,
  RELEASE_DEPENDENCY:  p => `Required for the ${p.release_date || "upcoming"} release.`,
  WAITING_ON_YOU_XH:   p => `Waiting on you for ${p.hours ?? "several"} hours.`,
  BLOCKING_PERSON:     () => `Blocking a teammate.`,
  OVERDUE_XD:          p => `Overdue by ${p.days ?? "some"} day${p.days === 1 ? "" : "s"}.`,
  HIGH_RISK:           () => "Flagged high risk.",
  QUICK_WIN:           () => "Quick win — low effort.",
  SAFE_TO_DEFER:       () => "Lower priority — safe to defer if needed.",
  SPRINT_CRITICAL:     () => "Critical to this sprint's goal.",
};

function reasonCodesToText(codes = [], params = {}) {
  return codes
    .map(c => (REASON_CODE_TEMPLATES[c] || (() => ""))(params))
    .filter(Boolean)
    .join(" ");
}

function deterministicNarration(facts) {
  const h = facts.headline;
  const scoreText = h.execution_score !== null ? `${h.execution_score}%` : "not yet available";
  const deltaText = h.execution_score_delta !== null
    ? ` (${h.execution_score_delta >= 0 ? "+" : ""}${h.execution_score_delta} vs. yesterday)`
    : "";

  if (facts.suppress) {
    return {
      subject: "Your Taskora day — getting started",
      day_characterisation: "Not enough activity yet for a meaningful briefing — check back once you have a few tasks in flight.",
      priority_reasons: [],
      closing_recommendation: "Add a few tasks to get your first daily briefing.",
    };
  }

  const subject = `Your Taskora day: ${facts.priorities.length} ${facts.priorities.length === 1 ? "priority" : "priorities"}, execution score ${scoreText}`;
  const dayCharacterisation = `Execution score is ${scoreText}${deltaText}. ${h.blocked_tasks} blocked, ${h.high_risk_tasks} high-risk.`;

  const priorityReasons = facts.priorities.map(p => ({
    task_id: p.task_id,
    text: reasonCodesToText(p.reason_codes, p.reason_params) || "On today's priority list.",
  }));

  const closingRecommendation = facts.priorities.length
    ? `Start with "${facts.priorities[0].title}" — it has the highest impact today.`
    : "No specific recommendation today.";

  return {
    subject,
    day_characterisation: dayCharacterisation,
    priority_reasons: priorityReasons,
    closing_recommendation: closingRecommendation,
  };
}

module.exports = { narrate, deterministicNarration, passesNumberFirewall, NarrationSchema };
