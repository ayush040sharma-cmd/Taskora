/**
 * Brute-Force Protection
 *
 * Tracks failed login attempts per IP in memory.
 * After MAX_ATTEMPTS in WINDOW_MS, the IP is soft-blocked for BLOCK_MS
 * AND written to blocked_ips via alertService.
 */
const alertService = require("../services/alertService");

const MAX_ATTEMPTS = 5;
const WINDOW_MS    = 15 * 60 * 1000;  // 15 min rolling window
const BLOCK_MS     = 60 * 60 * 1000;  // 1 h soft block

// ip → { count, firstAt, blockedUntil? }
const store = new Map();

// Prune stale entries every 30 min to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of store) {
    const expired = rec.blockedUntil
      ? now > rec.blockedUntil
      : now - rec.firstAt > WINDOW_MS;
    if (expired) store.delete(ip);
  }
}, 30 * 60 * 1000);

const bruteForce = {
  /**
   * Mount on login / password-reset routes BEFORE auth processing.
   * Returns 429 if the IP is currently blocked.
   */
  middleware: async (req, res, next) => {
    const ip  = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;
    const now = Date.now();
    const rec = store.get(ip);

    if (rec?.blockedUntil && now < rec.blockedUntil) {
      const secsLeft = Math.ceil((rec.blockedUntil - now) / 1000);
      await alertService.logEvent({
        ip, method: req.method, url: req.originalUrl,
        threat_type: "brute_force_blocked", severity: "high",
        details: { seconds_remaining: secsLeft },
        user_agent: req.headers["user-agent"], blocked: true,
      });
      return res.status(429).json({
        message: `Too many failed attempts. Try again in ${Math.ceil(secsLeft / 60)} min.`,
      });
    }

    next();
  },

  /**
   * Call this when a login FAILS (wrong password / unknown user).
   */
  recordFailure: async (ip, url, userAgent) => {
    const now = Date.now();
    let rec   = store.get(ip) || { count: 0, firstAt: now };

    // Reset window if expired
    if (now - rec.firstAt > WINDOW_MS) {
      rec = { count: 0, firstAt: now };
    }

    rec.count++;
    store.set(ip, rec);

    if (rec.count >= MAX_ATTEMPTS) {
      rec.blockedUntil = now + BLOCK_MS;
      store.set(ip, rec);

      await alertService.logEvent({
        ip, method: "POST", url,
        threat_type: "brute_force", severity: "critical",
        details: { attempts: rec.count, window_minutes: WINDOW_MS / 60000 },
        user_agent: userAgent, blocked: true,
      });

      await alertService.blockIP(
        ip,
        `Brute force: ${rec.count} failed logins in ${WINDOW_MS / 60000} min`,
        "auto",
        1
      );
    }
  },

  /** Call this when a login SUCCEEDS — clears the failure counter. */
  recordSuccess: (ip) => {
    store.delete(ip);
  },
};

module.exports = bruteForce;
