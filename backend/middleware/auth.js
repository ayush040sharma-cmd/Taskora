const jwt  = require("jsonwebtoken");
const pool = require("../db");

/**
 * Auth middleware — accepts token from either:
 *  1. httpOnly cookie  "taskora_token"  (preferred, production)
 *  2. Authorization: Bearer <token>    (fallback for API clients / mobile)
 *
 * Role is always re-fetched from the DB — never trusted from the JWT payload.
 * This prevents privilege escalation via forged or stale tokens.
 */
const auth = async (req, res, next) => {
  try {
    const cookieToken = req.cookies?.taskora_token;
    const bearerToken = req.headers["authorization"]?.split(" ")[1];
    const token       = cookieToken || bearerToken;

    if (!token) {
      return res.status(401).json({ message: "Access token required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    // Always read role + suspended from DB — the JWT claim is untrusted for authorization
    const { rows } = await pool.query(
      "SELECT role, is_admin, suspended FROM users WHERE id = $1",
      [decoded.id]
    );

    if (!rows[0]) {
      return res.status(401).json({ message: "User not found" });
    }
    if (rows[0].suspended) {
      return res.status(403).json({ message: "Account suspended" });
    }

    req.user = {
      ...decoded,
      role:     rows[0].role,
      is_admin: rows[0].is_admin ?? false,
    };
    next();
  } catch (err) {
    return res.status(500).json({ message: "Authentication error" });
  }
};

module.exports = auth;
