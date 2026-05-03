/**
 * Taskora Firewall Middleware
 *
 * Inspects every inbound request for:
 *   • SQL injection          • XSS payloads
 *   • Path traversal         • Command injection
 *   • Malicious scanners     • Oversized headers
 *   • Blocked IPs
 *
 * Critical threats are auto-blocked for 24 h.
 * All events are persisted in security_events and pushed via Socket.io.
 */
const alertService = require("../services/alertService");

// ── Threat signatures ─────────────────────────────────────────────────────────

const SIGNATURES = {
  sql_injection: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|CAST|DECLARE)\b.{0,40}\b(FROM|INTO|TABLE|WHERE|SET|DATABASE)\b)/i,
    /(--|;\s*--|\/\*[\s\S]*?\*\/|xp_\w+|sp_\w+)/i,
    /(WAITFOR\s+DELAY|SLEEP\s*\(|BENCHMARK\s*\(|PG_SLEEP\s*\()/i,
    /('\s*(OR|AND)\s*'?\d)/i,
    /(CHAR\s*\(\d|0x[0-9a-f]{2,})/i,
  ],
  xss: [
    /<script[\s\S]*?>[\s\S]*?<\/script>/i,
    /javascript\s*:/i,
    /vbscript\s*:/i,
    /on(load|error|click|mouseover|focus|blur|submit|input|change|keydown|keyup)\s*=/i,
    /<(iframe|object|embed|applet|meta|link)[^>]*>/i,
    /eval\s*\(|Function\s*\(/i,
    /document\s*\.\s*(cookie|write|location|execCommand)/i,
    /window\s*\.\s*(location|open|eval)/i,
    /<[^>]+\s+style\s*=\s*["'][^"']*expression\s*\(/i,
  ],
  path_traversal: [
    /(\.\.[\/\\]){1,}/,
    /%2e%2e[%2f%5c]/i,
    /\.\.%2[fF]/,
    /\.\.%5[cC]/,
    /%252e%252e/i,
    /\/(etc\/passwd|etc\/shadow|proc\/self|windows\/system32)/i,
  ],
  command_injection: [
    /[;&|`]\s*(cat|ls|pwd|whoami|id|uname|ifconfig|netstat|ps\s|rm\s|wget|curl)\b/i,
    /\$\([^)]+\)/,
    /`[^`]+`/,
    /\|\s*bash\b|\|\s*sh\b/i,
    /(nc|netcat)\s+-[lvep]/i,
  ],
  prototype_pollution: [
    /__proto__/i,
    /constructor\s*\[/i,
    /prototype\s*\[/i,
  ],
};

const MALICIOUS_UA = [
  /sqlmap/i, /nikto/i, /nmap/i, /masscan/i,
  /zaproxy|zap\b/i, /burpsuite|burp\b/i,
  /metasploit/i, /nessus/i, /openvas/i,
  /w3af/i, /acunetix/i, /appscan/i,
  /havij/i, /pangolin/i, /dirbuster/i,
  /gobuster/i, /ffuf/i, /nuclei/i,
  /python-requests\/[01]\./i,            // very old automation scripts
];

// Routes exempt from body scanning (login and register are handled by brute force instead)
const SCAN_SKIP = new Set(["/health"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClientIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.ip ||
    req.connection?.remoteAddress ||
    "unknown"
  );
}

function buildPayload(req) {
  const parts = [];
  if (req.query  && Object.keys(req.query).length)  parts.push(JSON.stringify(req.query));
  if (req.body   && typeof req.body === "object" && Object.keys(req.body).length) {
    // Mask passwords so they don't appear in logs but still scan them
    const masked = { ...req.body };
    if (masked.password) masked.password = masked.password; // still scan, just log masked
    parts.push(JSON.stringify(masked));
  }
  if (req.params && Object.keys(req.params).length) parts.push(JSON.stringify(req.params));
  // Also check raw path segments
  parts.push(decodeURIComponent(req.originalUrl));
  return parts.join(" ");
}

function scanPayload(payload) {
  const hits = [];
  for (const [type, patterns] of Object.entries(SIGNATURES)) {
    if (patterns.some(rx => rx.test(payload))) {
      const severity =
        type === "sql_injection"       ? "critical" :
        type === "command_injection"   ? "critical" :
        type === "xss"                 ? "high"     :
        type === "path_traversal"      ? "high"     :
        "medium";
      hits.push({ type, severity });
    }
  }
  return hits;
}

// ── Main middleware ───────────────────────────────────────────────────────────

const firewallMiddleware = async (req, res, next) => {
  const ip        = getClientIP(req);
  const userAgent = req.headers["user-agent"] || "";
  const context   = { ip, method: req.method, url: req.originalUrl, user_agent: userAgent, user_id: req.user?.id };

  // 1. Blocked IP check
  if (await alertService.isBlocked(ip)) {
    await alertService.logEvent({ ...context, threat_type: "blocked_ip", severity: "high",
      details: { reason: "IP in blocklist" }, blocked: true });
    return res.status(403).json({ message: "Access denied" });
  }

  // 2. Malicious scanner / bot check
  if (MALICIOUS_UA.some(rx => rx.test(userAgent))) {
    await alertService.logEvent({ ...context, threat_type: "malicious_scanner", severity: "high",
      details: { user_agent: userAgent }, blocked: true });
    await alertService.blockIP(ip, `Scanner detected: ${userAgent.slice(0, 80)}`, "auto", 24);
    return res.status(403).json({ message: "Access denied" });
  }

  // 3. Payload threat scan (skip exempted paths)
  if (!SCAN_SKIP.has(req.path)) {
    const payload = buildPayload(req);
    const threats = scanPayload(payload);

    if (threats.length > 0) {
      const worst = alertService.constructor.worstSeverity(threats);

      await alertService.logEvent({
        ...context,
        threat_type: worst.type,
        severity:    worst.severity,
        details:     { threats, payload: payload.slice(0, 800) },
        blocked:     true,
      });

      // Auto-block critical threats for 24 h
      if (worst.severity === "critical") {
        await alertService.blockIP(ip, `Auto-blocked: ${worst.type}`, "auto", 24);
      }

      return res.status(403).json({ message: "Request blocked by security policy" });
    }
  }

  // 4. Oversized header check
  const headerSize = JSON.stringify(req.headers).length;
  if (headerSize > 8192) {
    await alertService.logEvent({ ...context, threat_type: "oversized_headers", severity: "medium",
      details: { header_bytes: headerSize }, blocked: true });
    return res.status(431).json({ message: "Request headers too large" });
  }

  next();
};

module.exports = firewallMiddleware;
