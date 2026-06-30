/**
 * Email Service — powered by Resend.
 * Falls back gracefully if RESEND_API_KEY is not set.
 */

const RESEND_API_KEY  = process.env.RESEND_API_KEY;
const FROM_EMAIL      = process.env.FROM_EMAIL || "Taskora <onboarding@resend.dev>";
const FRONTEND_URL    = process.env.FRONTEND_URL || "http://localhost:5173";

let resend = null;
if (RESEND_API_KEY) {
  try {
    const { Resend } = require("resend");
    resend = new Resend(RESEND_API_KEY);
  } catch (e) {
    console.warn("[emailService] Resend package not available:", e.message);
  }
}

/**
 * Send a workspace invite email to a user who doesn't have a Taskora account yet.
 */
async function sendWorkspaceInvite({ toEmail, inviterName, workspaceName, role, inviteToken }) {
  const joinUrl  = `${FRONTEND_URL}/join/${inviteToken}`;
  const roleLabel = { manager: "Manager", member: "Member", viewer: "Viewer" }[role] || "Member";

  if (!resend) {
    console.log(`[emailService] No RESEND_API_KEY — invite link for ${toEmail}: ${joinUrl}`);
    return { sent: false, link: joinUrl };
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#020617;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#0B1220;border:1px solid #1E293B;border-radius:16px;overflow:hidden;">

        <!-- Header gradient bar -->
        <tr><td style="background:linear-gradient(90deg,#3B82F6,#06B6D4);height:4px;"></td></tr>

        <!-- Logo + branding -->
        <tr><td style="padding:32px 40px 0;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:linear-gradient(135deg,#3B82F6,#06B6D4);border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle;">
                <span style="color:#fff;font-size:16px;font-weight:700;line-height:32px;">T</span>
              </td>
              <td style="padding-left:10px;font-size:20px;font-weight:700;color:#E2E8F0;vertical-align:middle;">Taskora</td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 40px 36px;">
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#E2E8F0;">
            You're invited to join a workspace
          </h1>
          <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.6;">
            <strong style="color:#E2E8F0;">${inviterName}</strong> has invited you to join
            <strong style="color:#3B82F6;">${workspaceName}</strong> on Taskora as a
            <span style="background:rgba(59,130,246,0.15);color:#3B82F6;border-radius:20px;padding:2px 10px;font-weight:600;">${roleLabel}</span>.
          </p>

          <!-- CTA button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr>
              <td style="background:linear-gradient(90deg,#3B82F6,#06B6D4);border-radius:10px;">
                <a href="${joinUrl}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
                  Accept Invitation →
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#475569;">Or paste this link in your browser:</p>
          <p style="margin:0 0 24px;font-size:12px;color:#3B82F6;word-break:break-all;">${joinUrl}</p>

          <hr style="border:none;border-top:1px solid #1E293B;margin:0 0 20px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            This invite expires in <strong style="color:#475569;">7 days</strong>.
            If you didn't expect this invite, you can safely ignore this email.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 40px;background:#060f1e;border-top:1px solid #1E293B;">
          <p style="margin:0;font-size:11px;color:#334155;text-align:center;">
            © ${new Date().getFullYear()} Taskora · AI-powered project management
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      [toEmail],
      subject: `${inviterName} invited you to join ${workspaceName} on Taskora`,
      html,
    });
    return { sent: true, link: joinUrl };
  } catch (err) {
    console.error("[emailService] Send failed:", err.message);
    return { sent: false, link: joinUrl, error: err.message };
  }
}

/**
 * Notify an existing Taskora user that they've been added to a workspace.
 */
async function sendWorkspaceAddedNotification({ toEmail, toName, inviterName, workspaceName, workspaceId }) {
  const dashboardUrl = `${FRONTEND_URL}/?workspace=${workspaceId}`;

  if (!resend) {
    console.log(`[emailService] No RESEND_API_KEY — workspace-added notification skipped for ${toEmail}`);
    return { sent: false };
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
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
        <tr><td style="padding:28px 40px 36px;">
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#E2E8F0;">You've been added to a workspace</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.6;">
            Hi <strong style="color:#E2E8F0;">${toName}</strong>, <strong style="color:#E2E8F0;">${inviterName}</strong> has added you to
            <strong style="color:#3B82F6;">${workspaceName}</strong> on Taskora.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr><td style="background:linear-gradient(90deg,#3B82F6,#06B6D4);border-radius:10px;">
              <a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
                Open Workspace →
              </a>
            </td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #1E293B;margin:0 0 20px;">
          <p style="margin:0;font-size:12px;color:#334155;">If you didn't expect this, contact your workspace admin.</p>
        </td></tr>
        <tr><td style="padding:16px 40px;background:#060f1e;border-top:1px solid #1E293B;">
          <p style="margin:0;font-size:11px;color:#334155;text-align:center;">© ${new Date().getFullYear()} Taskora · AI-powered project management</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      [toEmail],
      subject: `${inviterName} added you to ${workspaceName} on Taskora`,
      html,
    });
    return { sent: true };
  } catch (err) {
    console.error("[emailService] Workspace-added notification failed:", err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendWorkspaceInvite, sendWorkspaceAddedNotification };
