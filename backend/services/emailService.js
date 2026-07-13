/**
 * Email Service — single source of truth for all outbound email, powered by Resend.
 * Falls back gracefully (logs the would-be link, doesn't throw) if RESEND_API_KEY is not set.
 */

const logger = require("../utils/logger");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL      = process.env.FROM_EMAIL || "Taskora <support@taskora.io>";
const REPLY_TO_EMAIL  = process.env.EMAIL_REPLY_TO || "support@taskora.io";
const FRONTEND_URL    = process.env.FRONTEND_URL || "http://localhost:5173";

let resendClient = null;
function getResendClient() {
  if (!RESEND_API_KEY) return null;
  if (!resendClient) {
    try {
      const { Resend } = require("resend");
      resendClient = new Resend(RESEND_API_KEY);
    } catch (e) {
      logger.warn(`[emailService] Resend package not available: ${e.message}`);
    }
  }
  return resendClient;
}

/** Shared HTML shell (header gradient bar, logo, footer) used by every template. */
function emailShell({ title, bodyHtml }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#020617;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#0B1220;border:1px solid #1E293B;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(90deg,#3B82F6,#06B6D4);height:4px;"></td></tr>
        <tr><td style="padding:32px 40px 0;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:linear-gradient(135deg,#3B82F6,#06B6D4);border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle;">
              <span style="color:#fff;font-size:16px;font-weight:700;line-height:32px;">T</span>
            </td>
            <td style="padding-left:10px;font-size:20px;font-weight:700;color:#E2E8F0;vertical-align:middle;">Taskora</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 40px 36px;">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 40px;background:#060f1e;border-top:1px solid #1E293B;">
          <p style="margin:0;font-size:11px;color:#334155;text-align:center;">
            &copy; ${new Date().getFullYear()} Taskora &middot; AI-powered project management &middot;
            <a href="mailto:${REPLY_TO_EMAIL}" style="color:#334155;">${REPLY_TO_EMAIL}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Core send primitive. All templates funnel through here so From/Reply-To/logging
 * stay in one place. Never throws — callers get { sent, error } back.
 */
async function sendEmail({ template, to, subject, html, text }) {
  const client = getResendClient();

  if (!client) {
    logger.warn(`[emailService] RESEND_API_KEY not set — "${template}" email to ${to} skipped`);
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const result = await client.emails.send({
      from:     FROM_EMAIL,
      to:       [to],
      reply_to: REPLY_TO_EMAIL,
      subject,
      html,
      text,
    });
    logger.info(`[emailService] "${template}" sent to ${to}`, { template, subject, resendId: result?.data?.id });
    return { sent: true, id: result?.data?.id };
  } catch (err) {
    logger.error(`[emailService] "${template}" failed for ${to}: ${err.message}`, { template, subject });
    return { sent: false, error: err.message };
  }
}

/**
 * Send a workspace invite email to a user who doesn't have a Taskora account yet.
 */
async function sendWorkspaceInvite({ toEmail, inviterName, workspaceName, role, inviteToken }) {
  const joinUrl   = `${FRONTEND_URL}/join/${inviteToken}`;
  const roleLabel = { manager: "Manager", member: "Member", viewer: "Viewer" }[role] || "Member";

  const html = emailShell({
    title: "You're invited to join a workspace",
    bodyHtml: `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#E2E8F0;">
        You're invited to join a workspace
      </h1>
      <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.6;">
        <strong style="color:#E2E8F0;">${inviterName}</strong> has invited you to join
        <strong style="color:#3B82F6;">${workspaceName}</strong> on Taskora as a
        <span style="background:rgba(59,130,246,0.15);color:#3B82F6;border-radius:20px;padding:2px 10px;font-weight:600;">${roleLabel}</span>.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr><td style="background:linear-gradient(90deg,#3B82F6,#06B6D4);border-radius:10px;">
          <a href="${joinUrl}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
            Accept Invitation &rarr;
          </a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;color:#475569;">Or paste this link in your browser:</p>
      <p style="margin:0 0 24px;font-size:12px;color:#3B82F6;word-break:break-all;">${joinUrl}</p>
      <hr style="border:none;border-top:1px solid #1E293B;margin:0 0 20px;">
      <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
        This invite expires in <strong style="color:#475569;">7 days</strong>.
        If you didn't expect this invite, you can safely ignore this email.
      </p>`,
  });

  const text = `${inviterName} invited you to join ${workspaceName} on Taskora as a ${roleLabel}.\n\nAccept the invitation: ${joinUrl}\n\nThis invite expires in 7 days. If you didn't expect this, you can ignore this email.`;

  const result = await sendEmail({
    template: "workspace-invite",
    to:       toEmail,
    subject:  `${inviterName} invited you to join ${workspaceName} on Taskora`,
    html,
    text,
  });
  return { ...result, link: joinUrl };
}

/**
 * Notify an existing Taskora user that they've been added to a workspace.
 */
async function sendWorkspaceAddedNotification({ toEmail, toName, inviterName, workspaceName, workspaceId }) {
  const dashboardUrl = `${FRONTEND_URL}/?workspace=${workspaceId}`;

  const html = emailShell({
    title: "You've been added to a workspace",
    bodyHtml: `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#E2E8F0;">You've been added to a workspace</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.6;">
        Hi <strong style="color:#E2E8F0;">${toName}</strong>, <strong style="color:#E2E8F0;">${inviterName}</strong> has added you to
        <strong style="color:#3B82F6;">${workspaceName}</strong> on Taskora.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr><td style="background:linear-gradient(90deg,#3B82F6,#06B6D4);border-radius:10px;">
          <a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
            Open Workspace &rarr;
          </a>
        </td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #1E293B;margin:0 0 20px;">
      <p style="margin:0;font-size:12px;color:#334155;">If you didn't expect this, contact your workspace admin.</p>`,
  });

  const text = `${inviterName} added you to ${workspaceName} on Taskora.\n\nOpen the workspace: ${dashboardUrl}\n\nIf you didn't expect this, contact your workspace admin.`;

  return sendEmail({
    template: "workspace-added",
    to:       toEmail,
    subject:  `${inviterName} added you to ${workspaceName} on Taskora`,
    html,
    text,
  });
}

/**
 * Send a password reset link.
 */
async function sendPasswordReset({ toEmail, userName, resetLink }) {
  const html = emailShell({
    title: "Reset your Taskora password",
    bodyHtml: `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#E2E8F0;">Reset your password</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.6;">
        Hi <strong style="color:#E2E8F0;">${userName}</strong>, click below to reset your Taskora password.
        This link expires in <strong style="color:#E2E8F0;">1 hour</strong>.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr><td style="background:linear-gradient(90deg,#3B82F6,#06B6D4);border-radius:10px;">
          <a href="${resetLink}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
            Reset Password &rarr;
          </a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;color:#475569;">Or paste this link in your browser:</p>
      <p style="margin:0 0 24px;font-size:12px;color:#3B82F6;word-break:break-all;">${resetLink}</p>
      <hr style="border:none;border-top:1px solid #1E293B;margin:0 0 20px;">
      <p style="margin:0;font-size:12px;color:#334155;">If you didn't request this, you can safely ignore this email.</p>`,
  });

  const text = `Hi ${userName}, reset your Taskora password here: ${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`;

  return sendEmail({
    template: "password-reset",
    to:       toEmail,
    subject:  "Reset your Taskora password",
    html,
    text,
  });
}

module.exports = {
  sendWorkspaceInvite, sendWorkspaceAddedNotification, sendPasswordReset,
  // Exposed so other senders (e.g. services/briefing/) reuse the same Resend
  // client, From/Reply-To config, and visual shell instead of duplicating it.
  sendEmail, emailShell,
};
