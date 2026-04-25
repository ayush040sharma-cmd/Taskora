const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const pool = require("../db");
const auth = require("../middleware/auth");
const { validate, schemas } = require("../utils/validate");
const { setAuthCookie, clearAuthCookie } = require("../utils/cookies");
const logger = require("../utils/logger");

// Rate limiter: max 10 attempts per IP per 15 minutes on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in 15 minutes." },
});

// POST /api/auth/register
router.post("/register", authLimiter, validate(schemas.register), async (req, res) => {
  const { name, email, password, role } = req.body;

  // Only allow safe role values; default to manager for solo/business/manager users
  const safeRole = ["manager", "member"].includes(role) ? role : "manager";

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const userResult = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role",
      [name, email, password_hash, safeRole]
    );
    const user = userResult.rows[0];

    // Create default workspace for new user
    await pool.query(
      "INSERT INTO workspaces (name, user_id) VALUES ($1, $2)",
      [`${name}'s Workspace`, user.id]
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    setAuthCookie(res, token);
    res.status(201).json({
      token, // also returned in body so frontend can use as fallback
      user: { ...user, onboarding_step: "workspace_setup", onboarding_completed: false },
    });
  } catch (err) {
    logger.error(`Register error: ${err.message}`);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// POST /api/auth/login
router.post("/login", authLimiter, validate(schemas.login), async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Update last login timestamp
    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

    setAuthCookie(res, token);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    res.status(500).json({ message: "Server error during login" });
  }
});

// POST /api/auth/refresh — re-issue a fresh token for a valid existing token
router.post("/refresh", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, role FROM users WHERE id = $1",
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    setAuthCookie(res, token);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/logout — clear the httpOnly cookie
router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out" });
});

// PUT /api/auth/profile  — update name
router.put("/profile", auth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "Name is required" });
  try {
    const result = await pool.query(
      "UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email",
      [name.trim(), req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/auth/password  — change password
router.put("/password", auth, validate(schemas.changePassword), async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    const isMatch = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!isMatch) return res.status(401).json({ message: "Current password is incorrect" });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.user.id]);
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/auth/me
router.get("/me", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/auth/onboarding — get current onboarding state
router.get("/onboarding", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT onboarding_step, onboarding_completed FROM users WHERE id = $1",
      [req.user.id]
    );
    res.json(result.rows[0] || { onboarding_step: "workspace_setup", onboarding_completed: false });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/auth/onboarding — advance to next step or complete onboarding
const ONBOARDING_STEPS = ["workspace_setup", "team_invite", "first_task", "complete"];

router.put("/onboarding", auth, async (req, res) => {
  const { step } = req.body;
  if (!step || !ONBOARDING_STEPS.includes(step)) {
    return res.status(400).json({ message: "Invalid onboarding step" });
  }
  try {
    const completed = step === "complete";
    await pool.query(
      "UPDATE users SET onboarding_step = $1, onboarding_completed = $2 WHERE id = $3",
      [step, completed, req.user.id]
    );
    res.json({ onboarding_step: step, onboarding_completed: completed });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/auth/google/status — check if Google OAuth is configured
router.get("/google/status", (req, res) => {
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  res.json({ configured });
});

// POST /api/auth/forgot-password — send reset link
router.post("/forgot-password", authLimiter, validate(schemas.forgotPassword), async (req, res) => {
  const { email } = req.body;
  // Always respond 200 to avoid email enumeration
  try {
    const result = await pool.query("SELECT id, name FROM users WHERE email = $1", [email]);
    if (result.rows.length > 0) {
      const user   = result.rows[0];
      const crypto = require("crypto");
      const token  = crypto.randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await pool.query(
        "UPDATE users SET reset_token=$1, reset_token_expiry=$2 WHERE id=$3",
        [token, expiry, user.id]
      );
      // Send email via Resend (falls back gracefully if RESEND_API_KEY not set)
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const resetLink   = `${frontendUrl}/reset-password?token=${token}`;
      if (process.env.RESEND_API_KEY) {
        try {
          const { Resend } = require("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from:    process.env.EMAIL_FROM || "Taskora <noreply@taskora.app>",
            to:      [email],
            subject: "Reset your Taskora password",
            html: `
              <div style="font-family:sans-serif;max-width:480px;margin:auto">
                <h2 style="color:#6366f1">Reset your password</h2>
                <p>Hi ${user.name},</p>
                <p>Click the button below to reset your Taskora password. This link expires in <strong>1 hour</strong>.</p>
                <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">
                  Reset Password
                </a>
                <p style="color:#94a3b8;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
                <hr style="border:none;border-top:1px solid #f1f5f9">
                <p style="color:#94a3b8;font-size:12px">Taskora · task management for modern teams</p>
              </div>`,
          });
          logger.info(`Password reset email sent to ${email}`);
        } catch (emailErr) {
          logger.error(`Failed to send reset email: ${emailErr.message}`);
        }
      } else {
        logger.warn(`RESEND_API_KEY not set — reset link for ${email}: ${resetLink}`);
      }
    }
  } catch (err) {
    logger.error(`Forgot password error: ${err.message}`);
  }
  res.json({ message: "If that email exists, a reset link has been sent." });
});

// POST /api/auth/reset-password — consume token and set new password
router.post("/reset-password", authLimiter, validate(schemas.resetPassword), async (req, res) => {
  const { token, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT id FROM users WHERE reset_token=$1 AND reset_token_expiry > NOW()",
      [token]
    );
    if (!result.rows.length) {
      return res.status(400).json({ message: "Reset link is invalid or has expired." });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expiry=NULL WHERE id=$2",
      [hash, result.rows[0].id]
    );
    logger.info(`Password reset successful for user ${result.rows[0].id}`);
    res.json({ message: "Password updated successfully. You can now sign in." });
  } catch (err) {
    logger.error(`Reset password error: ${err.message}`);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/demo — instant demo login (creates/resets demo account)
router.post("/demo", authLimiter, async (req, res) => {
  const DEMO_EMAIL = "demo@taskora.app";
  const DEMO_NAME  = "Demo User";

  try {
    let user;
    const existing = await pool.query("SELECT id, name, email, role FROM users WHERE email = $1", [DEMO_EMAIL]);

    if (existing.rows.length > 0) {
      user = existing.rows[0];
      await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    } else {
      const bcrypt = require("bcryptjs");
      const hash = await bcrypt.hash("demo-password-not-for-login-" + Date.now(), 10);
      const result = await pool.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role",
        [DEMO_NAME, DEMO_EMAIL, hash, "manager"]
      );
      user = result.rows[0];

      // Create demo workspace
      const ws = await pool.query(
        "INSERT INTO workspaces (name, user_id) VALUES ($1, $2) RETURNING id",
        ["Taskora Demo Workspace", user.id]
      );
      const workspaceId = ws.rows[0].id;

      // Seed demo tasks with correct schema column names
      const demoTasks = [
        { title: "Design new landing page",    type: "task",    status: "done",        priority: "high",   est: 16, pos: 1 },
        { title: "Fix checkout flow bug",      type: "bug",     status: "done",        priority: "high",   est: 8,  pos: 2 },
        { title: "Sprint planning — Q3",       type: "story",   status: "done",        priority: "medium", est: 4,  pos: 3 },
        { title: "Q3 feature roadmap doc",     type: "story",   status: "in_progress", priority: "high",   est: 40, pos: 1 },
        { title: "API rate limiting setup",    type: "upgrade", status: "in_progress", priority: "medium", est: 24, pos: 2 },
        { title: "Mobile responsive audit",    type: "task",    status: "review",      priority: "medium", est: 16, pos: 1 },
        { title: "Write integration docs",     type: "task",    status: "todo",        priority: "low",    est: 16, pos: 1 },
        { title: "Add Slack notifications",    type: "upgrade", status: "todo",        priority: "medium", est: 32, pos: 2 },
        { title: "Enterprise RFP — Acme Corp", type: "rfp",     status: "todo",        priority: "high",   est: 40, pos: 3 },
        { title: "User onboarding flow v2",    type: "story",   status: "todo",        priority: "low",    est: 24, pos: 4 },
      ];

      for (const t of demoTasks) {
        await pool.query(
          `INSERT INTO tasks
             (title, type, status, priority, workspace_id, assigned_user_id, estimated_hours, actual_hours, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [t.title, t.type, t.status, t.priority, workspaceId, user.id, t.est, 0, t.pos]
        ).catch(() => {});  // skip if any error (idempotent re-seed guard)
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    setAuthCookie(res, token);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      isDemo: true,
    });
  } catch (err) {
    console.error("Demo login error:", err);
    res.status(500).json({ message: "Could not start demo session." });
  }
});

module.exports = router;
