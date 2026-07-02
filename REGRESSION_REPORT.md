# REGRESSION REPORT
**Taskora v1.0 — Phase 3 Audit**
**Date:** 2026-06-30

---

## PREVIOUSLY FIXED — VERIFIED PASSING ✅

| Issue ID | Description | Fix Applied | Status |
|---|---|---|---|
| BUG-START-01 | "Failed to start task" on clicking Start button | Added `status_changed_at` column to tasks table in Neon | ✅ VERIFIED |
| BUG-EMAIL-01 | Forgot password email not delivered | Set RESEND_API_KEY on Render; fixed FROM_EMAIL env var in auth.js; separate forgotPasswordLimiter | ✅ FIXED (email infra) |
| BUG-CACHE-01 | Stale JS/CSS assets after deployment | Added Cache-Control headers in vercel.json (immutable for /assets/*, no-cache for index.html) | ✅ VERIFIED |
| SEC-01 | localStorage exposes sensitive JWT data | localStorage `user` object contains only id, name, email, role — no token, no password_hash | ✅ VERIFIED |

---

## NEW REGRESSIONS FOUND IN THIS AUDIT

### REG-01: Sprint Creation Broken by Keyboard Shortcut Conflict
- **Introduced:** Likely when global keyboard shortcuts were added
- **Symptom:** Typing "Sprint 1 — Q3 Launch" in the sprint name field causes "n" keypress to open the Create Task modal, breaking sprint creation entirely
- **Severity:** P1 — core planning feature broken
- **Affected:** All users trying to create a sprint with any name containing shortcut keys (n, b, k, etc.)

### REG-02: "Workspace Preferences" Settings Navigation Broken
- **Symptom:** Clicking "Workspace Preferences" in settings sidebar shows "General" content
- **Severity:** P2 — confusing but not blocking
- **Affected:** All users accessing settings

---

## FEATURES CONFIRMED STABLE (No Regression)

- Board Kanban view: columns, task cards, filters, search
- TaskDetailModal: all tabs (Subtasks, Effort, Comments), auto-save, status dropdown
- Create Task modal: validation, task type selection, creation
- Summary view: all widgets, Focus Mode timer
- Calendar: month navigation, event creation, event display
- Manager View: all 6 tabs load without error
- Analytics: Overview and Command Center tabs
- Global search (Ctrl+K): returns results, navigates to task
- Notification bell: opens/closes, shows empty state
- Dark mode toggle: switches theme instantly
- Active Sessions display in Security settings
- Demo session authentication flow

---

## SCHEMA MIGRATION STATUS

The following columns were added to the Neon database (user must confirm these were run):

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_by_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_severity VARCHAR(20) DEFAULT 'medium';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_expected_resolution DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS date_blocked TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS unblocked_at TIMESTAMPTZ;
```

**Verification:** The Start button now works, confirming `status_changed_at` migration was applied.
