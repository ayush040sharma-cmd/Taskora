# RELEASE VALIDATION REPORT
**Taskora v1.0 — Phase 3 Audit**
**Date:** 2026-06-30
**Auditor:** Claude Code (automated browser audit)
**Method:** Full persona-based user simulation across all views

---

## AUDIT SCOPE

Full user journey audited: Landing Page → Login → Dashboard → Every Sidebar View → Settings → Logout

**Sessions used:** 4 demo sessions (5-min limit each)
**Views tested:** Board, Summary, Calendar, Sprints, Gantt Chart, Teams, Manager View, Team Workload, Members, Analytics, What-If Simulation, Activity Feed, Dependency Graph, Integrations, Settings (General, Security, Project Settings), Notifications, Global Search

---

## P0 CRITICAL ISSUES (Launch blockers — must fix before release)

**Status: 0 P0 issues remaining** ✅

The previously identified P0 issues have been resolved:
- ✅ Start button ("Failed to start task") — FIXED (status_changed_at column added)
- ✅ Forgot password email delivery — FIXED (RESEND_API_KEY set, FROM_EMAIL corrected)

---

## P1 HIGH ISSUES (Should fix before release)

### P1-01: Landing Page FCP 4988ms — Extremely Slow
- **Location:** `https://taskora-8yhk.vercel.app/`
- **Problem:** First Contentful Paint measured at ~5 seconds. Industry standard for SaaS is <2s.
- **Impact:** High bounce rate for new visitors arriving via marketing/ad channels
- **Root Cause:** No preloading, large JS bundle, Render cold start likely contributing
- **Fix:** Add `<link rel="preconnect">` headers, enable Vercel Edge Network, code-split routes, add skeleton loading

### P1-02: Global Keyboard Shortcut Fires Inside Modal Inputs
- **Location:** Sprints → "+ New Sprint" → Sprint Name field
- **Problem:** Typing "Sprint" in the sprint name input causes the "n" keypress to trigger the global "New Task" shortcut. Sprint creation is completely broken — the task modal hijacks the flow mid-input.
- **Impact:** Sprint creation is unreliable/broken for names containing "n", "b", "k" or other shortcut keys
- **Root Cause:** Global keyboard shortcut listeners do not check if focus is inside an `<input>` or `<textarea>` before firing
- **Fix:** Wrap all global shortcut handlers with `if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;`

### P1-03: Demo Session Expires with No Warning (5-Minute Limit)
- **Location:** All demo sessions
- **Problem:** Demo session expires at exactly 5 minutes with zero countdown or warning. User is abruptly redirected mid-action (lost work, broken flow).
- **Impact:** First-time evaluators lose work and get a negative impression exactly at the moment of peak engagement
- **Root Cause:** No session timer UI; server invalidates demo JWT at expiry without client notification
- **Fix:** Add a visible countdown badge in the sidebar (e.g., "Demo: 2:30 remaining") and a 60-second warning toast. Offer "Extend" or "Sign up to save your work" CTA.

---

## P2 MEDIUM ISSUES (Fix in next sprint)

### P2-01: Dashboard API Latency — 4 Calls Exceed 1 Second on Load
- **Location:** Dashboard initial load
- **Problem:** 4 API calls >1s: `auth/demo` 1827ms, `sprints` 1619ms, `sidebar-views` 1249ms, `notifications/count` 1113ms
- **Impact:** Dashboard feels sluggish for all users. Total blocking time adds up during concurrent calls.
- **Fix:** Parallelize sidebar API calls, add Redis caching for workspace-level data, move notification count to Socket.io push

### P2-02: Session Expiry Redirects to Landing Page Instead of Login
- **Location:** Any protected route after session expires (tested `/admin`, `/settings`)
- **Problem:** Navigating to a protected URL with expired session silently redirects to `/` (marketing landing page) instead of `/login?redirect=<intended-path>`
- **Impact:** Users lose their intended destination; return flow broken; confusing UX
- **Fix:** AuthGuard component should redirect to `/login?redirect=${encodeURIComponent(location.pathname)}` and login page should restore the redirect after successful auth

### P2-03: Settings Panel Has No Dedicated URL — No Deep-Linking
- **Location:** Settings (gear icon → opens panel inside `/dashboard`)
- **Problem:** Settings lives at `/dashboard` with no route change. Can't bookmark, share, or deep-link to any settings section. Browser back button doesn't navigate settings history.
- **Fix:** Route settings to `/settings/:section` (e.g., `/settings/security`, `/settings/general`)

### P2-04: "Workspace Preferences" Settings Section Shows "General" Content
- **Location:** Settings → Workspace Preferences
- **Problem:** Clicking "Workspace Preferences" in the settings sidebar renders the "General" settings content (Light mode toggle, Compact task cards, Default view). The section label is misleading.
- **Root Cause:** Settings tab state likely hardcoded to a wrong default or missing route mapping
- **Fix:** Either map "Workspace Preferences" to its own distinct content section, or rename the nav item to match "General"

### P2-05: Members View Shows "Available" Badge Alongside "200% Load"
- **Location:** Members → member card
- **Problem:** Demo User card simultaneously shows green "Available" availability badge and "200% load" red chip — directly contradictory
- **Root Cause:** Availability status is calculated from `user_capacity.on_leave` / `travel_mode` fields (not from workload %), so a heavily overloaded user still shows "Available"
- **Fix:** Availability badge logic should factor in workload — if load > 100%, show "Overloaded" not "Available"; add tooltip explaining both metrics

---

## P3 LOW ISSUES (Backlog)

### P3-01: Calendar "Upcoming 14 Days" Panel Excludes Today's Events
- **Location:** Calendar view — right panel "Upcoming (14 Days)"
- **Problem:** Event created for today (June 30) doesn't appear in the "Upcoming" panel
- **Fix:** Change query from `> today` to `>= today`

### P3-02: Approvals Tab Has Notification Dot with No Pending Items
- **Location:** Manager View → Approvals tab
- **Problem:** Orange dot notification badge on "Approvals" tab, but tab shows "No pending approvals"
- **Root Cause:** Badge count likely not refreshing after approvals are cleared
- **Fix:** Ensure notification dot re-queries or subscribes to approval count changes

---

## VERIFIED WORKING ✅

| View / Feature | Status |
|---|---|
| Board (Kanban) — drag/drop columns visible | ✅ |
| Create Task — validation + creation | ✅ |
| Start button (To Do → In Progress) | ✅ |
| TaskDetailModal — tabs, auto-save, Done button | ✅ |
| Subtask creation + count update | ✅ |
| Comments — empty state, submit, badge update | ✅ |
| Summary view — Focus Mode (25min Pomodoro) | ✅ |
| Summary view — Progress, Activity Feed, Active Tasks | ✅ |
| Calendar — navigation, event creation, validation | ✅ |
| Calendar — event appears on correct date | ✅ |
| Sprints — empty state, Create Sprint modal opens | ✅ |
| Gantt Chart — empty state, proper message | ✅ |
| Teams — empty state | ✅ |
| Manager View — Overview stats | ✅ |
| Manager View — Workload & Capacity tab | ✅ |
| Manager View — AI Predictions (14-day heatmap) | ✅ |
| Manager View — Approvals (Task + Leave & Travel tabs) | ✅ |
| Team Workload — capacity breakdown, next slot | ✅ |
| Members — list, search, Add Member button | ✅ |
| Analytics — Overview (charts, stats) | ✅ |
| Analytics — Command Center (daily overview) | ✅ |
| What-If Simulation — loads, form present | ✅ |
| Activity Feed — empty state, tabs | ✅ |
| Dependency Graph — task nodes render | ✅ |
| Integrations — Slack, GitHub, Jira Import visible | ✅ |
| Global Search (Ctrl+K) — command palette + task search | ✅ |
| Notifications bell — dropdown, empty state | ✅ |
| Dark mode toggle — instant switch | ✅ |
| Settings — General, Security, Project Settings | ✅ |
| Active Sessions in Security settings | ✅ |

---

## RELEASE VERDICT

| Category | Status |
|---|---|
| P0 Blockers | ✅ None remaining |
| P1 High | ⚠️ 3 issues (keyboard shortcuts critical for sprint creation) |
| P2 Medium | ⚠️ 5 issues |
| P3 Low | ℹ️ 2 issues |

**Conditional RELEASE APPROVED** — with the following conditions:
1. P1-02 (keyboard shortcut in modals) **must be fixed** — sprint creation is broken
2. P1-03 (demo countdown) **strongly recommended** before any marketing launch
3. P1-01 (FCP performance) should be addressed within 1 sprint of launch
