# Taskora — Full Product Audit Report
**Date:** 2026-04-30 | **Benchmark:** Monday.com, ClickUp, Jira | **Auditor:** Jarvis AI

---

## PHASE 1 — QA + UX AUDIT

---

### 🔴 CRITICAL ISSUES

---

**#1 — Summary Tab Fails to Load**
- 📍 Location: `/dashboard` → Summary view → `SummaryDashboard.jsx`
- ❌ Problem: API call to `/api/personal/dashboard` silently fails; user sees blank or infinite spinner
- 🎯 Impact: Core dashboard view is broken for all users — massive trust failure
- 🧠 Root Cause: Error swallowed in `.catch()` with no user feedback; backend `personal.js` crashes if `user_capacity` row is missing
- ✅ Fix: Add error state UI; insert default `user_capacity` row on user creation; wrap `wl.dailyCommittedLoad()` in try/catch ✅ (already fixed)
- ⚡ Priority: CRITICAL

---

**#2 — Role Update Not Persisted in Members Panel**
- 📍 Location: Manager → Team → `MembersPanel.jsx`
- ❌ Problem: Changing a member's role appears to save but reverts; `role` field on enriched members is overwritten by capacity data spread
- 🎯 Impact: Managers cannot update team roles — core admin function broken
- 🧠 Root Cause: `const enrichedMembers = members.map(m => ({ ...m, ...(capacities[m.user_id] || {}) }))` — capacity object contains a `role` field from `users.role` that clobbers `workspace_members.role`
- ✅ Fix: Add `role: m.role` after the spread to preserve workspace role ✅ (already fixed)
- ⚡ Priority: CRITICAL

---

**#3 — Simulation Panel Shows Blank Forecast Chart**
- 📍 Location: Simulation view → `SimulationPanel.jsx` → `PredictionChart`
- ❌ Problem: When user is on leave, `prediction.days` is empty array; chart renders nothing with no explanation
- 🎯 Impact: Simulation feature appears broken; confuses managers doing capacity planning
- 🧠 Root Cause: `if (!prediction.days?.length) return null` — silent return, no feedback
- ✅ Fix: Show "🏖️ Member is on leave — no forecast available" message ✅ (already fixed)
- ⚡ Priority: CRITICAL

---

**#4 — No Global Error Boundary Around Views**
- 📍 Location: `Dashboard.jsx` — all view conditionals
- ❌ Problem: A single component crash (e.g., null data) causes the entire dashboard to white-screen
- 🎯 Impact: One bad API response crashes the whole app for the user — complete data loss of UI state
- 🧠 Root Cause: `ErrorBoundary.jsx` exists but is only used in limited places; most view switches are not wrapped
- ✅ Fix: Wrap each view in `<ErrorBoundary>` with a per-view fallback; log errors to a monitoring service
- ⚡ Priority: CRITICAL

---

**#5 — Demo Session Expiry Has No Warning**
- 📍 Location: `AuthContext.jsx` → demo mode logic
- ❌ Problem: Demo session auto-expires after 5 minutes with no countdown or warning; user is silently logged out mid-interaction
- 🎯 Impact: Potential customers lose all work during demos — severely damages conversion
- 🧠 Root Cause: `setTimeout(logout, 5 * 60 * 1000)` fires with no UI signal
- ✅ Fix: Show a countdown banner at 60s remaining ("Demo expires in 45s…") with a "Sign up to save" CTA
- ⚡ Priority: CRITICAL

---

### 🟠 HIGH ISSUES

---

**#6 — `updated_at` Field Used Everywhere, Doesn't Exist**
- 📍 Location: `ManagerOverview.jsx`, `AnalyticsDashboard.jsx`, `TaskCard.jsx`
- ❌ Problem: Code references `task.updated_at` which is not in the DB schema — displays "Invalid Date" or NaN
- 🎯 Impact: Task timestamps, "stuck" detection, and analytics are all broken
- 🧠 Root Cause: DB only has `completed_at` and `created_at`; `updated_at` was never implemented
- ✅ Fix: Replace all `updated_at` refs with `completed_at || created_at` ✅ (already fixed)
- ⚡ Priority: HIGH

---

**#7 — `in_progress` vs `inprogress` Status Inconsistency**
- 📍 Location: 7+ components including `KanbanBoard`, `FilterBar`, `Dashboard.jsx`, `SprintView.jsx`
- ❌ Problem: Backend stores status as `in_progress`; frontend uses `inprogress`; many filter/sort operations miss half the tasks
- 🎯 Impact: Tasks disappear from boards, incorrect counts in analytics, wrong status in exports
- 🧠 Root Cause: No single canonical status normalizer; some DB rows have `in_progress`, some `inprogress`
- ✅ Fix: Normalize at every display point with `t.status === "in_progress" ? "inprogress" : t.status` ✅ (already fixed)
- ⚡ Priority: HIGH

---

**#8 — Password Validation Mismatch (Frontend vs Backend)**
- 📍 Location: `AccountSettingsModal.jsx` → frontend validates ≥6 chars; backend requires ≥8
- ❌ Problem: User enters a 7-char password, frontend says OK, backend returns 400 error with no helpful message
- 🎯 Impact: Confusing UX; user feels the form is broken
- 🧠 Root Cause: Frontend min-length not in sync with backend Zod validation
- ✅ Fix: Set frontend to ≥8 chars minimum ✅ (already fixed)
- ⚡ Priority: HIGH

---

**#9 — Missing "In Review" Status in Task Dropdowns**
- 📍 Location: `CreateTaskModal.jsx`, `TaskDetailModal.jsx`, `FilterBar.jsx`
- ❌ Problem: DB supports `review` status but dropdowns only show todo/inprogress/done — tasks move to review via API but can't be set via UI
- 🎯 Impact: Review workflow completely bypassed; code review, QA handoffs break
- 🧠 Root Cause: Dropdowns hardcoded without `review` option
- ✅ Fix: Add `<option value="review">In Review</option>` to all three ✅ (already fixed)
- ⚡ Priority: HIGH

---

**#10 — Workload Dashboard Uses Undefined CSS Variables**
- 📍 Location: `WorkloadDashboard.jsx`
- ❌ Problem: Uses `var(--color-success)`, `var(--color-warning)` which are never defined; browser renders fallback black
- 🎯 Impact: Workload bars appear black/broken; visual hierarchy completely lost
- 🧠 Root Cause: CSS variables defined in design spec but not in `index.css`
- ✅ Fix: Replace with direct hex theme values (#10b981, #f59e0b, #ef4444) ✅ (already fixed)
- ⚡ Priority: HIGH

---

### 🟡 MEDIUM ISSUES

---

**#11 — No Offline / Network Error Handling**
- 📍 Location: All API calls in all components
- ❌ Problem: When backend is down, every component shows blank/frozen UI with no feedback
- 🎯 Impact: Users think the app is broken; no retry mechanism
- 🧠 Root Cause: `catch` blocks either swallow errors or set generic "Failed" messages
- ✅ Fix: Add global axios interceptor to detect network errors; show a toast "Connection lost — retrying…" with exponential backoff
- ⚡ Priority: MEDIUM

---

**#12 — Kanban Board Has No Empty State for Columns**
- 📍 Location: `KanbanBoard.jsx`
- ❌ Problem: When a column is empty, it shows blank space — no "Drop tasks here" guide for new users
- 🎯 Impact: New users don't understand how to use the board; high drop-off on first use
- 🧠 Root Cause: No empty state component rendered when `tasks.length === 0`
- ✅ Fix: Render an illustrated empty state with a contextual CTA ("Create your first task →")
- ⚡ Priority: MEDIUM

---

**#13 — No Bulk Task Actions**
- 📍 Location: All views — missing feature
- ❌ Problem: Users can only act on one task at a time; no multi-select for bulk status change, bulk assign, or bulk delete
- 🎯 Impact: Power users waste significant time on repetitive operations; key ClickUp differentiator missing
- 🧠 Root Cause: Not implemented
- ✅ Fix: Add checkbox multi-select to task lists; bulk action toolbar appears on selection
- ⚡ Priority: MEDIUM

---

**#14 — Sprint Board Drag-and-Drop Has No Undo**
- 📍 Location: `SprintView.jsx` → `handleDragEnd`
- ❌ Problem: Moving a task between sprint columns is instant with no undo; mis-drags are permanent
- 🎯 Impact: Data loss for accidental drops; no safety net
- 🧠 Root Cause: Optimistic update is applied immediately with no undo queue
- ✅ Fix: Implement 5-second undo toast (same pattern as task deletion already implemented in `Dashboard.jsx`)
- ⚡ Priority: MEDIUM

---

**#15 — CalendarView Shows Tasks with No Due Date**
- 📍 Location: `CalendarView.jsx`
- ❌ Problem: Logic for grouping tasks by date could display tasks on wrong dates if month indexing is off
- 🎯 Impact: Tasks appear on wrong dates; calendar is unreliable
- 🧠 Root Cause: `getMonth()` returns 0-indexed; API returns 1-indexed month strings — ensure consistent handling
- ✅ Fix: Verify and normalize month indexing throughout calendar component
- ⚡ Priority: MEDIUM

---

**#16 — AI Bubble Has No "Close" Keyboard Shortcut**
- 📍 Location: `AIBubble.jsx`
- ❌ Problem: ⌘/ opens the AI bubble but there's no visible close button; Escape behavior inconsistent
- 🎯 Impact: Users get stuck in the AI panel; frustrating UX for keyboard-first users
- 🧠 Root Cause: `onKeyDown` not wired to close on Escape
- ✅ Fix: Add `Escape` key handler; add visible "✕" close button
- ⚡ Priority: MEDIUM

---

**#17 — No Task Search in Command Palette Results**
- 📍 Location: `CommandPalette.jsx`
- ❌ Problem: ⌘K search shows navigation commands but doesn't search actual tasks by title
- 🎯 Impact: Users expect Spotlight-like search for tasks; missing core productivity feature
- 🧠 Root Cause: `CommandPalette` only searches hardcoded command list, not task data
- ✅ Fix: Add task search tier to palette using `/tasks/workspace/:id` API
- ⚡ Priority: MEDIUM

---

**#18 — Notification Bell Shows Count but List is Empty**
- 📍 Location: `NotificationBell.jsx`
- ❌ Problem: Badge shows unread count but on click the list sometimes shows "No notifications" due to race condition
- 🎯 Impact: Users lose trust in notification system; miss important updates
- 🧠 Root Cause: Count endpoint (`/notifications/count`) and list endpoint (`/notifications`) are separate calls; count loads first while list is still loading
- ✅ Fix: Load count and list simultaneously; show skeleton loader while list loads
- ⚡ Priority: MEDIUM

---

### 🟢 LOW ISSUES

---

**#19 — Missing Favicon and App Icon**
- 📍 Location: `public/` directory
- ❌ Problem: Browser tab shows generic React icon; no PWA manifest
- ✅ Fix: Add branded favicon.svg and manifest.json
- ⚡ Priority: LOW

---

**#20 — "Board" Component is Unused Duplicate**
- 📍 Location: `components/Board.jsx`, `components/Column.jsx`
- ❌ Problem: Legacy files exist alongside `KanbanBoard.jsx`; adds confusion and bundle size
- ✅ Fix: Delete `Board.jsx` and `Column.jsx`
- ⚡ Priority: LOW

---

## PHASE 2 — ENGINEERING FIXES

### Fix #4 — Wrap All Views in ErrorBoundary

```jsx
// Dashboard.jsx — wrap each view
{view === "summary" && (
  <ErrorBoundary fallback={<ViewError view="Summary" />}>
    <SummaryDashboard workspaceId={currentWorkspace?.id} />
  </ErrorBoundary>
)}
```

```jsx
// components/ErrorBoundary.jsx — add fallback prop support
function ViewError({ view }) {
  return (
    <div className="view-error">
      <h3>⚠️ {view} failed to load</h3>
      <p>Refresh the page or contact support if this persists.</p>
    </div>
  );
}
```

---

### Fix #5 — Demo Session Countdown

```jsx
// AuthContext.jsx — add countdown timer
const [demoSecondsLeft, setDemoSecondsLeft] = useState(null);

useEffect(() => {
  if (!isDemoSession) return;
  const DEMO_DURATION = 5 * 60;
  let remaining = DEMO_DURATION;
  const interval = setInterval(() => {
    remaining--;
    setDemoSecondsLeft(remaining);
    if (remaining <= 0) { clearInterval(interval); logout(); }
  }, 1000);
  return () => clearInterval(interval);
}, [isDemoSession]);

// In Navbar.jsx — show countdown banner
{demoSecondsLeft !== null && demoSecondsLeft <= 60 && (
  <div className="demo-warning-banner">
    ⏳ Demo expires in {demoSecondsLeft}s —{" "}
    <Link to="/register">Sign up to save your work</Link>
  </div>
)}
```

---

### Fix #11 — Network Error Interceptor

```js
// api/api.js — add network error handling
api.interceptors.response.use(
  res => res,
  err => {
    if (!err.response) {
      // Network error
      window.dispatchEvent(new CustomEvent("network-error", { detail: err.message }));
    }
    if (err.response?.status === 401) { /* ... existing logic */ }
    return Promise.reject(err);
  }
);
```

```jsx
// App.jsx or Dashboard.jsx — listen for network errors
useEffect(() => {
  const handler = () => toast.error("Connection lost — retrying…");
  window.addEventListener("network-error", handler);
  return () => window.removeEventListener("network-error", handler);
}, []);
```

---

### Fix #13 — Bulk Task Actions

```jsx
// hooks/useBulkSelect.js
export function useBulkSelect(tasks) {
  const [selected, setSelected] = useState(new Set());
  const toggle = (id) => setSelected(s => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAll = () => setSelected(new Set(tasks.map(t => t.id)));
  const clear = () => setSelected(new Set());
  return { selected, toggle, selectAll, clear };
}
```

```jsx
// BulkActionBar component
function BulkActionBar({ count, onStatusChange, onDelete, onClear }) {
  return (
    <div className="bulk-bar">
      <span>{count} selected</span>
      <select onChange={e => onStatusChange(e.target.value)}>
        <option value="">Change status…</option>
        <option value="inprogress">In Progress</option>
        <option value="done">Done</option>
      </select>
      <button onClick={onDelete} className="btn-danger">Delete</button>
      <button onClick={onClear}>Clear</button>
    </div>
  );
}
```

---

## PHASE 3 — BACKLOG

| ID | Title | Type | Priority | Effort | Column | Tags |
|----|-------|------|----------|--------|--------|------|
| BL-001 | Fix Summary tab loading failure | Bug | Critical | 4h | Urgent | frontend, api |
| BL-002 | Wrap all Dashboard views in ErrorBoundary | Bug | Critical | 3h | Urgent | frontend |
| BL-003 | Add demo session countdown banner | Improvement | Critical | 4h | Urgent | frontend, ux |
| BL-004 | Add bulk task selection and actions | Feature | High | 16h | Backlog | frontend |
| BL-005 | Add undo for Sprint board drag-drop | Improvement | High | 8h | Backlog | frontend |
| BL-006 | Task search in Command Palette | Feature | High | 12h | Backlog | frontend |
| BL-007 | Fix notification bell race condition | Bug | High | 6h | Urgent | frontend |
| BL-008 | Network offline handling + retry | Improvement | High | 8h | Backlog | frontend, api |
| BL-009 | Add `updated_at` column to tasks table | Improvement | High | 4h | Backlog | backend, db |
| BL-010 | Normalize status at DB level (migration) | Bug | High | 8h | Backlog | backend, db |
| BL-011 | Add Escape key to close AI Bubble | Bug | Medium | 2h | Urgent | frontend |
| BL-012 | Delete unused Board.jsx / Column.jsx | Chore | Low | 1h | Backlog | frontend |
| BL-013 | Favicon and PWA manifest | Improvement | Low | 2h | Backlog | frontend |
| BL-014 | Empty state illustrations for Kanban | Improvement | Medium | 8h | Backlog | frontend, ux |
| BL-015 | Mobile responsive audit and fixes | Improvement | Medium | 20h | Backlog | frontend, ux |

**Total effort: ~106 hours (~13 days)**

**Execution order:**
BL-002 → BL-001 → BL-007 → BL-011 → BL-003 → BL-008 → BL-009 → BL-010 → BL-005 → BL-006 → BL-004 → BL-014 → BL-015 → BL-012 → BL-013

---

## PHASE 4 — BUG → FIX PIPELINE

### Pipeline: Demo Session Expiry (BL-003)

| Stage | Details |
|-------|---------|
| **Bug** | Demo users silently logged out after 5 min with no warning |
| **Root Cause** | `setTimeout(logout, 300000)` fires with zero UI feedback |
| **Fix** | Countdown timer in AuthContext + warning banner in Navbar |
| **Test Case** | Start demo → wait 4 min → verify banner appears → verify logout at 5 min |
| **Regression Risk** | Low — only affects demo sessions; add `isDemoSession` guard |
| **Deploy** | Frontend-only change; no DB migration needed |

---

### Pipeline: Status Normalization (BL-010)

| Stage | Details |
|-------|---------|
| **Bug** | Tasks with status `in_progress` invisible in filters/boards expecting `inprogress` |
| **Root Cause** | Two valid status strings exist with no enforced canonical form |
| **Fix** | DB migration: `UPDATE tasks SET status='inprogress' WHERE status='in_progress'`; add CHECK constraint |
| **Test Case** | Create task via API → verify status stored as `inprogress` → verify shows in Kanban "In Progress" column |
| **Regression Risk** | Medium — any existing code checking `=== 'in_progress'` will break; audit all comparisons |
| **Deploy** | Run migration in maintenance window; deploy backend first, then frontend |

---

## PHASE 5 — USER SIMULATION

---

### Persona 1: New User (First Visit)

**Goal:** Sign up and create first task

| Step | Action | Problem | Fix |
|------|--------|---------|-----|
| 1 | Lands on Home page | No clear value proposition above fold; unclear what Taskora does | Add 3-word tagline + animated demo GIF |
| 2 | Clicks "Get Started" | Goes straight to Register — no preview/demo option visible | Add "Try Demo" CTA on landing page |
| 3 | Registers | Form works well | ✅ |
| 4 | Sees "Create workspace" | Good onboarding step | ✅ |
| 5 | Opens Kanban board | Empty board — no guidance | Add onboarding checklist overlay |
| 6 | Clicks "New Task" | Modal opens correctly | ✅ |
| 7 | Confused by "Type" field | What's an "RFP"? No tooltip | Add type descriptions on hover |
| 8 | Saves task | Task appears in "To Do" | ✅ |
| **Drop-off point** | Doesn't know about filters, sprints, AI features | No feature discovery | Add "What's new" tour |

---

### Persona 2: Power User (Daily Driver)

**Goal:** Plan sprint, assign tasks, track team

| Step | Action | Problem | Fix |
|------|--------|---------|-----|
| 1 | Opens Manager view | Loads correctly | ✅ |
| 2 | Checks workload | Bars look broken (black) if CSS vars missing | Already fixed |
| 3 | Tries to create sprint | SprintModal works | ✅ |
| 4 | Assigns tasks to sprint | Drag-and-drop works | ✅ |
| 5 | Checks burndown | Works when tasks have data | ✅ |
| 6 | Tries to bulk-reassign 10 tasks | No bulk action — must do one by one | BL-004 needed |
| 7 | Opens AI Risk view | Risk heatmap loads | ✅ |
| **Key friction** | No keyboard shortcut to switch between tasks | Add `j/k` vim-style navigation |

---

### Persona 3: Busy Professional (Mobile User)

**Goal:** Quick task check and update on phone

| Step | Action | Problem | Fix |
|------|--------|---------|-----|
| 1 | Opens app on phone | Sidebar takes 40% of screen | Add hamburger menu for mobile |
| 2 | Tries to drag task on Kanban | Touch drag unreliable | Test @hello-pangea/dnd touch support |
| 3 | Opens TaskDetailModal | Modal too wide for mobile, scrolls weirdly | Make modal full-screen on mobile |
| 4 | Tries Command Palette | ⌘K doesn't work on mobile | Add mobile-friendly action menu |
| **Drop-off point** | App is unusable on mobile | No mobile-first design | Mobile responsive sprint needed (BL-015) |

---

### Persona 4: First-Time Visitor (Evaluator)

**Goal:** Understand if Taskora can replace Jira

| Step | Action | Problem | Fix |
|------|--------|---------|-----|
| 1 | Reads landing page | "Task management" too generic | Add "vs Jira", "vs ClickUp" comparison |
| 2 | Clicks "Try Demo" | 5-min demo is too short to explore | Extend demo to 15 min; add save option |
| 3 | Explores AI Risk view | Impressive; clearly differentiating | ✅ Keep and highlight |
| 4 | Looks for integrations | Slack/GitHub integrations exist but hard to find | Promote integrations in onboarding |
| 5 | Checks pricing | No pricing page | Add pricing page before conversion |
| **Key win** | AI features are genuinely impressive vs competitors | Lean into AI-first positioning |

---

## TOP 10 CRITICAL ITEMS (Executive Summary)

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Summary tab not loading | 🔴 Critical | Needs fix |
| 2 | Demo session no countdown | 🔴 Critical | Needs fix |
| 3 | No ErrorBoundary on views | 🔴 Critical | Needs fix |
| 4 | Role update not saving | 🔴 Critical | ✅ Fixed |
| 5 | status `in_progress` vs `inprogress` | 🟠 High | ✅ Fixed |
| 6 | Missing "In Review" status | 🟠 High | ✅ Fixed |
| 7 | Notification bell race condition | 🟠 High | Needs fix |
| 8 | No bulk task actions | 🟠 High | Needs build |
| 9 | Mobile UI broken | 🟡 Medium | Needs sprint |
| 10 | No network error handling | 🟡 Medium | Needs fix |

---

## HEALTH SCORE: 68/100

**Strong:** Real-time updates, AI features, sprint management, role-based access, drag-and-drop
**Weak:** Error handling, mobile UX, onboarding, status normalization, empty states
