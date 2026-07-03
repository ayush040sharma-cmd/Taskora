const KEY = "taskora_intended_plan";
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes — an abandoned click shouldn't redirect a later, unrelated login

/**
 * Reads the plan a user selected on the landing page (e.g. "Start Pro") before
 * signing up, if any, and clears it. Returns null if absent, expired, or "free".
 * Always call this once per auth completion (register or OAuth callback) —
 * it consumes the flag so it can't fire twice.
 */
export function consumeIntendedPlan() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  localStorage.removeItem(KEY);
  if (!raw) return null;

  try {
    const { plan, ts } = JSON.parse(raw);
    if (!plan || plan === "free") return null;
    if (typeof ts !== "number" || Date.now() - ts > MAX_AGE_MS) return null;
    return plan;
  } catch {
    return null;
  }
}
