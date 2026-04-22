const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const pool = require("../db");
const auth = require("../middleware/auth");

// Rate limiter: max 10 attempts per IP per 15 minutes on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in 15 minutes." },
});

// POST /api/auth/register
router.post("/register", authLimiter, async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required" });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const userResult = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, password_hash]
    );
    const user = userResult.rows[0];

    // Create default workspace for new user
    await pool.query(
      "INSERT INTO workspaces (name, user_id) VALUES ($1, $2)",
      [`${name}'s Workspace`, user.id]
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: { ...user, onboarding_step: "workspace_setup", onboarding_completed: false },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// POST /api/auth/login
router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Update last login timestamp
    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

// POST /api/auth/refresh — re-issue a fresh token for a valid existing token
router.post("/refresh", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
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
router.put("/password", auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ message: "Both current and new password are required" });
  if (new_password.length < 6)
    return res.status(400).json({ message: "New password must be at least 6 characters" });
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

module.exports = router;
