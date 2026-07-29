const express     = require("express");
const router      = express.Router();
const bcrypt      = require("bcryptjs");
const jwt         = require("jsonwebtoken");
const rateLimit   = require("express-rate-limit");
const pool        = require("../db");
const auth        = require("../middleware/auth");
const { resolvePermissions } = require("../middleware/permission");
const bruteForce  = require("../middleware/bruteForce");
const { validate, schemas } = require("../utils/validate");
const { setAuthCookie, clearAuthCookie } = require("../utils/cookies");
const logger      = require("../utils/logger");
const { sendPasswordReset } = require("../services/emailService");

// Rate limiter: max 10 attempts per IP per 15 minutes on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in 15 minutes." },
});

// Separate, lenient limiter for forgot-password (5 per hour — independent of login attempts)
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests. Please try again in an hour." },
});

// Looser limiter for the demo endpoint — no credential to brute-force
const demoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many demo requests. Please wait a few minutes." },
});

// POST /api/auth/register
// Health / keepalive — no auth, no rate limit
router.get("/status", (req, res) => res.json({ ok: true, ts: Date.now() }));

router.post("/register", authLimiter, validate(schemas.register), async (req, res) => {
  const { name, email, password, role } = req.body;

  // Map the frontend role selection to a platform role.
  // Workspace creators get "manager" so they can manage their own workspace.
  // "super_boss" is reserved for explicit admin promotion and never granted at registration.
  const ROLE_MAP = { manager: "manager", member: "team_member" };
  const safeRole = ROLE_MAP[role] || "manager";
  // Preserve the stated preference for onboarding personalisation
  const onboardingRole = role === "member" ? "member" : "manager";

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const userResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, onboarding_role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, onboarding_role, onboarding_complete, plan, team_size, is_admin`,
      [name, email, password_hash, safeRole, onboardingRole]
    );
    const user = userResult.rows[0];

    // Assign super_admin enterprise role so requirePerm() works without legacy fallback
    try {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = 'super_admin'
         ON CONFLICT DO NOTHING`,
        [user.id]
      );
    } catch {}

    // Create default workspace for new user
    await pool.query(
      "INSERT INTO workspaces (name, user_id) VALUES ($1, $2)",
      [`${name}'s Workspace`, user.id]
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, is_admin: user.is_admin ?? false },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    setAuthCookie(res, token);
    res.status(201).json({
      token,
      user: {
        id:                  user.id,
        name:                user.name,
        email:               user.email,
        role:                user.role,
        onboarding_role:     user.onboarding_role     || null,
        onboarding_complete: user.onboarding_complete ?? false,
        plan:                user.plan                || "free",
        team_size:           user.team_size           || null,
        is_admin:            user.is_admin            ?? false,
      },
    });
  } catch (err) {
    logger.error(`Register error: ${err.message}`);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// POST /api/auth/login
router.post("/login", authLimiter, bruteForce.middleware, validate(schemas.login), async (req, res) => {
  const { email, password } = req.body;
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) {
      await bruteForce.recordFailure(ip, req.originalUrl, req.headers["user-agent"]);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await bruteForce.recordFailure(ip, req.originalUrl, req.headers["user-agent"]);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    bruteForce.recordSuccess(ip);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, is_admin: user.is_admin ?? false },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

    setAuthCookie(res, token);
    res.json({ token, user: {
      id:                  user.id,
      name:                user.name,
      email:               user.email,
      role:                user.role,
      onboarding_role:     user.onboarding_role     || null,
      onboarding_complete: user.onboarding_complete ?? false,
      plan:                user.plan                || "free",
      team_size:           user.team_size           || null,
      is_admin:            user.is_admin            ?? false,
    }});
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
  const { name, timezone } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "Name is required" });
  if (timezone !== undefined && (typeof timezone !== "string" || timezone.length > 50)) {
    return res.status(400).json({ message: "Invalid timezone" });
  }
  try {
    // timezone defaults to 'UTC' in the DB (schema-v5.sql) and was never
    // actually settable from the frontend before this — RegionalSection's
    // timezone picker only wrote to localStorage. See
    // docs/briefing-engine-plan.md §6.4 for why this matters: the briefing
    // scheduler sends at each user's local hour, so an unset/wrong
    // users.timezone means briefings arrive at the wrong time.
    const result = timezone !== undefined
      ? await pool.query(
          "UPDATE users SET name = $1, timezone = $2 WHERE id = $3 RETURNING id, name, email, timezone",
          [name.trim(), timezone, req.user.id]
        )
      : await pool.query(
          "UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, timezone",
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

// GET /api/auth/me — returns full user including plan + onboarding fields
router.get("/me", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, onboarding_role, team_size,
              onboarding_complete, plan, is_admin, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ ...user, plan: user.plan || "free", is_admin: user.is_admin ?? false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/auth/me/sidebar-views — sidebar view IDs granted via custom roles
router.get("/me/sidebar-views", auth, async (req, res) => {
  try {
    const perms = await resolvePermissions(req.user.id, null);
    const views = [];
    for (const [key] of perms) {
      if (key.startsWith("sidebar:")) views.push(key.slice("sidebar:".length));
    }
    res.json({ views });
  } catch {
    res.json({ views: [] });
  }
});

// PATCH /api/auth/me — complete onboarding: set role + team_size
router.patch("/me", auth, async (req, res) => {
  const { onboarding_role, team_size } = req.body;
  const VALID_ROLES = ["solo", "member", "manager"];

  if (onboarding_role && !VALID_ROLES.includes(onboarding_role)) {
    return res.status(400).json({ message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET onboarding_role     = COALESCE($1, onboarding_role),
           team_size           = COALESCE($2, team_size),
           onboarding_complete = TRUE
       WHERE id = $3
       RETURNING id, name, email, role, onboarding_role, team_size,
                 onboarding_complete, plan, created_at`,
      [onboarding_role || null, team_size || null, req.user.id]
    );
    const user = rows[0];
    res.json({ ...user, plan: user.plan || "free" });
  } catch (err) {
    logger.error(`PATCH /me error: ${err.message}`);
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
router.post("/forgot-password", forgotPasswordLimiter, validate(schemas.forgotPassword), async (req, res) => {
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
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const resetLink   = `${frontendUrl}/reset-password?token=${token}`;

      // Always log the link — visible in Render logs as a fallback if email fails
      logger.info(`[password-reset] link generated for ${email} → ${resetLink}`);

      await sendPasswordReset({ toEmail: email, userName: user.name, resetLink });
    }
  } catch (err) {
    logger.error(`Forgot password error: ${err.message}`, { stack: err.stack });
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

// POST /api/auth/demo — creates a fresh isolated demo session per request.
// Each caller gets their own ephemeral user + workspace so concurrent demo users
// never share data or real-time socket events.
router.post("/demo", demoLimiter, async (req, res) => {
  const crypto = require("crypto");

  try {
    // Purge expired ephemeral demo accounts (TTL = 2h, matching the JWT expiry).
    // Delete workspaces first so tasks cascade, then delete the users.
    await pool.query(
      `DELETE FROM workspaces
       WHERE user_id IN (
         SELECT id FROM users
         WHERE email LIKE 'demo\\_%@demo.taskora.internal' ESCAPE '\\'
           AND created_at < NOW() - INTERVAL '2 hours'
       )`
    ).catch(() => {});
    await pool.query(
      `DELETE FROM users
       WHERE email LIKE 'demo\\_%@demo.taskora.internal' ESCAPE '\\'
         AND created_at < NOW() - INTERVAL '2 hours'`
    ).catch(() => {});

    // Create a unique ephemeral identity for this session
    const uid  = crypto.randomBytes(6).toString("hex");
    const demoEmail = `demo_${uid}@demo.taskora.internal`;
    const demoName  = "Demo User";

    const hash = await bcrypt.hash(`demo-${uid}-not-for-login`, 10);
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role",
      [demoName, demoEmail, hash, "manager"]
    );
    const user = result.rows[0];

    // Create a private demo workspace for this session
    const ws = await pool.query(
      "INSERT INTO workspaces (name, user_id) VALUES ($1, $2) RETURNING id",
      ["Taskora Demo Workspace", user.id]
    );
    const workspaceId = ws.rows[0].id;

    // Seed realistic demo tasks
    const demoTasks = [
      { title: "Design new landing page",    type: "task",    status: "done",       priority: "high",   est: 16, pos: 1 },
      { title: "Fix checkout flow bug",      type: "bug",     status: "done",       priority: "high",   est: 8,  pos: 2 },
      { title: "Sprint planning — Q3",       type: "story",   status: "done",       priority: "medium", est: 4,  pos: 3 },
      { title: "Q3 feature roadmap doc",     type: "story",   status: "inprogress", priority: "high",   est: 40, pos: 1 },
      { title: "API rate limiting setup",    type: "upgrade", status: "inprogress", priority: "medium", est: 24, pos: 2 },
      { title: "Mobile responsive audit",    type: "task",    status: "review",     priority: "medium", est: 16, pos: 1 },
      { title: "Write integration docs",     type: "task",    status: "todo",       priority: "low",    est: 16, pos: 1 },
      { title: "Add Slack notifications",    type: "upgrade", status: "todo",       priority: "medium", est: 32, pos: 2 },
      { title: "Enterprise RFP — Acme Corp", type: "rfp",    status: "todo",       priority: "high",   est: 40, pos: 3 },
      { title: "User onboarding flow v2",    type: "story",   status: "todo",       priority: "low",    est: 24, pos: 4 },
    ];

    for (const t of demoTasks) {
      await pool.query(
        `INSERT INTO tasks
           (title, type, status, priority, workspace_id, assigned_user_id, estimated_hours, actual_hours, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [t.title, t.type, t.status, t.priority, workspaceId, user.id, t.est, 0, t.pos]
      ).catch(() => {});
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
    logger.error(`Demo login error: ${err.message}`);
    res.status(500).json({ message: "Could not start demo session." });
  }
});

module.exports = router;
