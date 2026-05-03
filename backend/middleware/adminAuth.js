const auth = require("./auth");

module.exports = (req, res, next) => {
  auth(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== "manager") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  });
};
