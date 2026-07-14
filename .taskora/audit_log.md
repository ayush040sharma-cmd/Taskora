# Taskora Audit Log

---

## Automated Daily Audit — 2026-07-14

**Run by:** QA Agent (automated)
**Scope:** Frontend + Backend + AI-Agent

No previous entry exists in this log — this is the first run, so there is no baseline to diff against. Every issue below is reported under "New Issues Since Last Audit" rather than duplicated in its own table.

### Critical Issues Found
| ID | File | Line | Issue |
|----|------|------|-------|
| C-1 | `ai-agent/main.py` | 71 | `CORSMiddleware(allow_origins=["http://localhost:5173", "http://localhost:3001", "*"], allow_credentials=True, ...)` — the literal wildcard `"*"` is present in `allow_origins` alongside `allow_credentials=True`. Any origin can issue credentialed requests to this service. |
| C-2 | `ai-agent/main.py` | 106 | Global exception handler (`@app.exception_handler(Exception)`) returns `{"detail": "Internal server error", "error": str(exc)}` to the client for **every** unhandled exception across the whole API — raw internal error text is exposed regardless of which route failed. |
| C-3 | `ai-agent/config.py` (default) + `ai-agent/firewall/middleware.py` | 22 / 173 | `jwt_secret: str = ""` defaults to an empty string, and `firewall/middleware.py:173` guards JWT verification with `if self._jwt_secret and ...` — when the secret is empty, JWT verification is **skipped entirely** rather than failing closed. If `JWT_SECRET` is unset in an environment, protected routes are silently left unauthenticated instead of blocked. Confirmed by `firewall/tests/test_firewall.py:212`, which uses `jwt_secret=""` specifically to bypass auth while testing unrelated behavior. |

### High Severity Issues Found
| ID | File | Line | Issue |
|----|------|------|-------|
| H-1 | `ai-agent/routers/audit.py`, `backlog.py`, `chat.py`, `code.py`, `logs.py`, `tasks.py` | audit.py:69, backlog.py:71, chat.py:39, code.py:57, logs.py:18, tasks.py:50 | All six routers use `raise HTTPException(status_code=500, detail=str(e))`, leaking internal exception text to API clients (distinct from C-2, which is the catch-all — these are explicit per-route leaks). |
| H-2 | `backend/routes/oauth.js` | 18–35 | The Google OAuth flow (`GET /api/auth/google` → `GET /api/auth/google/callback`) builds the authorization URL with no `state` parameter anywhere in the file. Without a CSRF `state` token generated before redirect and validated on callback, the flow is vulnerable to OAuth login CSRF. |
| H-3 | `frontend/src/components/ManagerDashboard.jsx` | 1534–1556, 1568–1569, 1581 | A block explicitly commented `// ── DEBUG: log raw data on every render ──` runs unconditionally on every render of the team-distribution chart — `console.group`/`console.log` dumping `team[0]` keys, member `user_id`/`id`/`name`, and task internal fields (`assigned_user_id`, `effective_assignee_id`, `workspace_owner_id`) to the browser console in production. Not gated behind a dev-only flag. |

### Medium / Low Issues Found

**Medium (7):**
- `ai-agent/services/pipeline.py:36-45` — `issue.get('title'/'location'/'problem'/'root_cause')` interpolated directly into an f-string prompt sent to Claude with no sanitization. Bounded (lands in a user-turn, not the system prompt), but a real indirect-prompt-injection surface if `issue` can ever originate from user-editable content.
- `ai-agent/services/claude_client.py:16` — `anthropic.Anthropic(api_key=...)` instantiated with no explicit `timeout=`, relying entirely on SDK defaults rather than an app-tuned value.
- `backend/routes/admin.js:84-94` — `POST /users/:id/reset-password` returns the new password in plaintext in the JSON response body.
- `backend/routes/payments.js` — no payment-specific rate limiter; relies solely on the global 300-req/15-min limiter applied to all of `/api`. (Matches a pre-existing finding from `MASTER_AUDIT.md` — still open.)
- `backend/routes/webhooks.js` — Resend webhook signature (svix) still not verified. Self-documented as a known gap in the file's own header comment — still open.
- `backend/routes/payments.js:154-167` — `POST /mock-upgrade` has no try/catch around its `await pool.query(...)`. Low real-world risk since the route 404s outside `NODE_ENV !== "production"`, but inconsistent with every other handler in the file.
- `frontend/src/components/JarvisVoiceAssistant.jsx:564` — `disabled={processingRef.current}` passes a ref value directly to a prop. Ref mutations don't trigger re-renders, so the button's disabled state can lag behind the actual processing state.

**Low (counted only):**
- ~13 `useEffect` hooks across the frontend suppress `exhaustive-deps` via `// eslint-disable-line` (Dashboard.jsx, ActivityFeed.jsx, CalendarView.jsx ×2, IntegrationsPanel.jsx, ManagerDashboard.jsx, TaskDetailModal.jsx ×4, useSpeechRecognition.js, and others).
- ~35 empty `catch {}` blocks in frontend components — mix of legitimate best-effort ignores (e.g. `localStorage.setItem` cleanup) and silent swallows of real API failures with no user-facing error state (notably `ManagerDashboard.jsx:1140,1144,1148`).
- ~35+ uses of `key={i}` / `key={idx}` for React list keys — mostly benign on static/skeleton-loader/chart-axis lists; a few on genuinely dynamic lists (`JarvisVoiceAssistant.jsx:558`, `NLChat.jsx:104`) are worth revisiting.
- Only 2 of ~42 frontend files that call the API from inside `useEffect` use `AbortController` for cleanup (`TaskDetailModal.jsx`, `JarvisVoiceAssistant.jsx`) — the rest have no fetch-cancellation on unmount.
- `req.params.id` used without `parseInt`/type validation across numerous backend routes — low risk in practice since all queries are parameterized (no injection path) and non-numeric IDs are caught generically, but worth tightening for cleaner error messages.
- `frontend/src/components/Board.jsx:8` — stray `console.log("clicked")`. Noted for completeness, but this entire file is dead code: it is never imported anywhere in the app (verified via repo-wide search) and is not reachable from any route.

### New Issues Since Last Audit
No baseline exists — every issue listed above (C-1 through C-3, H-1 through H-3, and all Medium items) is new as of this run.

### Fixed Issues Since Last Audit
None — no prior audit entry exists to diff against.

**Summary:** 3 critical, 3 high, 7 medium, ~100+ low (counted, not individually itemized) — 13 new, 0 fixed
