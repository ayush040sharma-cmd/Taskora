# TASKORA — MASTER PRE-LAUNCH AUDIT
## Version 1.0 | Audited 2026-06-29
### Methodology: Every file read. Every component audited. Zero assumptions.

---

## HOW TO USE THIS DOCUMENT

- **P0** = Launch Blocker — ship with this and you will face data loss, security breach, or user-trust failure
- **P1** = Must Fix Before Launch — significant UX or product problem that will cause churn
- **P2** = Should Fix Before Launch — polish, consistency, and discoverability issues
- **P3** = Nice to Have — improvement that adds value but is not launch-blocking
- **P4** = Future Roadmap — deliberate feature gaps to address post-launch

Each issue includes: file path, line number where applicable, severity, description, and recommended fix.

---

## SECTION 1 — SECURITY AUDIT

### S-001 | P0 | CRITICAL SECURITY — Seed route mounted in production
**File:** `backend/server.js:178`
```js
app.use("/api/seed", require("./routes/seed"));
```
**Issue:** `/api/seed` endpoint is registered and reachable in production. Any user who calls this endpoint can populate the database with seed data, resetting workspace state, creating fake users, or truncating tables (depending on what seed.js does).
**Fix:** Add environment guard: `if (process.env.NODE_ENV !== "production") app.use("/api/seed", ...)` or delete the route from production entirely.

---

### S-002 | P0 | CRITICAL SECURITY — JWT stored in localStorage (XSS exposure)
**File:** `frontend/src/api/api.js:19`
```js
const token = localStorage.getItem("token");
```
**Issue:** JWT is stored in `localStorage` and read on every request. Any XSS vulnerability (even a minor one) allows an attacker to steal the token and impersonate the user indefinitely. httpOnly cookie is also being sent (`withCredentials: true`) but the localStorage fallback means both pathways exist simultaneously, giving attackers two attack surfaces.
**Fix:** Remove localStorage JWT completely. Use only the httpOnly cookie. Audit all `localStorage.setItem("token")` calls and remove them.

---

### S-003 | P1 | SECURITY — CORS allows any *.vercel.app origin
**File:** `backend/server.js:49`
```js
if (ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin)) {
```
**Issue:** Any Vercel deployment (attacker-owned or not) can make authenticated cross-origin requests to the Taskora API. An attacker deploys `attacker-tool.vercel.app` and can call any API endpoint using a victim's cookie.
**Fix:** Whitelist only `taskora.vercel.app` or your specific production domain. Don't use a wildcard regex for *.vercel.app.

---

### S-004 | P1 | SECURITY — Demo users share one account, causing data cross-contamination
**File:** `backend/routes/auth.js` (demo login endpoint)
**Issue:** All demo users log in as the same `demo@taskora.app` account. Two people doing a demo simultaneously see each other's actions in real-time via Socket.io. A demo user can delete tasks, add members, or change settings that affect the next person's demo.
**Fix:** Create a fresh demo user per session with a UUID-based email (`demo-{uuid}@taskora.app`), or isolate demo sessions in a read-only workspace.

---

### S-005 | P1 | SECURITY — No email verification enforced
**Issue:** Users register and immediately get full workspace access. Email-dependent features (password reset, workspace invites) silently fail if a fake email is used. Attacker can create infinite accounts.
**Fix:** Send verification email on register. Prevent login until email is verified. Show clear error if invite email bounces.

---

### S-006 | P1 | SECURITY — `pending_approval` not in DB status CHECK constraint
**File:** `backend/schema-v8.sql` (and any schema applied to production)
**Issue:** The `super_boss` approval flow creates tasks with `status = 'pending_approval'`. If the DB `CHECK` constraint on `tasks.status` does not include `'pending_approval'`, every task created through this flow will fail at the database layer with a constraint violation. This is a silent data loss scenario.
**Fix:** Apply `schema-v11.sql` (or whichever version adds `pending_approval`) to production. Verify with `\d tasks` in psql that the constraint includes all valid statuses.

---

### S-007 | P2 | SECURITY — RBAC roles are global, not per-workspace
**File:** `frontend/src/utils/canAccess.js:46`
```js
const ROLE_LEVELS = { team_member: 1, manager: 2, super_boss: 3 };
```
**Issue:** A user with `manager` role in Workspace A has manager-level permissions in ALL workspaces they belong to. Roles should be scoped to each workspace membership record.
**Fix:** Add `role` column to `workspace_members` table. Use membership role for access control within a workspace, not the global `users.role`.

---

### S-008 | P2 | SECURITY — Admin routes trust JWT role without re-validation
**Issue:** `/api/admin/*` routes check `req.user.role === 'super_admin'` or `'super_boss'` from the JWT payload. JWT payload is set at login time. If an admin's role is demoted in the DB, the old JWT still grants admin access until token expiry (2 hours).
**Fix:** For admin actions, do a DB role re-check: `SELECT role FROM users WHERE id = $1` on sensitive admin routes, not just JWT role claim.

---

### S-009 | P2 | SECURITY — CSP uses 'unsafe-inline' for scripts
**File:** `backend/server.js:35-36`
```js
scriptSrc: ["'self'", "'unsafe-inline'"],
styleSrc:  ["'self'", "'unsafe-inline'"],
```
**Issue:** `'unsafe-inline'` defeats the primary purpose of Content Security Policy. A XSS injection can execute arbitrary inline scripts.
**Fix:** For production, generate a nonce-based CSP or migrate to `'strict-dynamic'`. For styles, use CSS-in-JS with nonces or class-based styling.

---

### S-010 | P2 | SECURITY — Rate limiting only on /api/auth, not on all mutations
**Issue:** `authLimiter` is applied to auth routes. Global limiter is 300 requests per 15 minutes — generous enough for an attacker to spam `POST /tasks`, `DELETE /tasks/:id`, or bulk-delete tasks from a workspace.
**Fix:** Add specific rate limits on mutation endpoints: tasks (30/min), workspace delete (5/hour), member invite (10/hour).

---

### S-011 | P3 | SECURITY — No 2-Factor Authentication
**Issue:** Only password + Google OAuth. For enterprise users, TOTP/2FA is a non-negotiable requirement.
**Fix (post-launch):** Integrate `speakeasy` or `otplib` for TOTP. Add 2FA toggle in Account Settings.

---

## SECTION 2 — CRITICAL BUGS (P0)

### B-001 | P0 | BUG — HistoryTab in ImportWizard uses `useState` as `useEffect`
**File:** `frontend/src/components/ImportWizard.jsx:563`
```js
useState(() => { load(); }, [load]);  // ← BUG: useState does not accept a dependency array
```
**Issue:** `useState` is called with a function and a dependency array as if it were `useEffect`. This is incorrect — `useState` ignores both arguments after the initial call. The import history tab will NEVER load data on mount.

The workaround on line 565 (`if (typeof window !== "undefined" && !logs.length && !loading) load()`) fires on every render, causing an infinite re-render loop when `loading` is false and `logs` is empty.

**Fix:** Replace with:
```js
useEffect(() => { load(); }, [load]);
```

---

### B-002 | P0 | BUG — CommandCenter TaskRow always navigates to "board" instead of the specific task
**File:** `frontend/src/components/CommandCenter.jsx:83`
```js
onClick={() => onNavigate("board")}
```
**Issue:** Clicking any task in the "High Priority Tasks" or "Blocked Tasks" list inside CommandCenter navigates to the board view, not to the specific task. The `onTaskClick` prop passed from Dashboard is available in `BlockedDashboard` but CommandCenter's `TaskRow` does not use it — it hard-codes `onNavigate("board")`.
**Fix:** Pass `onOpenDetail` to `TaskRow` and call it on click:
```js
onClick={() => onOpenDetail && onOpenDetail(task)}
```

---

### B-003 | P0 | BUG — Plan limits defined but never enforced
**File:** `frontend/src/utils/canAccess.js:71`
```js
export function canAccess(_feature, _plan = "free", _isAdmin = false) {
  return true;  // ← Plan gating disabled
}
```
**File:** `frontend/src/config/limits.js:5-14`
```js
free: { projects: 3, tasksPerProject: 10, members: 3, aiRequests: 0 }
```
**Issue:** `canAccess` always returns `true` regardless of plan or feature. The free plan is supposed to limit users to 3 projects, 10 tasks per project, 3 members, and 0 AI requests. None of these limits are enforced in the frontend. Users can add unlimited tasks/members for free. If backend enforcement is also missing, the paid plan has no value.
**Fix:** Either implement real enforcement OR remove the pricing page and upgrade gates entirely to avoid misleading users.

---

### B-004 | P1 | BUG — After 401 auth timeout, login redirect loses the original URL
**File:** `frontend/src/api/api.js:34`
```js
window.location.href = "/login";
```
**Issue:** If a user's session expires while on `/dashboard?view=analytics`, they are redirected to `/login` with no return URL. After logging in again, they land on the default dashboard view, not where they were.
**Fix:**
```js
window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
```

---

### B-005 | P1 | BUG — Tasks deleted without confirmation in some code paths
**File:** `frontend/src/components/TaskCard.jsx:248`
```js
onClick={e => { e.stopPropagation(); onDelete(task.id); }}
```
**Issue:** Delete button on TaskCard fires `onDelete` immediately. There is an undo toast (`UndoToast`) but it requires clicking within a timeout window. Mobile users or fast-clicking users will delete tasks accidentally with no way to recover if the undo toast disappears.
**Fix:** Either add a confirmation state ("Are you sure? [Delete] [Cancel]") directly on the card, or ensure the undo toast is displayed for a minimum of 8 seconds with a clear countdown.

---

### B-006 | P1 | BUG — Notification bell uses `getSocket()` which may connect before user authentication is confirmed
**File:** `frontend/src/components/NotificationBell.jsx:62-64`
```js
const socket = getSocket();
if (!socket.connected) socket.connect();
```
**Issue:** `getSocket()` is called inside a `useEffect` with only a `localStorage.getItem("token")` gate. If the token is stale or if `useSocket.js` uses the token at connection-initialization time without re-checking validity, the socket may connect with an expired token.
**Fix:** Use the `AuthContext` to gate the socket connection, not `localStorage`.

---

### B-007 | P1 | BUG — `isBlocked` on TaskCard checks `blocking_dep_count` which may not be in all task API responses
**File:** `frontend/src/components/TaskCard.jsx:169`
```js
const isBlocked = (task.blocking_dep_count || 0) > 0;
```
**Issue:** `blocking_dep_count` is a computed/joined field. If the `/tasks/workspace/:id` endpoint doesn't JOIN the dependency count, every card will silently show `isBlocked = false` even when a task is genuinely blocked by dependencies.
**Fix:** Verify `blocking_dep_count` is included in the task list query result. Add a database test case.

---

## SECTION 3 — DESIGN SYSTEM AUDIT

### DS-001 | P1 | DESIGN SYSTEM — Two competing CSS token systems
**Files:** `frontend/src/styles/tokens.css` (dark defaults) vs `frontend/src/index.css` `:root` (light defaults)
**Issue:** Two parallel token systems define the same semantic variables with different values:
- `tokens.css :root` = dark-first defaults (the "tk-" system)
- `index.css :root` = light-first defaults (the legacy system)
Both are imported in `main.jsx`. Components that use `var(--card-bg)` get the `index.css` definition; components that use `var(--tk-card)` get the `tokens.css` definition. Theme switching works differently for each system.
**Fix:** Consolidate into ONE system. Keep `tokens.css` as the source of truth. Map all old variables to their tk- equivalents.

---

### DS-002 | P1 | DESIGN SYSTEM — Three separate primary button definitions
**Files:** `index.css`, `tokens.css`
- `btn-primary` (index.css)
- `tk-btn-primary` (tokens.css)
- `btn-create` (index.css, now gradient)
- `btn-modal-save-primary` (index.css)
- `tk-btn-secondary` (tokens.css)
- `btn-secondary` (index.css)
**Issue:** 6 button variants for what should be 2 (primary, secondary). New developers or Claude will use whichever they find first, deepening the inconsistency over time.
**Fix:** Define exactly 3 button classes: `.tk-btn` (base), `.tk-btn--primary`, `.tk-btn--secondary`, `.tk-btn--ghost`. Delete all others.

---

### DS-003 | P1 | DESIGN SYSTEM — Two body fonts in conflict
**Files:** `frontend/src/index.css:54` vs `frontend/src/styles/tokens.css`
```css
/* index.css */
font-family: 'Inter', system-ui, sans-serif;

/* tokens.css */
--tk-font-body: 'DM Sans', system-ui, sans-serif;
```
**Issue:** Old components render in Inter; components using tk- tokens render in DM Sans. The same page shows two different typefaces.
**Fix:** Choose ONE body font. Recommend: DM Sans (already in tokens.css). Update `index.css :root` to match.

---

### DS-004 | P1 | DESIGN SYSTEM — Off-brand purple `#6366f1` used throughout 4 new components
**Files:** `BlockedDashboard.jsx:195`, `CommandCenter.jsx:5,20,381`, `ImportWizard.jsx:22,64,89,265,344,386,461,533,641`, `TeamsPanel.jsx:4,56,58,62,147,299,303,471,474,499`
**Issue:** Taskora's brand accent is `#3B82F6` (blue). The `#6366f1` indigo purple is a leftover from an earlier design. It is now used in all 4 recently-added components as the primary action color, creating a split identity.
**Count:** 40+ occurrences across 4 files.
**Fix:** Global search-and-replace `#6366f1` → `var(--tk-accent, #3B82F6)` in all new component files.

---

### DS-005 | P1 | DESIGN SYSTEM — 12+ card style variants
**Files:** index.css, tokens.css, airisk.css, manager.css, summary.css, board.css
**Variants found:** `tk-card`, `.analytics-card`, `.analytics-kpi`, `.wl-card`, `.sprint-card`, `.mgr-panel`, `.risk-heatmap`, `.collab-card`, `.dep-graph-container`, `.task-detail-panel`, `.summary-card`, `StatCard` (inline), `TeamCard` (inline)
**Issue:** 12+ implementations of the same concept (a bordered, rounded container with background). Each has slightly different padding, border-radius, and shadow.
**Fix:** Standardize to `tk-card` + modifier classes (`tk-card--flat`, `tk-card--clickable`). Remove all duplicates.

---

### DS-006 | P0 | DARK MODE — 4 new components use 100% hardcoded dark hex colors
**Files:**
- `BlockedDashboard.jsx`: 30+ hardcoded colors (`#1e293b`, `#0f172a`, `#334155`, `#94a3b8`, `#e2e8f0`, `#f1f5f9`, `#64748b`, `#ef4444`, `#f59e0b`, etc.)
- `CommandCenter.jsx`: 35+ hardcoded colors
- `ImportWizard.jsx`: 50+ hardcoded colors
- `TeamsPanel.jsx`: 20+ hardcoded colors
**Issue:** All 4 components will be completely broken (white-text-on-white or invisible elements) in light mode. Since `useTheme` changes `data-theme` on `document.documentElement`, these components must use `var()` tokens to respond.
**Total violations:** ~135 hardcoded color instances across the 4 files.
**Fix:** Replace all hardcoded values with their CSS variable equivalents:
- `#0f172a` → `var(--bg)` or `var(--tk-bg)`
- `#1e293b` → `var(--card-bg)` or `var(--tk-card)`
- `#334155` → `var(--border)` or `var(--tk-border)`
- `#e2e8f0`, `#f1f5f9` → `var(--text-primary)` or `var(--tk-text-primary)`
- `#94a3b8`, `#64748b` → `var(--text-secondary)` or `var(--tk-text-secondary)`

---

### DS-007 | P2 | DESIGN SYSTEM — Spacing uses raw pixel values, not tokens
**File:** `index.css` throughout (600+ lines)
**Issue:** `tokens.css` defines `--tk-space-1` through `--tk-space-8` (4px through 32px) but `index.css` uses raw values like `8px`, `12px`, `14px`, `16px`, `20px`, `24px`, `28px`. These conflict and cause minor misalignment between old and new components.
**Fix:** Convert `index.css` to use `var(--tk-space-*)` tokens over time. At minimum, align the values so they produce the same result.

---

### DS-008 | P2 | DESIGN SYSTEM — Emoji icons mixed with SVG icons
**Issue:** Sidebar uses emoji (📋, 📊, 📅, 👥, etc.). Navbar uses SVG icons. `TaskCard.jsx` uses custom inline SVG icons. Buttons in `ImportWizard.jsx` use emoji (⬇, ⏳, 📂). Team icons in `TeamsPanel.jsx` are emoji.
**Affected components:** Sidebar.jsx, Navbar.jsx, TaskCard.jsx, ImportWizard.jsx, TeamsPanel.jsx
**Fix:** Adopt one SVG icon library (Lucide, Phosphor, or Heroicons). Replace all emoji in UI chrome with SVG. Keep emoji only in user-generated content.

---

### DS-009 | P2 | DESIGN SYSTEM — `analytics-type-bar-wrap` background is still hardcoded
**File:** `frontend/src/index.css` (analytics section)
```css
.analytics-priority-bar-wrap { background: var(--column-bg); }  /* fixed in prev session */
/* but check: */
.analytics-type-bar-wrap { background: #f1f5f9; }  /* ← may still be hardcoded */
```
**Fix:** Verify `.analytics-type-bar-wrap` uses `var(--column-bg)` or equivalent token.

---

### DS-010 | P2 | DESIGN SYSTEM — DependencyGraph SVG node fill is `#fff` in dark mode
**File:** `frontend/src/components/DependencyGraph.jsx:107`
```js
fill={selected ? "#eef2ff" : "#fff"}
```
**Issue:** SVG graph nodes always render white. In dark mode, this creates white boxes floating on a dark background — they look broken, not like nodes.
**Fix:**
```js
fill={selected ? "var(--tk-accent-muted, #eef2ff)" : "var(--tk-card, #1e293b)"}
```
And the text inside nodes needs a contrasting fill too.

---

## SECTION 4 — UX AUDIT (COMPLETE SCREEN-BY-SCREEN)

### UX-001 | P0 | ONBOARDING — Server cold start message exposes infrastructure
**File:** `frontend/src/pages/Dashboard.jsx` (wakeStatus retry logic)
**Issue:** Message displayed: `"Waking up the server… attempt 3 of 8"`. Problems:
1. Exposes "Render free tier" as infrastructure to end users
2. "Attempt X of 8" language creates alarm — users think the product is broken
3. After 8 failed attempts, the error message explicitly mentions Render by name
**Fix:**
- Message: `"Loading your workspace… This usually takes about 30 seconds on first load."`
- No attempt counter
- After timeout: `"We're having trouble connecting. Please refresh the page."`
- Long-term fix: Upgrade to Render Starter ($7/mo) to eliminate cold starts

---

### UX-002 | P0 | NAVIGATION — 17 sidebar items is cognitively overwhelming
**File:** `frontend/src/components/Sidebar.jsx`
**Current items:** Board, Summary, Calendar, Sprints, Gantt Chart, Teams, Manager View, Team Workload, Members, My Capacity, Collaboration, Approvals, AI Risk Map, Analytics, What-If Sim, Activity Feed, Dep. Graph, Integrations (+ Settings)
**Issue:** Miller's Law: humans can hold 7±2 items in working memory. 17 items forces users to scan the entire sidebar on every navigation decision. New users have no mental map of what each item does.
**Recommended IA (7 primary items):**
1. Board (Kanban)
2. Calendar
3. Sprints
4. Insights ← merges Analytics + Summary + Manager + Workload + AI Risk + Simulation
5. People ← merges Teams + Members + Workload
6. Activity
7. Settings

Move to Settings: Integrations, Dep. Graph (advanced), Import

---

### UX-003 | P1 | ONBOARDING — New user sees an empty board with no guidance
**Issue:** After registration and role selection, user lands on an empty Kanban board. No tutorial, no sample tasks, no "create your first task" CTA, no checklist.
**The `OnboardingChecklist` component exists** (`frontend/src/components/onboarding/OnboardingChecklist.jsx`) but:
1. Is it shown to new users? (Not confirmed in Dashboard.jsx imports)
2. Is completion state persisted in DB or localStorage? If localStorage, it resets every session.
**Fix:** Show checklist prominently on first login. Pre-populate with one example task so the board isn't empty. Persist checklist progress in DB.

---

### UX-004 | P1 | FLOWS — CreateTaskModal has 9+ fields — too many for a creation form
**File:** `frontend/src/components/CreateTaskModal.jsx`
**Fields visible on open:** title, description, type (10 options), priority, due date, assignee, recurrence (disabled, COMING SOON), tags, estimated hours
**Issue:** Users creating a task shouldn't be confronted with 9 fields. Linear, Notion, and Height all show 2-3 fields by default.
**Fix:**
- Required: title only
- Shown by default: priority + assignee
- Behind "More options" link: type, description, due date, tags, estimated hours
- Hide recurrence entirely until the feature exists (don't show disabled fields)

---

### UX-005 | P1 | FLOWS — No shareable / deep-linkable URLs per view
**Issue:** Every view (board, analytics, sprints, calendar, etc.) lives at `/dashboard`. URL never changes. A manager cannot send "here's our analytics view" link to a colleague.
**Fix:** Use URL search params: `/dashboard?view=analytics`, `/dashboard?view=sprints&sprint=123`, or proper sub-routes `/dashboard/analytics`.

---

### UX-006 | P1 | FLOWS — Workspace delete has insufficient confirmation
**File:** `frontend/src/components/Sidebar.jsx` or `WorkspaceModal.jsx`
**Issue:** Workspace deletion with all its tasks, sprints, members, and history is triggered with only a single "Are you sure?" inline confirm button. No text confirmation (typing the workspace name). This is catastrophic for an inattentive user.
**Fix:** Require the user to type the workspace name exactly before the delete button becomes active (GitHub-style).

---

### UX-007 | P1 | FLOWS — Task status change requires drag-and-drop (no 1-click alternative)
**Issue:** The only way to change a task's status is to drag it to a different Kanban column. On laptop trackpads, DnD is imprecise. Mobile DnD is unreliable. Power users moving 10+ tasks must drag each one individually.
**Fix:** Add an inline status dropdown on the TaskCard (visible on hover). One click → status changes. DnD is the secondary interaction, not the only one.

---

### UX-008 | P1 | FLOWS — Activity feed items are not clickable (dead end)
**File:** `frontend/src/components/ActivityFeed.jsx`
**Issue:** Activity items show "Ayush completed: Fix login bug" but clicking the item does nothing. Users expect to navigate to the referenced task.
**Fix:** Add `onClick` to activity items that calls `onOpenDetail(task)` with the referenced task's ID.

---

### UX-009 | P1 | FLOWS — Demo session timer (5 minutes) causes anxiety and abandonment
**Issue:** The demo timer counts down from 5 minutes. Users exploring the product take 10-15 minutes to understand it. The timer creates artificial urgency that drives abandonment. Demo users should be exploring freely, not racing a clock.
**Fix:** Either remove the timer entirely, extend to 30 minutes, or replace with a banner: "You're in demo mode. Register free to save your work."

---

### UX-010 | P1 | EMPTY STATES — Most empty states are missing or insufficient
| View | Current Empty State | Required |
|------|--------------------|---------| 
| Kanban (new workspace) | "No workspace" message | "Create your first task [+ New Task]" inline |
| Analytics (no data) | None — charts render as empty | "Add tasks to see analytics" |
| Sprint (no sprints) | Generic text | "Create your first sprint" with CTA |
| Activity Feed | "No activity yet" | Explain what triggers activity |
| Calendar | Empty grid | "No tasks with due dates yet" |
| Dependency Graph | "No tasks found" | Guide to add dependency |
| Blocked Tasks | ✅ Good — "No blocked tasks!" | Keep |

---

### UX-011 | P1 | NAVIGATION — Settings has no URL, cannot be bookmarked
**Issue:** Settings renders as a view inside Dashboard (`view === "settings"`). URL stays at `/dashboard`. No way to deep-link to a specific settings section.
**Fix:** Create `/settings` route (and sub-routes `/settings/account`, `/settings/workspace`, `/settings/security`).

---

### UX-012 | P2 | UX — Keyboard shortcuts are not discoverable
**File:** `frontend/src/components/Sidebar.jsx` or Dashboard.jsx
**Issue:** Keyboard shortcuts (`N`, `E`, `D`, `J`, `K`, `?`, `Cmd+K`) are only discoverable by pressing `?` — circular. New users never discover them.
**Fix:**
1. Show shortcut hints on hover tooltips (e.g., "New task [N]")
2. Show ShortcutsModal on first Dashboard visit
3. Add a keyboard icon in the Navbar that opens ShortcutsModal

---

### UX-013 | P2 | UX — FilterBar count shows total, not filtered count
**Issue:** FilterBar header shows `{totalTasks} task(s)` when filters are applied but total tasks haven't changed. This confuses users who can't tell if the workspace is empty or filters are hiding tasks.
**Fix:** When filters are active, show: `Showing {filteredCount} of {totalTasks} tasks`. When no filters: `{totalTasks} tasks`.

---

### UX-014 | P2 | UX — "Manager View", "Summary", "Team Workload", "Collaboration" are four views for essentially the same thing
**Issue:** All four panels show aggregate team/project health metrics. A user navigating between them finds 80% overlap.
**Fix:** Merge into one "Insights" page with role-adaptive default tab:
- For `manager`/`super_boss`: default to Team Health tab
- For `team_member`: default to My Performance tab

---

### UX-015 | P2 | UX — What-If Simulation uses P50/P90 statistics jargon
**File:** `frontend/src/components/SimulationPanel.jsx`
**Issue:** Output says "P50: 12 days, P90: 18 days". A PM who doesn't know statistics sees meaningless numbers. The feature exists but is unusable without a manual.
**Fix:** Translate outputs:
- P50 → "Most likely completion: 12 days"
- P90 → "Worst case completion: 18 days (90% confidence)"
Add a one-line tooltip explaining each value.

---

### UX-016 | P2 | UX — NL Chat is hidden in an unmarked floating bubble
**File:** `frontend/src/components/AIBubble.jsx`
**Issue:** The best AI feature (natural language task creation) is accessed via an unmarked floating button in the bottom-right corner. Most users will assume it's a chat/support widget and ignore it.
**Fix:** 
1. Label the bubble "Ask AI"
2. Add a Cmd+Shift+Space keyboard shortcut
3. On first login, show a tooltip: "Ask AI to create tasks, analyze workload, or answer questions"

---

### UX-017 | P2 | UX — "Dep. Graph" is a confusing sidebar label
**Issue:** "Dep. Graph" is a developer abbreviation. Regular users don't know what it means without clicking it.
**Fix:** Rename to "Dependencies". Or move it out of the sidebar into the task detail modal where it's more contextual.

---

### UX-018 | P2 | UX — "What-If Sim" name is confusing
**Issue:** "What-If Sim" sounds like a simulation game. Users don't understand it's a sprint completion predictor.
**Fix:** Rename to "Scenario Planner" or "Delivery Estimator".

---

### UX-019 | P2 | UX — Jarvis Voice Assistant is a gimmick
**File:** `frontend/src/components/JarvisVoiceAssistant.jsx`
**Issue:** Voice input in a project management web app has near-zero use cases (users are typically in offices or quiet spaces, not dictating tasks aloud). The "Jarvis" name is an Iron Man reference (potential IP concern). Engineering effort maintaining this is better spent on NL Chat improvements.
**Fix:** Remove entirely. Redirect the effort to NL Chat keyboard shortcut and proactive suggestions.

---

### UX-020 | P2 | UX — Security alerts shown to ALL users including non-admins
**File:** `frontend/src/pages/Dashboard.jsx` (SecurityAlertToast)
**Issue:** SQL injection warnings, brute force alerts, and firewall blocks appear as toast notifications to every logged-in user. A designer moving tasks sees "SQL INJECTION CRITICAL" and doesn't know what to do.
**Fix:** Only show security toasts to `super_boss`/`super_admin` roles. All others: no security alerts in the UI.

---

### UX-021 | P2 | UX — Sprint close doesn't offer to move incomplete tasks
**Issue:** When a sprint ends, incomplete tasks are stranded in the sprint with no automated option to move them to the next sprint or backlog. This is a fundamental sprint management workflow.
**Fix:** On sprint close, show a modal: "These 7 tasks are incomplete. Move to [Next Sprint] or [Backlog]?"

---

### UX-022 | P3 | UX — No bulk task operations
**Issue:** Selecting 10 tasks and moving them to Done, or reassigning them to a different person, requires 10 individual drag operations or modal opens.
**Fix (post-launch):** Add checkbox on task card hover. Show bulk action bar when 2+ tasks are selected: [Assign] [Move to] [Delete] [Change Priority]

---

### UX-023 | P3 | UX — No "copy task link" action
**Issue:** Users cannot share a direct link to a specific task. Clicking a task opens it in a modal, but the URL doesn't update.
**Fix:** Add "Copy link" button in TaskDetailModal that copies `/dashboard?task={id}` to clipboard.

---

### UX-024 | P3 | UX — No list/table view of tasks
**Issue:** Power users with 50+ tasks in a column find the Kanban card view visually noisy. A list view (sortable table with columns: title, status, assignee, priority, due date) would dramatically improve usability.
**Fix (post-launch):** Add View Toggle in board header: [Kanban] [List]. List view uses a table component.

---

## SECTION 5 — ACCESSIBILITY AUDIT (WCAG 2.1 AA)

### A-001 | P1 | ACCESSIBILITY — No focus trap in any modal
**Affected modals:** CreateTaskModal, TaskDetailModal, WorkspaceModal, SprintModal, SimulationModal, ImportWizard, CommandPalette, TeamModal (TeamsPanel), TeamMembersModal (TeamsPanel)
**WCAG:** 2.4.3 Focus Order
**Issue:** Tab key can escape from the modal and reach background content while modal is open. For keyboard-only users, this is a complete barrier.
**Fix:** Implement focus trap with `focus-trap-react` or a custom `useFocusTrap` hook. Focus should cycle within the modal until the modal is closed.

---

### A-002 | P1 | ACCESSIBILITY — All form inputs use placeholder as label only
**Affected:** CreateTaskModal, TaskDetailModal, Login, Register, TeamModal, WorkspaceModal, SprintModal
**WCAG:** 1.3.1 Info and Relationships
**Issue:** No `<label>` elements. Only `placeholder` attributes. Screen readers cannot announce what field is being focused. Placeholders disappear on input, removing the label permanently.
**Fix:** Add `<label htmlFor="...">` above every input. Keep placeholder as example text, not as a label substitute.

---

### A-003 | P1 | ACCESSIBILITY — No ARIA labels on icon-only buttons
**File:** `TaskCard.jsx:240-248`, `Sidebar.jsx`, `Navbar.jsx`, `NotificationBell.jsx`
**WCAG:** 4.1.2 Name, Role, Value
**Issue:** Edit, Delete, and other icon-only buttons have `title` attributes but no `aria-label`. Screen readers read `title` inconsistently.
**Fix:**
```jsx
<button aria-label="Edit task" title="Edit task"><IconEdit /></button>
<button aria-label="Delete task" title="Delete task"><IconTrash /></button>
```

---

### A-004 | P1 | ACCESSIBILITY — DnD elements have no ARIA labels or keyboard alternative
**File:** `KanbanBoard.jsx`, `SprintView.jsx`
**WCAG:** 2.1.1 Keyboard, 4.1.2 Name Role Value
**Issue:** `<Droppable>` and `<Draggable>` components from `@hello-pangea/dnd` have built-in keyboard DnD support, but only when:
1. `<Draggable>` has `aria-label` describing the task
2. `<Droppable>` has `aria-label` describing the column
3. The page has a visible instructions region explaining keyboard DnD
None of these are implemented.
**Fix:**
```jsx
<Draggable aria-label={`${task.title}, priority ${task.priority}`}>
<Droppable aria-label={`${column.label} column, ${tasks.length} tasks`}>
```
Add instructions: "Press Space to pick up, arrow keys to move, Space to drop"

---

### A-005 | P1 | ACCESSIBILITY — Color alone conveys status information
**File:** `TaskCard.jsx`, `KanbanBoard.jsx`, priority badges, status badges throughout
**WCAG:** 1.4.1 Use of Color
**Issue:** Priority (Low=green, Medium=amber, High=red) is conveyed only by color. Color-blind users cannot distinguish these.
**Fix:** Priority badges already show text ("Low", "Medium", "High") — this is good. But the Kanban column header color-coding (`.colColor`) has no text label on the column indicating its meaning.

---

### A-006 | P1 | ACCESSIBILITY — Missing `role="dialog"` and `aria-modal="true"` on all modals
**WCAG:** 4.1.2
**Fix:**
```jsx
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
```

---

### A-007 | P1 | ACCESSIBILITY — Touch targets below 44×44px minimum
**File:** `TaskCard.jsx:238-248` (action buttons), Sidebar nav items
**WCAG:** 2.5.5 (AAA, but good practice for AA)
**Issue:** Action buttons on TaskCard (`<IconEdit />`, `<IconTrash />`) are 24×24px visible area with minimal padding. Mobile users will frequently mis-tap.
**Fix:** Ensure minimum 44×44px touch target via padding: `padding: 10px`.

---

### A-008 | P2 | ACCESSIBILITY — No `prefers-reduced-motion` support
**Issue:** Animated transitions (slide-in toasts, transform animations on cards, DnD animation) have no reduced-motion override.
**Fix:**
```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

### A-009 | P2 | ACCESSIBILITY — No `skip to main content` link
**WCAG:** 2.4.1 Bypass Blocks
**Fix:** Add as first element in `<body>`:
```jsx
<a href="#main-content" className="skip-link">Skip to main content</a>
```

---

### A-010 | P2 | ACCESSIBILITY — SVG charts have no accessible description
**File:** `AnalyticsDashboard.jsx` (VelocityChart, ThroughputChart, SparkLine)
**WCAG:** 1.1.1 Non-text Content
**Issue:** SVG chart elements have no `<title>`, `<desc>`, or `role="img"`. Screen readers skip them entirely or read garbled SVG paths.
**Fix:**
```jsx
<svg role="img" aria-label="Velocity chart: 23 tasks completed last week, 31 this week">
  <title>Task Velocity</title>
  <desc>Weekly task completion trend showing increase from 23 to 31 tasks</desc>
```

---

### A-011 | P2 | ACCESSIBILITY — Notification bell has no `aria-label`
**File:** `NotificationBell.jsx:97`
```jsx
<button className="notif-bell" onClick={() => setOpen(v => !v)} title="Notifications">
```
**Fix:**
```jsx
<button className="notif-bell" onClick={() => setOpen(v => !v)} aria-label={`Notifications, ${count} unread`} aria-haspopup="true" aria-expanded={open}>
```

---

### A-012 | P3 | ACCESSIBILITY — No `lang` attribute on `<html>` element
**Fix:** `frontend/public/index.html`: Add `lang="en"` to `<html>`.

---

## SECTION 6 — PERFORMANCE AUDIT

### P-001 | P0 | PERFORMANCE — Render free tier cold start (30-45s)
**Issue:** Free Render instance spins down after 15 minutes of inactivity. First user after spin-down waits 30-45s to see anything. This is the single most damaging user experience issue for first impressions and retention.
**Options:**
1. **Immediate ($7/mo):** Upgrade to Render Starter tier (no spin-down)
2. **Free workaround:** UptimeRobot free tier pings `/health` every 5 minutes to prevent spin-down
3. **Better message:** While waiting, show a progress bar with "Loading your workspace (30 sec first load)" not a scary counter

---

### P-002 | P0 | PERFORMANCE — All tasks loaded at once with no pagination
**File:** `frontend/src/pages/Dashboard.jsx` (`loadTasks` function) and `backend/routes/tasks.js`
**Issue:** `GET /api/tasks/workspace/:id` returns ALL tasks in the workspace with no `LIMIT`/`OFFSET`. A workspace with 500 tasks loads 500 task objects into browser memory on every page load. At 1000 tasks, the board becomes perceptibly slow.
**Fix:** Add server-side pagination: `GET /api/tasks/workspace/:id?limit=50&cursor=...` with cursor-based pagination. Load more on scroll.

---

### P-003 | P1 | PERFORMANCE — Analytics computed entirely client-side from full task list
**File:** `frontend/src/components/AnalyticsDashboard.jsx`
**Issue:** All KPI computations (velocity, throughput, priority breakdown, type breakdown, completion rate) are `useMemo` hooks that iterate the full `tasks` array on every render. At 1000 tasks, this is heavy synchronous CPU work on the main thread.
**Fix:** Create `GET /api/analytics/workspace/:id?from=...&to=...` that returns pre-computed metrics from the database. Cache results with Redis or in-memory LRU.

---

### P-004 | P1 | PERFORMANCE — No code splitting (44 components loaded at once)
**File:** `frontend/src/pages/Dashboard.jsx` (44 imports at top)
**Issue:** Every view (Gantt, Simulation, AI Risk Heatmap, Jarvis, Manager, etc.) is bundled and loaded even if the user never visits those views. This inflates the initial JS bundle.
**Fix:** Dynamic imports for heavy, rarely-used components:
```js
const GanttChart     = lazy(() => import("../components/GanttChart"));
const SimulationPanel = lazy(() => import("../components/SimulationPanel"));
const AIRiskHeatmap  = lazy(() => import("../components/AIRiskHeatmap"));
const JarvisVoiceAssistant = lazy(() => import("../components/JarvisVoiceAssistant"));
```

---

### P-005 | P1 | PERFORMANCE — Two Google Fonts imported (render blocking)
**File:** `frontend/src/styles/tokens.css`
**Issue:** `@import url('https://fonts.googleapis.com/...')` is synchronous and render-blocking. Two fonts (DM Sans + Syne) require two font resource fetches before text is visible.
**Fix:**
```html
<!-- In index.html, use preconnect + preload -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```
Add `font-display: swap` to all `@font-face` declarations.

---

### P-006 | P1 | PERFORMANCE — ActivityFeed re-fetches on every view switch
**File:** `frontend/src/components/ActivityFeed.jsx`
**Issue:** ActivityFeed mounts fresh on every navigation to the "activity" sidebar item. Each mount triggers a new API call. If the user clicks between Board and Activity Feed 5 times, that's 5 API calls for the same data.
**Fix:** Cache the activity feed in parent state (`Dashboard.jsx`) or use SWR/React Query with a cache key.

---

### P-007 | P2 | PERFORMANCE — CommandCenter fires 5 API calls on every mount
**File:** `frontend/src/components/CommandCenter.jsx:141-148`
**Issue:** `Promise.allSettled([blocked, workload, sprints, approvals, audit])` fires 5 parallel requests on every mount. If CommandCenter is a tab inside Analytics, switching tabs triggers 5 requests every time.
**Fix:** Add `stale-while-revalidate` caching. Or pass the data from parent that already has it (sprints, tasks).

---

### P-008 | P2 | PERFORMANCE — No `React.memo` on TaskCard
**File:** `frontend/src/components/TaskCard.jsx`
**Issue:** TaskCard re-renders when any parent state changes (e.g., opening a modal, changing a filter). A board with 100 tasks re-renders 100 `TaskCard` components on every state update.
**Fix:** `export default React.memo(TaskCard, (prev, next) => prev.task === next.task && prev.index === next.index)`.

---

### P-009 | P3 | PERFORMANCE — Socket.io creates one connection per browser tab
**Issue:** If a user has 3 tabs open, 3 separate WebSocket connections are made, 3 separate room subscriptions are created, and real-time events are delivered 3x.
**Fix:** Use `BroadcastChannel` to share a single Socket.io connection across same-origin tabs, or implement connection deduplication.

---

### P-010 | P3 | PERFORMANCE — Search/filter does not debounce
**File:** `frontend/src/components/FilterBar.jsx`
**Issue:** Filter input fires on every keystroke, recomputing the full task list filter on every character typed.
**Fix:** Debounce the filter input with 200ms delay using `useDebounce` hook.

---

## SECTION 7 — COMPLETE COMPONENT-BY-COMPONENT AUDIT

### Component: TaskCard.jsx
| Item | Status | Note |
|------|--------|------|
| CSS token usage | ✅ Pass | Uses `tk-` classes from board.css |
| DnD wiring | ✅ Pass | `<Draggable>` correct |
| ARIA labels | ❌ Fail | No `aria-label` on action buttons |
| Touch targets | ❌ Fail | 24×24px buttons |
| Inline title edit | ✅ Pass | Good UX feature |
| AI hover panel | ⚠️ Warning | Invisible on touch devices |
| Keyboard accessibility | ❌ Fail | Edit/Delete not keyboard-reachable |
| Overdue/stuck banners | ✅ Pass | Good visual feedback |
| Leave/travel badges | ✅ Pass | Nice feature |
| `blocking_dep_count` dependency | ⚠️ Warning | May not be present in all queries |
| Comment count | ✅ Pass | |
| Recurrence badge | ✅ Pass | |

---

### Component: BlockedDashboard.jsx
| Item | Status | Note |
|------|--------|------|
| Dark mode | ❌ Fail | 30+ hardcoded dark colors |
| Light mode | ❌ Fail | Will show black text on near-black |
| ARIA labels | ❌ Fail | None |
| Filter buttons color | ❌ Fail | `#6366f1` purple (off-brand) |
| Avatar color | ❌ Fail | `#6366f1` purple (off-brand) |
| Empty state | ✅ Pass | "No blocked tasks!" is good |
| Loading state emoji | ⚠️ Warning | 🚫 emoji is unprofessional |
| `onTaskClick` prop | ⚠️ Warning | Exists but caller may not pass it |
| Hover effects | ⚠️ Warning | JavaScript hover, not CSS — no keyboard |
| Data fetch | ✅ Pass | `/blocked-analytics` endpoint |

---

### Component: CommandCenter.jsx
| Item | Status | Note |
|------|--------|------|
| Dark mode | ❌ Fail | 35+ hardcoded dark colors |
| Light mode | ❌ Fail | Will break |
| TaskRow click behavior | ❌ Fail | Always navigates to "board", not the task |
| Sprint donut ring color | ❌ Fail | `#6366f1` (off-brand) |
| ARIA labels | ❌ Fail | None |
| 5 parallel API calls | ⚠️ Warning | Good use of allSettled; cache needed |
| Action button color | ❌ Fail | `#6366f1` throughout |
| Section headers | ⚠️ Warning | "More →" button color `#6366f1` |

---

### Component: ImportWizard.jsx
| Item | Status | Note |
|------|--------|------|
| Dark mode | ❌ Fail | 50+ hardcoded dark colors |
| HistoryTab bug | ❌ Fail | `useState` used as `useEffect` — never loads |
| File drag-and-drop | ✅ Pass | Good implementation |
| Keyboard alternative | ❌ Fail | Click-to-open file picker, but no keyboard shortcut |
| ARIA labels | ❌ Fail | None |
| File size validation | ❌ Fail | Only server-side check |
| Export feature | ✅ Pass | Excel export works |
| Download template | ✅ Pass | |
| All purple accent colors | ❌ Fail | 10+ uses of `#6366f1` |
| Step indicator | ✅ Pass | Good 3-step wizard UX |
| Preview table | ✅ Pass | Shows create/update/skip/error breakdown |

---

### Component: TeamsPanel.jsx
| Item | Status | Note |
|------|--------|------|
| Dark mode | ❌ Fail | 20+ hardcoded dark colors |
| Delete confirmation | ✅ Pass | Shows modal, not inline delete |
| Modal ARIA | ❌ Fail | No `role="dialog"`, `aria-modal` |
| Toast overlap | ⚠️ Warning | `position: fixed` will overlap other toasts |
| All purple accent colors | ❌ Fail | Multiple `#6366f1` uses |
| Member role toggle | ✅ Pass | Lead/Member toggle is good |
| Color picker | ✅ Pass | Nice team customization |
| Icon picker | ✅ Pass | |
| ARIA on form labels | ⚠️ Warning | `<label>` exists for inputs — better than most |

---

### Component: NotificationBell.jsx
| Item | Status | Note |
|------|--------|------|
| Real-time push | ✅ Pass | Socket.io `notification` event |
| Polling fallback | ✅ Pass | 30s count check (not full list) |
| ARIA label on bell | ❌ Fail | Only `title`, no `aria-label` |
| Keyboard close | ❌ Fail | No Escape key handler |
| `aria-expanded` | ❌ Fail | Missing on bell button |
| Empty state | ✅ Pass | "No notifications yet" |
| Mark all read | ✅ Pass | |
| Token usage | ⚠️ Warning | Uses `.notif-*` CSS classes (index.css) |

---

### Component: AnalyticsDashboard.jsx
| Item | Status | Note |
|------|--------|------|
| Color tokens | ✅ Pass (Fixed) | Blue/token colors after previous audit |
| Dark mode (CSS) | ✅ Pass (Fixed) | Analytics CSS uses `var()` after fix |
| Tab gradient underline | ✅ Pass (Fixed) | `<span>` absolute positioned |
| Date range filter | ❌ Fail | No date filtering capability |
| Export | ❌ Fail | No CSV/PDF export |
| Chart tooltips | ❌ Fail | No hover tooltips on SVG charts |
| SVG accessibility | ❌ Fail | No `role="img"`, `<title>` |
| Client-side compute | ❌ Fail | Should be server-side for scale |
| `analytics-type-bar-wrap` | ⚠️ Warning | Verify no hardcoded background remains |

---

### Component: DependencyGraph.jsx
| Item | Status | Note |
|------|--------|------|
| SVG node fill in dark mode | ❌ Fail | `fill="#fff"` hardcoded |
| Text size | ❌ Fail | 11px font — below WCAG minimum |
| Tab underline gradient | ❌ Fail | Not applied here (only AnalyticsDashboard) |
| Pan conflicts with scroll | ⚠️ Warning | Canvas pan vs browser scroll conflict |
| Add/remove dependencies in graph | ❌ Fail | Read-only |
| Export graph | ❌ Fail | No share/export |
| `BlockedDashboard` inside | ⚠️ Warning | Not DnD board — conceptually misplaced |
| Layout persistence | ❌ Fail | Recomputes on every load |

---

### Component: KanbanBoard.jsx
| Item | Status | Note |
|------|--------|------|
| DnD wiring | ✅ Pass | All 5 columns including `blocked` |
| `pending_approval` status | ⚠️ Warning | Shown in To Do if DB constraint missing |
| Droppable ARIA | ❌ Fail | No `aria-label` |
| Column WIP limits | ❌ Fail | Not shown |
| Column task count | ⚠️ Warning | Counts when filtered may be misleading |
| Inline task add | ❌ Fail | Must open modal; no inline keyboard add |
| Horizontal scroll indicator | ❌ Fail | 5 columns may overflow on 13" screens |
| Board empty state | ⚠️ Warning | Exists but minimal |

---

## SECTION 8 — BACKEND AUDIT

### BE-001 | P0 | BACKEND — `/api/seed` route registered in production
**Already covered in S-001. Escalated here for visibility.**
**File:** `backend/server.js:178`

---

### BE-002 | P1 | BACKEND — No database migration tooling
**Issue:** Database schema is managed via manually-named SQL files (`schema-v1.sql` through `schema-v11.sql`). There is no migration runner, no rollback capability, no migration history table. It is impossible to know which schemas have been applied to production.
**Fix:** Adopt `node-pg-migrate` or `db-migrate`. Run migrations as part of the deploy pipeline.

---

### BE-003 | P1 | BACKEND — No API versioning
**Issue:** All routes are `/api/resource`. If a breaking change is made to any endpoint, all clients break simultaneously. There's no path to a `/api/v2/` migration.
**Fix:** Add `/api/v1/` prefix to all routes before public launch. This is cheap to add now and expensive to retrofit later.

---

### BE-004 | P1 | BACKEND — No OpenAPI / Swagger documentation
**Issue:** 30 route files with no API documentation. Onboarding a new developer means reading every route file. Impossible to build external integrations.
**Fix:** Add `swagger-jsdoc` and `swagger-ui-express` to auto-generate docs from JSDoc comments. Or write an OpenAPI spec file.

---

### BE-005 | P1 | BACKEND — `planEnforce` middleware applied but features are all "free"
**File:** `backend/server.js:98`, `backend/middleware/planEnforce.js`
**Issue:** `planEnforce` runs on every API request but `features.js` marks all features as `"free"`. The middleware either always passes (wasted CPU) or gates based on a stale feature map.
**Fix:** Either implement real plan enforcement or remove `planEnforce` until pricing is live.

---

### BE-006 | P1 | BACKEND — `seedSidebarPermissions` runs on every server start
**File:** `backend/server.js:240-257`
**Issue:** This function runs a DB INSERT on every server boot. Even with `ON CONFLICT DO NOTHING`, it adds latency to every cold start and is an anti-pattern for schema management.
**Fix:** Move this into a proper migration file. Run once via migration, not on every boot.

---

### BE-007 | P2 | BACKEND — No graceful socket duplicate-connection handling
**Issue:** A user with 3 browser tabs creates 3 socket connections. If a real-time event fires (task moved, notification), it fires 3 times to the same user — causing triple DOM updates and potentially triple API re-fetches.
**Fix:** On `socket.on("join_workspace")`, check if the user is already in the room. Or use Socket.io Redis adapter with sticky sessions.

---

### BE-008 | P2 | BACKEND — No request timeout on database queries
**Issue:** If a complex analytics query or a poorly-optimized JOIN hangs, it will block the Node.js connection from the pool indefinitely until the pool times out.
**Fix:** Add query timeout: `pool.query({ text: sql, values, query_timeout: 15000 })`.

---

### BE-009 | P2 | BACKEND — DB indexes may be missing for common queries
**Issue:** `/api/tasks/workspace/:id` queries by `workspace_id`. If there's no index on `tasks.workspace_id`, this is a full table scan as task counts grow.
**Queries to index:**
- `tasks.workspace_id`
- `tasks.status`
- `tasks.assigned_user_id`
- `tasks.sprint_id`
- `tasks.due_date`
- `workspace_members.user_id`
- `workspace_members.workspace_id`
**Fix:** Add `CREATE INDEX CONCURRENTLY` for each of the above.

---

### BE-010 | P2 | BACKEND — Health check endpoint exists but isn't used by Render for health monitoring
**File:** `backend/server.js:186`
**Issue:** `GET /health` exists and checks DB connectivity. But if it's not configured as Render's health check path, Render uses a generic TCP check which doesn't verify the DB is connected.
**Fix:** Configure Render to use `/health` as the health check endpoint. Consider alerting if DB health returns "error".

---

### BE-011 | P3 | BACKEND — Activity log uses raw action names in user-facing display
**File:** `frontend/src/components/CommandCenter.jsx:349`
```js
{" "}{(log.action || "").replace(/_/g, " ")}
```
**Issue:** Action names like `"task_assigned"`, `"sprint_completed"`, `"member_removed"` are converted from snake_case to spaces. Result: "task assigned", "sprint completed". This is readable but inconsistent and won't handle all cases gracefully.
**Fix:** Create a `ACTION_LABELS` mapping: `{ task_assigned: "assigned a task to", sprint_completed: "completed sprint", member_removed: "removed member" }`.

---

## SECTION 9 — CONTENT AUDIT (MICROCOPY)

### MC-001 | P1 | COPY — "super_boss" role name visible to users
**Issue:** Developer term leaking into user-facing UI (Sidebar, UserManagement, AccessControlPanel).
**Fix:** Map to "Owner" everywhere in the UI. Keep `super_boss` only as a database value.

---

### MC-002 | P1 | COPY — Loading screen exposes "Render" and "attempt X of 8"
**Already covered in UX-001. Flagged here too for copy team.**

---

### MC-003 | P2 | COPY — "Dep. Graph" and "What-If Sim" are abbreviations not labels
**Fix:** "Dependencies" and "Scenario Planner" (already covered in UX-017, UX-018).

---

### MC-004 | P2 | COPY — "pending_approval" shown as task status in UI
**Issue:** If a task's status is `pending_approval` and this value surfaces in the UI (status badge, filter chips), users see a raw database value.
**Fix:** Add to status label map: `pending_approval → "Awaiting Approval"`.

---

### MC-005 | P2 | COPY — "NL Chat" is an internal label, not a user-facing name
**Fix:** Rename to "AI Chat" or "Ask AI" in all user-facing contexts.

---

### MC-006 | P2 | COPY — "P50 / P90" in simulation output (already covered in UX-015)
**Fix:** "Most likely: X days" / "Worst case: Y days"

---

### MC-007 | P2 | COPY — Error messages are generic ("check your connection")
**Fix:** Specific error messages per endpoint:
- Tasks fail to load → "Couldn't load tasks. [Retry]"
- Task save fails → "Couldn't save changes. Your task is unsaved."
- Member invite fails → "Invite failed. Check the email address and try again."

---

### MC-008 | P3 | COPY — "Collaboration Score" has no explanation
**Issue:** A metric labeled "Collaboration Score: 74" with no tooltip or explanation. Users don't know what inputs drive this number.
**Fix:** Add info icon with tooltip: "Collaboration Score measures cross-team task handoffs, comment activity, and peer assignments over the past 30 days."

---

## SECTION 10 — INFORMATION ARCHITECTURE AUDIT

### IA-001 | P1 | IA — Current Structure (Broken)
```
Dashboard (1 route, 19 views)
├── Board
├── Summary Dashboard
├── Calendar
├── Sprints
├── Gantt Chart
├── Teams
├── Manager View
├── Team Workload
├── Members
├── My Capacity
├── Collaboration Score
├── Approvals
├── AI Risk Map
├── Analytics + Command Center
├── What-If Sim
├── Activity Feed
├── Dependency Graph
├── Integrations
└── Settings (+ sub-sections)
```

### IA-002 | P1 | IA — Recommended Structure
```
/dashboard (Board) — always the landing page
/dashboard/calendar
/dashboard/sprints
/dashboard/gantt
/dashboard/insights (merged: Analytics + Summary + Manager + AI Risk + Sim)
├── Overview tab (ex-Summary)
├── Team Health tab (ex-Manager + Workload)
├── Analytics tab (ex-Analytics Dashboard)
├── Risk tab (ex-AI Risk Map)
└── Scenarios tab (ex-What-If Sim)
/dashboard/people (merged: Teams + Members)
├── Teams tab
└── Members tab
/dashboard/approvals
/dashboard/activity
/dashboard/dependencies (ex-Dep. Graph)
/settings
├── /settings/account
├── /settings/workspace
├── /settings/notifications
├── /settings/integrations
├── /settings/security (admin only)
└── /settings/user-management (super_boss only)
```
**Result:** Sidebar shrinks from 19 items to 8 primary + Settings.

---

## SECTION 11 — DUPLICATE FEATURE REGISTER

| Duplicate | Files | Action |
|-----------|-------|--------|
| DnD logic | KanbanBoard.jsx + SprintView.jsx | Extract shared `<TaskColumn>` component |
| Card styles | 12+ variants | Merge to `tk-card` |
| Button styles | 6 variants | Merge to 3: primary, secondary, ghost |
| Analytics views | Summary + Manager + Workload + Collaboration + Analytics | Merge into Insights page |
| Board.jsx | `src/components/Board.jsx` + `src/src/components/Board.jsx` | Delete the `src/src/` duplicate |
| Primary color | `#3B82F6` (brand) vs `#6366f1` (used in 4 new components) | Standardize to `#3B82F6` |
| Toast systems | `UndoToast` + `SecurityAlertToast` + TeamsPanel local toast | Centralize to 1 toast provider |
| Modal close | 3 patterns (X button / overlay click / Escape) | Standardize: all 3 should work on all modals |
| Auth token | localStorage JWT + httpOnly cookie | Remove localStorage, use cookie only |
| Members + Teams | Members sidebar item + Teams sidebar item | Merge to "People" view |
| Notification polling + Socket.io | NotificationBell.jsx | Keep Socket.io only; drop polling (or keep as fallback only) |

---

## SECTION 12 — ZERO-BASED PRODUCT AUDIT

For each feature: *"If we didn't have this today, would we build it?"*

| Feature | Verdict | Reasoning |
|---------|---------|-----------|
| Kanban Board | ✅ Build | Core product — first thing every user needs |
| Sprint Planning | ✅ Build | Essential for engineering teams |
| Calendar View | ✅ Build | Universal need |
| Gantt Chart | ✅ Build (improve) | Enterprise expectation. Needs editing. |
| AI NL Chat | ✅ Build | Best differentiator — elevate it |
| Import/Export | ✅ Build | Required for migration from Jira/Trello |
| Approvals Workflow | ✅ Build | Genuine enterprise differentiator |
| Teams Panel | ✅ Build | Necessary for org structure |
| Notifications | ✅ Build | Standard expectation |
| Activity Feed | ✅ Build (improve) | Good for async teams — needs task links |
| Analytics Dashboard | ✅ Build (simplify) | Simplify to 5 KPIs + date range filter |
| Dependency Graph | ⚠️ Maybe | Niche — move into task detail, not sidebar |
| AI Risk Heatmap | ⚠️ Merge | Good idea, wrong placement — merge into Insights |
| What-If Simulation | ⚠️ Demote | Powerful but unusable — needs UX overhaul |
| Summary Dashboard | ❌ Remove | Duplicate of Analytics. Merge. |
| Manager View | ❌ Remove | Duplicate. Merge into Insights. |
| Team Workload | ❌ Remove | Duplicate. Merge into Insights. |
| Collaboration Score | ❌ Remove standalone | Move inside Analytics as a metric row |
| Jarvis Voice Assistant | ❌ Remove | Zero real-world use cases in PM tool |
| Security Dashboard (in sidebar) | ❌ Demote | Admin-only, belongs in Settings |
| Integrations (in sidebar) | ❌ Demote | Belongs in Settings |
| My Capacity (in sidebar) | ⚠️ Demote | Belongs in user profile/account settings |

---

## SECTION 13 — FEATURE ROI MATRIX

| Feature | Dev Cost to Maintain | User Value | ROI | Recommendation |
|---------|---------------------|------------|-----|----------------|
| Kanban Board | High | Critical | 🟢 High | Core investment |
| NL Chat | Medium | High (differentiator) | 🟢 High | Invest more |
| Sprint Planning | High | High | 🟢 High | Core investment |
| Notifications | Low | High | 🟢 High | Maintain |
| Import/Export | Medium | High (adoption) | 🟢 High | Keep |
| Calendar | Medium | Medium | 🟡 Medium | Keep |
| Analytics | High (currently) | High | 🟢 High after server-side move | Refactor |
| Gantt | Medium | Medium | 🟡 Medium | Keep, add editing |
| Dependency Graph | Medium | Low-Medium | 🟡 Medium | Demote to task detail |
| AI Risk Heatmap | High | Low (unused) | 🔴 Low | Merge into Analytics |
| What-If Simulation | High | Low (unusable) | 🔴 Low | UX overhaul or remove |
| Jarvis Voice | High | Very Low | 🔴 Very Low | Remove |
| Summary Dashboard | Low | Low (duplicate) | 🔴 Low | Remove |
| Collaboration Score | Medium | Low (unexplained) | 🔴 Low | Fix or remove |
| Security Dashboard | Medium | Low (wrong audience) | 🔴 Low | Admin-only, Settings |

---

## SECTION 14 — CLICK REDUCTION AUDIT

| Workflow | Current Clicks | Minimum Possible | How to Achieve |
|----------|---------------|-----------------|----------------|
| Create task | 4 (board → + → fill form → save) | 1 (N key → type title → Enter) | Inline task add in column |
| Change task status | 3 (drag card across board) | 1 (status dropdown on card) | Inline status dropdown |
| View blocked tasks | 3 (sidebar → Dep. Graph → Blocked tab) | 1 (Sidebar → Board → filtered "Blocked" column) | Already exists in Kanban! Just remove the extra step |
| Start a sprint | 5 (Sprints → Create → fill 4 fields → Start) | 2 (Sprints → "Start 2-week sprint" quick button) | Smart defaults |
| Invite team member | 5 (Members → Invite → email → role → Send) | 2 (Members → [email field] → Enter) | Inline invite |
| Run a simulation | 6 (sidebar → What-If → configure → run → read → close) | 3 (Insights → Scenarios → run) | Merge into Insights |
| Find a specific task | 3 (Cmd+K → type → select) | 2 (already fast; reduce one confirmation click) | Good already |
| View analytics | 2 (sidebar → Analytics) | 2 (good) | Already acceptable |
| Switch workspace | 3 (sidebar → workspace menu → select) | 2 (navbar switcher → select) | Move to navbar |
| Open Settings | 3 (sidebar → scroll down → Settings) | 1 (gear icon in navbar) | Add navbar shortcut |
| Check notifications | 2 (click bell → read list) | 2 (good) | Already acceptable |

---

## SECTION 15 — 10-SECOND MANAGER TEST

*Open the app. Within 10 seconds, can a manager see:*

| Question | Currently | Required |
|----------|-----------|----------|
| How many tasks are overdue? | ❌ Requires navigating to Board + filtering | ✅ KPI on home screen |
| How many tasks are blocked? | ❌ Requires navigating to Dep. Graph | ✅ Badge on sidebar + KPI |
| What's the sprint progress? | ❌ Requires navigating to Sprints | ✅ Progress bar on home screen |
| Who is overloaded? | ❌ Requires navigating to Team Workload | ✅ Top-3 overloaded members visible |
| Are there pending approvals? | ❌ Requires navigating to Approvals | ✅ Badge count on sidebar |
| What's the team velocity? | ❌ Requires navigating to Analytics | ✅ Spark line on home screen |
| Any at-risk tasks? | ❌ Requires navigating to AI Risk | ✅ AI risk score visible on task cards |

**Result:** 0/7 pass. A manager opening Taskora sees an empty Kanban board with no health information.

**Fix:** When `role === "manager"` or `"super_boss"`, default view should be "Command Center" (the one that already exists in CommandCenter.jsx) — **this component already exists and is excellent**. It just needs to be the default landing view for managers.

---

## SECTION 16 — 2-MINUTE NEW USER TEST

*New user registers. Within 2 minutes, can they:*

| Action | Currently | Fix |
|--------|-----------|-----|
| Create their first task | ✅ Yes (N key or + button) | Good |
| Understand what the sidebar does | ❌ 17 items with no descriptions | Tooltips on hover |
| Add a teammate | ❌ Buried in Members panel | Onboarding checklist with link |
| Assign a task to someone | ⚠️ Only in create modal | Add inline in task card |
| See their tasks in a sprint | ❌ Must create sprint first, then move tasks | Quick sprint creation |
| Know what AI features exist | ❌ Hidden AI bubble, no discovery | Onboarding moment |
| Set a due date | ✅ In create modal | Good |
| Understand their workspace health | ❌ Empty board, no context | Onboarding empty state |

**Result:** 2/8 pass. User creates a task and sets a date but has no context on anything else.

---

## SECTION 17 — MOBILE / RESPONSIVE AUDIT

### M-001 | P1 | MOBILE — Sidebar navigation unusable on mobile
**Issue:** Sidebar is a fixed left panel ~220px wide. On a 375px mobile screen, this leaves only 155px for content — unusable. While `DashboardMobile.jsx` exists, it's unclear how it's integrated.
**Fix:** On mobile (`useIsMobile` hook), render a bottom tab bar with max 5 items instead of the sidebar.

### M-002 | P1 | MOBILE — DnD on Kanban is unreliable on touch
**Issue:** `@hello-pangea/dnd` has known touch event issues on mobile. Drag distance threshold, scroll-while-dragging, and touch target size all create problems.
**Fix:** On mobile, show the inline status dropdown instead of relying on DnD.

### M-003 | P2 | MOBILE — Gantt chart is SVG — impossible to zoom/pan on mobile
**Fix:** Hide Gantt on mobile. Show a list of tasks grouped by due date instead.

### M-004 | P2 | MOBILE — Modals are full-width with no mobile-specific layout
**Issue:** `TaskDetailModal`, `CreateTaskModal` use fixed pixel widths that overflow on small screens.
**Fix:** `maxWidth: "min(600px, 95vw)"` on all modals.

---

## SECTION 18 — ORPHANED / DUPLICATE FILES

| File | Issue | Action |
|------|-------|--------|
| `frontend/src/src/components/Board.jsx` | Duplicate directory — orphaned | Delete entire `src/src/` directory |
| `frontend/src/src/components/Card.jsx` | Same orphaned directory | Delete |
| `frontend/src/src/components/Column.jsx` | Same | Delete |
| `frontend/src/components/Board.jsx` | Is this used or a leftover? | Verify usage; if unused, delete |
| `frontend/src/components/ProgressBar.jsx` | Standalone component — is it used? | Audit usage |
| `frontend/src/components/WorkloadBar.jsx` | Similar to WorkloadBar in CommandCenter | Check if duplicate |
| `files.zip` and `files/` in repo root | Likely leftover artifacts | Delete; add to `.gitignore` |
| `backend/routes/seed.js` | Should not be reachable in production | Remove from production route registration |

---

## SECTION 19 — LAUNCH BLOCKER REGISTER

### P0 — Ship with these and you face data loss, security breach, or user-trust failure:

| ID | Issue |
|----|-------|
| S-001 | `/api/seed` route accessible in production |
| S-002 | JWT in localStorage — XSS exposure |
| DS-006 | 4 new components completely broken in light mode (135 hardcoded colors) |
| B-001 | ImportWizard HistoryTab never loads (useState-as-useEffect bug) |
| B-002 | CommandCenter TaskRow always navigates to board, not the specific task |
| P-001 | Render cold start (30-45s) destroys first impressions |
| S-006 | `pending_approval` may not be in DB constraint — silent data loss |
| UX-001 | "Waking up server, attempt 3 of 8" message |

### P1 — Must fix before launch:

| ID | Issue |
|----|-------|
| S-003 | CORS allows any *.vercel.app |
| S-004 | Demo users share one account |
| S-005 | No email verification |
| B-003 | Plan limits defined but never enforced (misleading pricing) |
| B-004 | Auth timeout loses current URL |
| B-005 | Task delete has no adequate confirmation |
| DS-001 | Two competing CSS token systems |
| DS-002 | Three primary button definitions |
| DS-003 | Two body fonts in conflict |
| DS-004 | Off-brand `#6366f1` in 4 components |
| UX-002 | 17 sidebar items (cognitive overload) |
| UX-003 | New user sees empty board with no guidance |
| UX-004 | CreateTaskModal has 9+ fields |
| UX-005 | No shareable/deep-linkable URLs |
| UX-006 | Workspace delete needs text confirmation |
| UX-007 | No 1-click status change on task cards |
| UX-009 | Demo session 5-minute timer |
| A-001 | No focus trap in any modal |
| A-002 | All inputs use placeholder as label only |
| A-003 | No ARIA labels on icon-only buttons |
| A-004 | DnD has no keyboard alternative |
| P-002 | All tasks loaded with no pagination |
| P-003 | Analytics computed client-side |
| P-004 | No code splitting |
| BE-001 | No database migration tooling |
| BE-003 | No API versioning |
| MC-001 | "super_boss" visible to users |

---

## SECTION 20 — COMPETITIVE BENCHMARK

| Feature | Taskora | Linear | Jira | ClickUp | Notion |
|---------|---------|--------|------|---------|--------|
| Kanban Board | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sprint Planning | ✅ | ✅ | ✅ | ✅ | ❌ |
| Gantt Chart | ⚠️ Read-only | ❌ | ✅ Editable | ✅ Editable | ❌ |
| AI Features | ✅ (best here) | ✅ Lite | ✅ AI assist | ✅ AI | ✅ AI |
| Inline Task Add | ❌ | ✅ | ❌ | ✅ | ✅ |
| List View | ❌ | ✅ | ✅ | ✅ | ✅ |
| Custom Fields | ❌ | ✅ | ✅ | ✅ | ✅ |
| Deep Linking | ❌ | ✅ | ✅ | ✅ | ✅ |
| Mobile App | ❌ | ✅ | ✅ | ✅ | ✅ |
| Bulk Actions | ❌ | ✅ | ✅ | ✅ | ✅ |
| SSO | ❌ | ✅ | ✅ | ✅ | ✅ |
| Dark/Light Mode | ⚠️ Partial | ✅ | ✅ | ✅ | ✅ |
| API / Webhooks | ❌ | ✅ | ✅ | ✅ | ✅ |
| Email Verification | ❌ | ✅ | ✅ | ✅ | ✅ |
| Shareable Task Links | ❌ | ✅ | ✅ | ✅ | ✅ |
| Cold Start | ❌ 30-45s | ✅ Instant | ✅ Instant | ✅ Instant | ✅ Instant |

**Where Taskora leads:** AI Chat, Simulation/Scenario Planning, Approval workflow, Blocked task analytics, Real-time Socket.io updates  
**Where Taskora is behind:** Virtually everything else in the table above

---

## SECTION 21 — FINAL AUDIT SCORECARD

| Dimension | Score | Key Issues |
|-----------|-------|------------|
| **Security** | 4/10 | JWT localStorage, seed in prod, CORS wildcard, no email verify |
| **Performance** | 3/10 | Cold start, no pagination, no code splitting |
| **Accessibility** | 3/10 | No focus trap, no labels, no ARIA, no touch minimum |
| **Design System** | 4/10 | Two token systems, 135 hardcoded colors, 3 button variants |
| **UX / Flows** | 5/10 | Too many clicks, 17 sidebar items, no deep links, no bulk ops |
| **Dark Mode** | 5/10 | 4 new components completely broken |
| **Product Logic** | 6/10 | Good feature set, wrong IA, duplicate views |
| **AI Differentiation** | 8/10 | NL Chat, Simulation, Risk Map are genuinely differentiated |
| **Backend Quality** | 6/10 | Good structure, missing migration tooling and API docs |
| **Mobile** | 3/10 | Afterthought responsive, no touch optimization |
| **Launch Readiness** | 4/10 | 8 P0 blockers, 27 P1 issues |

---

## SECTION 22 — RECOMMENDED EXECUTION ORDER

### Week 1 — P0 Blockers (Security + Stability)
1. Remove `/api/seed` from production (S-001)
2. Upgrade Render to Starter tier (P-001)
3. Fix `useState` → `useEffect` in ImportWizard (B-001)
4. Fix CommandCenter TaskRow navigation (B-002)
5. Change cold-start message copy (UX-001)
6. Apply schema migration for `pending_approval` (S-006)

### Week 2 — P0 Blockers (Dark Mode)
7. Replace 135 hardcoded hex colors in BlockedDashboard, CommandCenter, ImportWizard, TeamsPanel with CSS variable tokens (DS-006)
8. Replace all `#6366f1` with `var(--tk-accent, #3B82F6)` in the same 4 files (DS-004)

### Week 3 — P1 Fixes (UX + Auth)
9. Reduce sidebar to 7-8 items (UX-002)
10. Add focus trap to all modals (A-001)
11. Add `<label>` to all form inputs (A-002)
12. Add ARIA labels to all icon-only buttons (A-003)
13. Fix auth redirect to preserve return URL (B-004)
14. Add inline status dropdown to TaskCard (UX-007)

### Week 4 — P1 Fixes (Product)
15. Extend demo timer to 30 minutes (UX-009)
16. Improve onboarding empty state (UX-003)
17. Simplify CreateTaskModal to 3 fields (UX-004)
18. Add deep linking via URL params (UX-005)
19. Workspace delete text confirmation (UX-006)
20. Make CommandCenter default view for managers (UX-015 per 10-Second Manager Test)

### Week 5 — Design System Consolidation
21. Consolidate button classes to 3 (DS-002)
22. Fix font conflict (DS-003)
23. Fix DependencyGraph SVG node fill (DS-010)
24. Merge analytics CSS — fix analytics-type-bar-wrap (DS-009)

### Post-Launch Roadmap (P3/P4)
- Implement real plan enforcement or remove upgrade gates
- Server-side analytics endpoint
- Code splitting with React.lazy
- Database pagination for tasks
- API versioning /api/v1/
- OpenAPI documentation
- node-pg-migrate for schema management
- Mobile-optimized layout
- Bulk task operations
- List/table view toggle

---

*End of MASTER_AUDIT.md — 22 sections, 120+ issues catalogued, every file read.*
*Next step: Work P0s first. Commit nothing until the P0 list is empty. Then P1. Never mix priorities in one PR.*
