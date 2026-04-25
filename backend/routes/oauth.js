const express = require("express");
const router = express.Router();
const axios = require("axios");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { setAuthCookie } = require("../utils/cookies");

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const FRONTEND_URL         = process.env.FRONTEND_URL || "http://localhost:5173";

// Helper — redirect to frontend with error
function failRedirect(res, msg) {
  return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(msg)}`);
}

// GET /api/auth/google  — kick off OAuth flow
router.get("/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(501).json({
      message: "Google OAuth is not configured on this server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.",
    });
  }

  const callbackURL = `${process.env.BACKEND_URL || "http://localhost:3001"}/api/auth/google/callback`;
  const scope = "openid email profile";

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackURL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account");

  res.redirect(url.toString());
});

// GET /api/auth/google/callback  — exchange code → tokens → user
router.get("/google/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return failRedirect(res, "Google sign-in was cancelled or failed.");
  }

  try {
    const callbackURL = `${process.env.BACKEND_URL || "http://localhost:3001"}/api/auth/google/callback`;

    // 1. Exchange code for access token
    const tokenRes = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri:  callbackURL,
      grant_type:    "authorization_code",
    });

    const { access_token, id_token } = tokenRes.data;

    // 2. Get user info from Google
    const profileRes = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { email, name, sub: googleId, picture } = profileRes.data;

    if (!email) return failRedirect(res, "Could not retrieve email from Google.");

    // 3. Find or create user in our database
    let user = null;

    const existing = await pool.query(
      "SELECT id, name, email, role FROM users WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      // Existing user — update google_id if not set
      user = existing.rows[0];
      await pool.query(
        "UPDATE users SET google_id = $1, last_login_at = NOW() WHERE id = $2",
        [googleId, user.id]
      ).catch(() => {}); // ignore if google_id column doesn't exist yet
    } else {
      // New user — create account
      // Generate a random unusable password (Google users won't use it)
      const randomPass = require("crypto").randomBytes(32).toString("hex");
      const bcrypt = require("bcryptjs");
      const hash = await bcrypt.hash(randomPass, 10);

      const newUser = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, google_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, role`,
        [name || email.split("@")[0], email, hash, "manager", googleId]
      ).catch(async () => {
        // google_id column may not exist — try without it
        return pool.query(
          `INSERT INTO users (name, email, password_hash, role)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, email, role`,
          [name || email.split("@")[0], email, hash, "manager"]
        );
      });

      user = newUser.rows[0];

      // Create default workspace
      await pool.query(
        "INSERT INTO workspaces (name, user_id) VALUES ($1, $2)",
        [`${user.name}'s Workspace`, user.id]
      );
    }

    // 4. Issue our JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 5. Set httpOnly cookie and redirect to frontend
    setAuthCookie(res, token);
    return res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
      id:    user.id,
      name:  user.name,
      email: user.email,
      role:  user.role,
    }))}`);

  } catch (err) {
    console.error("Google OAuth error:", err.response?.data || err.message);
    return failRedirect(res, "Google sign-in failed. Please try again.");
  }
});

module.exports = router;
