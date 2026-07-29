const { emailShell } = require("../emailService");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/**
 * Dispatches to the individual or manager template based on facts.persona —
 * per the Individual vs. Manager Brief redesign spec. Both templates share
 * the same emailShell() (dark theme, table-based/inline-CSS, Outlook-safe).
 *
 * NOTE ON DATA: the extended fields these templates render (weekly_trend,
 * risk_prediction, calculation_explainer, per-priority deadline/
 * recommended_action, and everything in facts.team) are NOT YET produced by
 * buildContext.js (services/briefing/buildContext.js) — that's the
 * remaining backend work from the redesign spec. Every extended field below
 * has a graceful fallback so these templates still render correctly against
 * today's real (thinner) facts shape; they just render richer content once
 * buildContext.js is extended to compute it.
 */
function renderBriefingEmail(facts, narration) {
  return facts.persona === "manager"
    ? renderManagerBrief(facts, narration)
    : renderIndividualBrief(facts, narration);
}

// ── Individual User Daily Brief ─────────────────────────────────────────────
function renderIndividualBrief(facts, narration) {
  const bodyHtml = personalSectionHtml(facts, narration, { greeting: true });
  const html = emailShell({ title: narration.subject, bodyHtml });
  const text = personalSectionText(facts, narration);
  return { subject: narration.subject, html, text };
}

// ── Manager Daily Brief — Section A (personal) + Section B (team) ──────────
function renderManagerBrief(facts, narration) {
  const team = facts.team || {};
  const members = team.members_needing_attention || facts.attention || [];

  const teamScoreHtml = team.execution_score !== undefined ? `
    <div class="score-card" style="background-color:#111a2c;border:1px solid #1E293B;border-radius:12px;padding:16px 18px;margin:0 0 16px;">
      <div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Team execution score</div>
      <table cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="font-size:24px;font-weight:800;color:${scoreColorFor(team.execution_score)};">${team.execution_score}%</td>
        <td align="right" style="font-size:12px;color:#94A3B8;">${team.sprint_name ? `${escapeHtml(team.sprint_name)} · ${team.sprint_confidence}% confidence` : ""}</td>
      </tr></table>
    </div>` : "";

  const membersHtml = members.length ? `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;">Needs your attention</p>
    ${members.map(m => `
      <table cellpadding="0" cellspacing="0" width="100%" style="background-color:#111a2c;border:1px solid #1E293B;border-radius:10px;margin-bottom:8px;"><tr>
        <td width="40" style="padding:12px 0 12px 14px;">
          <table cellpadding="0" cellspacing="0"><tr><td width="32" height="32" bgcolor="#3B82F6" style="background-color:#3B82F6;background-image:linear-gradient(135deg,#3B82F6,#06B6D4);border-radius:50%;text-align:center;vertical-align:middle;color:#fff;font-size:12px;font-weight:700;">${initials(m.user)}</td></tr></table>
        </td>
        <td style="padding:12px 14px 12px 10px;">
          <div style="font-size:13.5px;font-weight:600;color:#E2E8F0;">${escapeHtml(m.user)}</div>
          <div style="font-size:11.5px;color:#94A3B8;margin-top:2px;">${escapeHtml(m.risk_text || `At ${m.load_pct}% load`)}</div>
          ${m.recommendation ? `<div style="font-size:11.5px;color:#06B6D4;margin-top:4px;">→ ${escapeHtml(m.recommendation)}</div>` : ""}
        </td>
        <td width="60" align="right" style="padding:12px 14px 12px 0;">
          <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background-color:#3a1414;color:#f87171;">${m.load_pct}%</span>
        </td>
      </tr></table>`).join("")}
  ` : "";

  const risksHtml = (team.risks || []).map(r => `
    <div style="font-size:12.5px;color:#E2E8F0;background-color:#1a1408;border:1px solid #78350F;border-radius:8px;padding:11px 14px;margin-bottom:8px;line-height:1.5;">
      ${r.icon || "⚠️"} <strong>${escapeHtml(r.label)}:</strong> ${escapeHtml(r.text)}
    </div>`).join("");

  const allocationHtml = team.resource_suggestion ? `
    <p style="margin:18px 0 0;font-size:13.5px;color:#E2E8F0;line-height:1.6;">${escapeHtml(team.resource_suggestion)}</p>
  ` : "";

  const sectionBHtml = (teamScoreHtml || membersHtml || risksHtml) ? `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin:26px 0 14px;"><tr>
      <td style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;padding-right:10px;">Team intelligence</td>
      <td style="border-top:1px solid #1E293B;"></td>
    </tr></table>
    <p style="margin:0 0 14px;font-size:11.5px;color:#64748B;">Visible only because you manage this workspace — never shown in an individual contributor's brief.</p>
    ${teamScoreHtml}
    ${membersHtml}
    ${risksHtml ? `<p style="margin:16px 0 8px;font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;">Risks this week</p>${risksHtml}` : ""}
    ${allocationHtml}
  ` : `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin:26px 0 14px;"><tr>
      <td style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;padding-right:10px;">Team intelligence</td>
      <td style="border-top:1px solid #1E293B;"></td>
    </tr></table>
    <p style="margin:0;font-size:13px;color:#94A3B8;">Team's in good shape — nothing needs you today.</p>
  `;

  const bodyHtml = personalSectionHtml(facts, narration, { greeting: true, ctaText: null }) + sectionBHtml + ctaHtml("Open Team Dashboard");
  const html = emailShell({ title: narration.subject, bodyHtml });

  const text = [
    personalSectionText(facts, narration),
    "",
    "TEAM INTELLIGENCE (visible only to managers)",
    team.execution_score !== undefined ? `Team execution score: ${team.execution_score}%` : "",
    ...members.map(m => `- ${m.user}: ${m.load_pct}% load — ${m.risk_text || ""} ${m.recommendation ? `(→ ${m.recommendation})` : ""}`),
    ...(team.risks || []).map(r => `- ${r.label}: ${r.text}`),
    team.resource_suggestion || "",
    "",
    `Open Team Dashboard: ${FRONTEND_URL}`,
  ].filter(Boolean).join("\n");

  return { subject: narration.subject, html, text };
}

// ── Shared: personal section (identical privacy rules for IC and manager) ──
function personalSectionHtml(facts, narration, { ctaText = "Open Taskora" } = {}) {
  const h = facts.headline;
  const scoreText = h.execution_score !== null ? `${h.execution_score}%` : "—";
  const scoreColor = scoreColorFor(h.execution_score);
  const deltaHtml = h.execution_score_delta !== null
    ? `<span style="color:${h.execution_score_delta >= 0 ? "#10B981" : "#EF4444"};font-size:13px;font-weight:600;">
         ${h.execution_score_delta >= 0 ? "▲" : "▼"} ${Math.abs(h.execution_score_delta)} vs. yesterday
       </span>`
    : `<span style="color:#475569;font-size:12px;">First briefing — no trend yet</span>`;

  const explainerHtml = facts.calculation_explainer
    ? `<div style="margin-top:8px;font-size:11.5px;color:#64748B;line-height:1.5;">${escapeHtml(facts.calculation_explainer)}</div>`
    : "";

  const trendHtml = facts.weekly_trend && facts.weekly_trend.length
    ? `<div style="font-size:10.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin:14px 0 2px;">Last 7 days</div>${barsHtml(facts.weekly_trend)}`
    : "";

  const priorityRows = facts.priorities.map((p, i) => {
    const reason = narration.priority_reasons.find(r => r.task_id === p.task_id);
    const metaParts = [];
    if (p.effort_minutes) metaParts.push(`⏱ ${formatMinutes(p.effort_minutes)} estimated`);
    metaParts.push(p.due_date ? `📅 ${formatDueDate(p.due_date)}` : "📅 No due date");
    if (p.reason_params?.n) metaParts.push(`🔗 Unblocks ${p.reason_params.n} task${p.reason_params.n === 1 ? "" : "s"}`);

    return `
      <tr>
        <td style="padding:4px 0;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background-color:#111a2c;border:1px solid #1E293B;border-radius:10px;">
            <tr>
              <td width="34" style="padding:14px 4px 14px 16px;font-size:15px;font-weight:800;color:#3B82F6;vertical-align:top;">${i + 1}</td>
              <td style="padding:14px 16px 14px 4px;">
                <div style="font-size:14px;font-weight:600;color:#E2E8F0;">${escapeHtml(p.title)}</div>
                <div style="font-size:13px;color:#94A3B8;margin-top:3px;line-height:1.5;">${escapeHtml(reason?.text || "")}</div>
                <div style="margin-top:8px;font-size:11px;color:#64748B;">${metaParts.join("&nbsp;&nbsp;&nbsp;")}</div>
                ${p.recommended_action ? `<div style="margin-top:8px;font-size:12px;color:#06B6D4;font-weight:600;">→ ${escapeHtml(p.recommended_action)}</div>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }).join("");

  const riskHtml = facts.risk_prediction
    ? `<div style="font-size:12.5px;color:#E2E8F0;background-color:#1a1408;border:1px solid #78350F;border-radius:8px;padding:11px 14px;margin-top:16px;line-height:1.5;">⚠️ ${escapeHtml(facts.risk_prediction)}</div>`
    : "";

  const workloadHtml = facts.workload_summary
    ? `<p style="margin:16px 0 0;font-size:12.5px;color:#94A3B8;line-height:1.6;">${escapeHtml(facts.workload_summary)}</p>`
    : "";

  return `
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#E2E8F0;line-height:1.3;">${escapeHtml(narration.subject)}</h1>
    <p style="margin:0 0 20px;font-size:13.5px;color:#94A3B8;line-height:1.6;">${escapeHtml(narration.day_characterisation)}</p>

    <table cellpadding="0" cellspacing="0" width="100%" style="background-color:#111a2c;border:1px solid #1E293B;border-radius:12px;margin:0 0 20px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-size:10.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Execution score</div>
        <table cellpadding="0" cellspacing="0" width="100%"><tr>
          <td style="font-size:30px;font-weight:800;color:${scoreColor};line-height:1;">${scoreText}</td>
          <td align="right">${deltaHtml}</td>
        </tr></table>
        ${explainerHtml}
        ${trendHtml}
      </td></tr>
    </table>

    <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;">Today's priorities</p>
    <table cellpadding="0" cellspacing="0" width="100%">${priorityRows || "<tr><td style=\"padding:12px 0;font-size:13px;color:#475569;\">Nothing on the list today.</td></tr>"}</table>

    ${workloadHtml}
    ${riskHtml}

    <p style="margin:20px 0 0;font-size:13.5px;color:#E2E8F0;line-height:1.6;">${escapeHtml(narration.closing_recommendation)}</p>
    ${ctaText ? ctaHtml(ctaText) : ""}
  `;
}

function personalSectionText(facts, narration) {
  const h = facts.headline;
  const scoreText = h.execution_score !== null ? `${h.execution_score}%` : "—";
  return [
    narration.subject,
    "",
    narration.day_characterisation,
    "",
    `Execution score: ${scoreText}`,
    facts.calculation_explainer || "",
    "",
    "Today's priorities:",
    ...(facts.priorities.length
      ? facts.priorities.map((p, i) => {
          const reason = narration.priority_reasons.find(r => r.task_id === p.task_id);
          return `${i + 1}. ${p.title} — ${reason?.text || ""}${p.recommended_action ? ` (→ ${p.recommended_action})` : ""}`;
        })
      : ["(nothing on the list today)"]),
    "",
    facts.workload_summary || "",
    facts.risk_prediction ? `Risk: ${facts.risk_prediction}` : "",
    "",
    narration.closing_recommendation,
  ].filter(Boolean).join("\n");
}

function ctaHtml(label) {
  return `
    <table cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr>
      <td bgcolor="#3B82F6" style="background-color:#3B82F6;background-image:linear-gradient(90deg,#3B82F6,#06B6D4);border-radius:10px;">
        <a href="${FRONTEND_URL}" style="display:inline-block;padding:11px 26px;color:#fff;font-size:13.5px;font-weight:600;text-decoration:none;">${label} &rarr;</a>
      </td>
    </tr></table>`;
}

// Bulletproof-email bar chart: nested table per bar (spacer row + colored
// row), no SVG, no CSS transforms — the standard technique for charts that
// must survive Outlook's Word rendering engine.
function barsHtml(values, maxHeight = 24) {
  const max = Math.max(1, ...values.map(v => v.value));
  const cells = values.map(v => {
    const barH = Math.max(2, Math.round((v.value / max) * maxHeight));
    const spacerH = maxHeight - barH;
    const color = v.isToday ? "#3B82F6" : "#1E3A5F";
    return `
      <td style="padding:0 2px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td height="${spacerH}" style="line-height:1px;font-size:1px;">&nbsp;</td>
        </tr><tr>
          <td height="${barH}" width="8" bgcolor="${color}" style="background-color:${color};border-radius:2px 2px 0 0;line-height:1px;font-size:1px;">&nbsp;</td>
        </tr></table>
      </td>`;
  }).join("");
  return `<table cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatDueDate(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const days = Math.round((d.setHours(0,0,0,0) - today.setHours(0,0,0,0)) / 86400000);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  return `Due in ${days}d`;
}

function initials(name) {
  return (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function scoreColorFor(score) {
  if (score === null || score === undefined) return "#64748B";
  if (score >= 80) return "#10B981";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

module.exports = { renderBriefingEmail, renderIndividualBrief, renderManagerBrief };
