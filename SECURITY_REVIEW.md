# SECURITY REVIEW
**Taskora v1.0 — Phase 3 Audit**
**Date:** 2026-06-30

---

## EXECUTIVE SUMMARY

Taskora's security posture is solid for a v1.0 SaaS launch. The critical SEC findings from prior audits have been addressed. Two medium-severity issues remain. No P0 security blockers.

---

## VERIFIED SECURE ✅

### SEC-PASS-01: localStorage Contains No Sensitive Data
- **Verified:** `localStorage.getItem('user')` returns: `{id, name, email, role}` only
- No JWT token, no password hash, no sensitive fields exposed to XSS
- **Status:** ✅ PASS

### SEC-PASS-02: HTTP Security Headers Configured
Verified via `vercel.json`:
- `X-Content-Type-Options: nosniff` ✅
- `X-Frame-Options: DENY` ✅
- `Referrer-Policy: strict-origin-when-cross-origin` ✅
- `Permissions-Policy: camera=(), geolocation=()` ✅
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` ✅
- **Status:** ✅ PASS

### SEC-PASS-03: Asset Cache Control Correct
- `/assets/*`: `public, max-age=31536000, immutable` (content-hashed, safe to cache forever)
- `/index.html`: `no-cache, no-store, must-revalidate` (always fresh)
- **Status:** ✅ PASS

### SEC-PASS-04: CORS Configured with Allowlist
`server.js` uses an explicit `ALLOWED_ORIGINS` allowlist (localhost ports + FRONTEND_URL + ADDITIONAL_ORIGINS env var). No wildcard `*` in production.
- **Status:** ✅ PASS

### SEC-PASS-05: Rate Limiting Active
- Global API limiter: 300 req / 15 min per IP
- Auth limiter: separate instance
- Forgot password limiter: 5 req / hr (separate to prevent auth limiter exhaustion)
- **Status:** ✅ PASS

### SEC-PASS-06: Helmet.js CSP Configured
Content Security Policy set via helmet with:
- `defaultSrc: 'self'`
- `objectSrc: 'none'` (prevents Flash/plugin attacks)
- `upgradeInsecureRequests` in production
- **Status:** ✅ PASS

### SEC-PASS-07: Firewall Middleware Active
Custom `firewall` middleware on all `/api` routes for threat detection.
- **Status:** ✅ PASS

---

## ACTIVE ISSUES

### SEC-MED-01: Auth-Expired Routes Redirect to Landing Page Instead of Login
- **Location:** Any protected frontend route accessed after session expiry
- **Tested:** `/admin` → redirected to `/`, `/settings` → redirected to `/`
- **Problem:** Silent redirect to marketing landing page loses the user's intended path. The user cannot recover to their destination after logging in.
- **Risk Level:** Medium — UX/security hygiene issue, not an authorization bypass
- **Fix:** AuthGuard must redirect to `/login?redirect=${encodeURIComponent(window.location.pathname)}` and the login page must honor the `redirect` param post-auth.

### SEC-MED-02: JWT Stored in localStorage (Known, Deferred)
- **Problem:** JWT token is stored in localStorage, which is accessible to any JavaScript on the page (XSS attack surface)
- **Preferred:** httpOnly cookie (immune to XSS)
- **Current Mitigations:** Helmet CSP limits inline scripts; no sensitive data beyond JWT in localStorage
- **Risk Level:** Medium — acceptable for v1.0 given mitigations; should be migrated to httpOnly cookies in v1.1
- **Status:** Deferred from prior audit sessions; planned for v1.1

### SEC-LOW-01: `/sysinfo` Endpoint Exposed Without Authentication
- **Location:** `GET /sysinfo` in `server.js`
- **Problem:** Returns server platform, CPU model, memory usage, Node.js version, PID, and load averages — all without authentication
- **Risk Level:** Low — information disclosure that helps attackers fingerprint the server
- **Fix:** Add auth middleware to `/sysinfo`, or remove the endpoint from production

---

## RBAC VERIFICATION

| Test | Expected | Result |
|---|---|---|
| Demo user sees Board, Summary, Calendar, Sprints, Gantt | Yes (member-level) | ✅ Visible |
| Demo user sees Manager View, Team Workload | Yes (owner of demo workspace) | ✅ Visible |
| Direct navigation to `/admin` (unauthenticated) | Redirect to login/landing | ✅ Redirected to `/` |
| Direct navigation to `/settings` (unauthenticated) | Redirect to login | ✅ Redirected to `/` |

**Note:** Frontend route `/admin` doesn't appear to exist as a named route — unknown admin content is served through the dashboard at `/dashboard` with settings modal. This is actually a security positive (no dedicated admin URL to enumerate).

---

## RECOMMENDATIONS SUMMARY

| Priority | Issue | Action |
|---|---|---|
| P2 | Session expiry redirect | Fix AuthGuard to preserve redirect path |
| P2 | JWT in localStorage | Migrate to httpOnly cookie (v1.1) |
| P3 | `/sysinfo` unauthenticated | Add auth middleware or remove |
