/**
 * Internal-user check for licensing (Phase 1).
 *
 * Internal users bypass all pricing restrictions. Determined dynamically from
 * the user's email domain against INTERNAL_DOMAINS — no DB column, no schema
 * change. Domains are never hardcoded here; if INTERNAL_DOMAINS is unset,
 * every email is treated as external (returns false).
 *
 * INTERNAL_DOMAINS=subex.com
 * INTERNAL_DOMAINS=subex.com,partner.com
 */
function isInternalUser(email) {
  if (!email || typeof email !== "string") return false;

  const domains = (process.env.INTERNAL_DOMAINS || "")
    .split(",")
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);

  if (domains.length === 0) return false;

  const lower = email.toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at === -1 || at === lower.length - 1) return false;

  const emailDomain = lower.slice(at + 1);
  return domains.includes(emailDomain);
}

module.exports = { isInternalUser };
