const pool = require("../db");
const jwt  = require("jsonwebtoken");

const PLAN_RANK = { free: 0, pro: 1, enterprise: 2 };

const PROTECTED = {
  "/api/sprints":  "pro",
  "/api/workload": "enterprise",
  "/api/capacity": "enterprise",
  "/api/ai":       "enterprise",
};

module.exports = async (req, res, next) => {
  const required = Object.entries(PROTECTED).find(([prefix]) =>
    req.originalUrl.startsWith(prefix)
  )?.[1];

  if (!required) return next();

  // planEnforce runs before route-level auth middleware, so req.user may not be
  // set yet. Verify the token here so we can check the user's plan.
  if (!req.user) {
    const token = req.cookies?.taskora_token ||
                  req.headers.authorization?.split(" ")[1];
    if (!token) return next(); // no token — let route's own auth return 401
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return next(); // bad token — let route's own auth return 403
    }
  }

  try {
    const { rows } = await pool.query(
      "SELECT plan FROM users WHERE id = $1", [req.user.id]
    );
    const plan = rows[0]?.plan || "free";

    if (PLAN_RANK[plan] < PLAN_RANK[required]) {
      return res.status(403).json({
        message:       `This feature requires the ${required} plan.`,
        required_plan: required,
        current_plan:  plan,
        upgrade_url:   "/pricing",
      });
    }
    req.userPlan = plan;
    next();
  } catch (err) {
    next(err);
  }
};
