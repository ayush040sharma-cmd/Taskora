const jwt = require("jsonwebtoken");

/**
 * Auth middleware — accepts token from either:
 *  1. httpOnly cookie  "taskora_token"  (preferred, production)
 *  2. Authorization: Bearer <token>    (fallback for API clients / mobile)
 *
 * This dual-source approach means existing clients keep working
 * while we migrate toward cookie-only in the frontend.
 */
const auth = (req, res, next) => {
  const cookieToken = req.cookies?.taskora_token;
  const bearerToken = req.headers["authorization"]?.split(" ")[1];
  const token       = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

module.exports = auth;
