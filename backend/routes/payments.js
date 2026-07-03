/**
 * Payments API — Razorpay integration
 *
 * POST /api/payments/create-order  → create Razorpay order
 * POST /api/payments/verify        → verify + update plan
 * GET  /api/payments/plans         → return plan pricing info
 */
const express  = require("express");
const router   = express.Router();
const crypto   = require("crypto");
const pool     = require("../db");
const auth     = require("../middleware/auth");
const logger   = require("../utils/logger");

const PLAN_PRICES = {
  pro:        { amount: 700,  currency: "USD", label: "Pro",        period: "month" },
  enterprise: { amount: 2500, currency: "USD", label: "Enterprise", period: "month" },
};

// Lazy-load Razorpay so the server starts even without keys
function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys not configured");
  }
  const Razorpay = require("razorpay");
  return new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// GET /api/payments/plans — public
router.get("/plans", (req, res) => {
  res.json({
    free:       { amount: 0,  currency: "USD", label: "Free",       period: "forever" },
    pro:        { amount: 7,  currency: "USD", label: "Pro",        period: "month" },
    enterprise: { amount: 25, currency: "USD", label: "Enterprise", period: "month" },
  });
});

// POST /api/payments/create-order
router.post("/create-order", auth, async (req, res) => {
  if (req.user.is_admin) return res.status(403).json({ message: "Admin accounts do not require a plan purchase." });
  const { plan } = req.body;
  if (!PLAN_PRICES[plan]) {
    return res.status(400).json({ message: "Invalid plan" });
  }

  try {
    const rzp = getRazorpay();
    const { amount, currency } = PLAN_PRICES[plan];

    // Defensive — amount always comes from PLAN_PRICES above, never from the
    // request body, but Razorpay itself rejects orders below its minimum too.
    if (amount < 100) {
      return res.status(400).json({ message: "Order amount below Razorpay's minimum (100 in the smallest currency unit)" });
    }

    const order = await rzp.orders.create({
      amount,
      currency,
      receipt:  `taskora_${req.user.id}_${Date.now()}`,
      notes: { user_id: String(req.user.id), plan },
    });

    res.json({
      order_id: order.id,
      amount,
      currency,
      key_id:   process.env.RAZORPAY_KEY_ID,
      plan,
    });
  } catch (err) {
    // If Razorpay not configured, return mock for dev
    if (err.message === "Razorpay keys not configured") {
      logger.warn("Razorpay not configured — returning mock order for dev");
      return res.json({
        order_id: `mock_order_${Date.now()}`,
        amount:   PLAN_PRICES[plan].amount,
        currency: PLAN_PRICES[plan].currency,
        key_id:   "rzp_test_mock",
        plan,
        mock:     true,
      });
    }
    // Razorpay rejects the request itself due to bad/revoked key credentials —
    // surface as 401 rather than a generic 500, per Razorpay's error shape
    // (statusCode 401, error.code "BAD_REQUEST_ERROR" with an auth-related description).
    if (err.statusCode === 401 || /authentication|key_id/i.test(err.error?.description || "")) {
      logger.error(`Razorpay authentication failed: ${err.error?.description || err.message}`);
      return res.status(401).json({ message: "Payment gateway authentication failed" });
    }
    logger.error(`Razorpay order creation failed: ${err.message}`);
    res.status(500).json({ message: "Payment initiation failed" });
  }
});

// POST /api/payments/verify
router.post("/verify", auth, async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, plan, mock } = req.body;

  if (!PLAN_PRICES[plan]) {
    return res.status(400).json({ message: "Invalid plan" });
  }
  if (!mock && (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature)) {
    return res.status(400).json({ message: "razorpay_payment_id, razorpay_order_id, and razorpay_signature are required" });
  }

  try {
    // Skip verification for mock orders in dev
    if (!mock) {
      const secret = process.env.RAZORPAY_KEY_SECRET;
      if (!secret) throw new Error("Razorpay not configured");

      const expected = crypto
        .createHmac("sha256", secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (expected !== razorpay_signature) {
        return res.status(400).json({ message: "Payment verification failed — invalid signature" });
      }
    }

    // Update user plan
    const { rows } = await pool.query(
      `UPDATE users SET plan = $1 WHERE id = $2
       RETURNING id, name, email, role, onboarding_role, team_size, onboarding_complete, plan`,
      [plan, req.user.id]
    );

    const updatedUser = rows[0];
    logger.info(`Plan upgraded: user ${req.user.id} → ${plan}`);

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    logger.error(`Payment verification failed: ${err.message}`);
    res.status(500).json({ message: "Verification failed" });
  }
});

// POST /api/payments/mock-upgrade (dev only — instant plan change without payment)
router.post("/mock-upgrade", auth, async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Not found" });
  }
  const { plan } = req.body;
  if (!["free","pro","enterprise"].includes(plan)) {
    return res.status(400).json({ message: "Invalid plan" });
  }
  const { rows } = await pool.query(
    "UPDATE users SET plan = $1 WHERE id = $2 RETURNING id, name, email, role, onboarding_role, team_size, onboarding_complete, plan",
    [plan, req.user.id]
  );
  res.json({ success: true, user: rows[0] });
});

module.exports = router;
