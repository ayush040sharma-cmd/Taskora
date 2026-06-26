const auth = require("./auth");

// Guards /api/admin/* — only super_boss (system admins) may access.
// Regular managers are NOT admins and must be blocked here.
module.exports = (req, res, next) => {
  auth(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== "super_boss") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  });
};
