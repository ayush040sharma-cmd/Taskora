const { emailShell } = require("../emailService");

/**
 * Renders facts + narration into { subject, html, text }, reusing the same
 * emailShell() every other Taskora transactional email uses (dark theme,
 * gradient bar, table-based/inline-CSS — already Outlook-safe, per
 * docs/briefing-engine-plan.md §6.1's requirements) instead of introducing
 * a separate templating library (MJML/react-email) for just this feature.
 */
function renderBriefingEmail(facts, narration) {
  const h = facts.headline;
  const scoreText = h.execution_score !== null ? `${h.execution_score}%` : "—";
  const deltaHtml = h.execution_score_delta !== null
    ? `<span style="color:${h.execution_score_delta >= 0 ? "#10B981" : "#EF4444"};font-size:13px;font-weight:600;">
         ${h.execution_score_delta >= 0 ? "↑" : "↓"} ${Math.abs(h.execution_score_delta)} vs. yesterday
       </span>`
    : "";

  const priorityRows = facts.priorities.map((p, i) => {
    const reason = narration.priority_reasons.find(r => r.task_id === p.task_id);
    return `
      <tr>
        <td style="padding:12px 0;border-top:1px solid #1E293B;">
          <div style="font-size:14px;font-weight:600;color:#E2E8F0;">${i + 1}. ${escapeHtml(p.title)}</div>
          <div style="font-size:13px;color:#94A3B8;margin-top:2px;">${escapeHtml(reason?.text || "")}</div>
        </td>
      </tr>`;
  }).join("");

  const attentionHtml = facts.attention.length ? `
    <p style="margin:24px 0 8px;font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;">Needs attention</p>
    ${facts.attention.map(a => `
      <div style="font-size:13px;color:#E2E8F0;padding:6px 0;">
        ⚠️ ${escapeHtml(a.user)} is at ${a.load_pct}% load
      </div>`).join("")}
  ` : "";

  const bodyHtml = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#E2E8F0;">${escapeHtml(narration.subject)}</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#94A3B8;line-height:1.6;">${escapeHtml(narration.day_characterisation)}</p>

    <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">
      <tr>
        <td style="font-size:32px;font-weight:800;color:#3B82F6;">${scoreText}</td>
        <td align="right">${deltaHtml}</td>
      </tr>
    </table>

    <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;">Today's priorities</p>
    <table cellpadding="0" cellspacing="0" width="100%">${priorityRows || "<tr><td style=\"padding:12px 0;font-size:13px;color:#475569;\">Nothing on the list today.</td></tr>"}</table>

    ${attentionHtml}

    <p style="margin:24px 0 0;font-size:14px;color:#E2E8F0;line-height:1.6;">${escapeHtml(narration.closing_recommendation)}</p>
  `;

  const html = emailShell({ title: narration.subject, bodyHtml });

  const text = [
    narration.subject,
    "",
    narration.day_characterisation,
    "",
    `Execution score: ${scoreText}`,
    "",
    "Today's priorities:",
    ...(facts.priorities.length
      ? facts.priorities.map((p, i) => {
          const reason = narration.priority_reasons.find(r => r.task_id === p.task_id);
          return `${i + 1}. ${p.title} — ${reason?.text || ""}`;
        })
      : ["(nothing on the list today)"]),
    "",
    narration.closing_recommendation,
  ].join("\n");

  return { subject: narration.subject, html, text };
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

module.exports = { renderBriefingEmail };
