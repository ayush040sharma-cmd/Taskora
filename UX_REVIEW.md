# UX REVIEW
**Taskora v1.0 — Phase 3 Audit**
**Date:** 2026-06-30

---

## OVERALL UX VERDICT: STRONG WITH TARGETED FIXES NEEDED

Taskora's UX is polished and modern for a v1.0. The design system is consistent, the dark theme is well-executed, and most workflows are intuitive. Three issues need fixing before launch.

---

## CRITICAL UX ISSUES

### UX-CRIT-01: Demo Expires With Zero Warning — Kills Evaluation Experience
**Priority: P1**
- A first-time evaluator exploring the product gets redirected to the login page without warning after exactly 5 minutes
- They lose all in-progress work (tasks created, events added, settings changed)
- The experience peaks during the first demo session and the abrupt expiry creates a negative lasting impression precisely when the product should be winning them over

**Fix:**
1. Add a visible countdown badge in the sidebar bottom: "⏱ Demo: 2:30 left"
2. At 60 seconds: show a yellow toast "Your demo expires in 60 seconds. Sign up to save your workspace →"
3. At expiry: slide-in panel (not full redirect) with "Your session ended. Create a free account to keep your work" + CTA button

---

### UX-CRIT-02: Keyboard Shortcut Fires Inside Modal Text Inputs
**Priority: P1**
- Typing any shortcut key character (n, b, k, ?) inside a modal's input field (sprint name, task title, etc.) triggers global shortcuts
- Sprint creation with the word "Sprint" in the name is completely broken — the "n" key opens a task modal mid-typing

**Fix:** Standard guard in all global keyboard listeners:
```js
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  // ... handle shortcut
});
```

---

## MEDIUM UX ISSUES

### UX-MED-01: "Available" Badge Contradicts "200% Load" on Same Card
**Priority: P2**
- Members view shows a green "Available" availability badge alongside a red "200% load" chip on the same member card
- Contradictory signals confuse managers trying to understand team capacity
- **Fix:** Derive availability display from workload percentage, not just leave/travel flags

### UX-MED-02: "Workspace Preferences" Label Doesn't Match Its Content
**Priority: P2**
- Clicking "Workspace Preferences" in settings shows the exact same content as "General" settings
- The misleading label breaks user trust in the settings navigation
- **Fix:** Either implement a distinct Workspace Preferences section or rename the nav item to match its actual content

### UX-MED-03: Settings Has No Addressable URL
**Priority: P2**
- Settings panel opens as an overlay inside `/dashboard` with no URL change
- Can't deep-link, bookmark, or share a link to a specific settings section
- Browser back button doesn't close settings or navigate settings history
- **Fix:** Route to `/settings/:section` and use React Router navigation within settings

### UX-MED-04: Session Expiry Drops User at Landing Page
**Priority: P2**
- Protected routes with expired session redirect to `/` (marketing landing page) instead of `/login?redirect=<path>`
- User loses their intended destination and has to re-navigate after login
- **Fix:** AuthGuard should redirect to `/login?redirect=${encodeURIComponent(location.pathname)}`

---

## LOW UX ISSUES

### UX-LOW-01: Calendar "Upcoming" Panel Excludes Today
**Priority: P3**
- Events created for today don't appear in the "Upcoming (14 Days)" sidebar panel
- Semantically today's events ARE upcoming
- **Fix:** Change date filter from `> today` to `>= today`

### UX-LOW-02: Stale Notification Badge on Empty Approvals Tab
**Priority: P3**
- The Approvals tab in Manager View shows an orange notification dot
- Clicking reveals "No pending approvals"
- **Fix:** Re-query or subscribe to approval count; clear badge when count = 0

---

## THINGS THAT WORK VERY WELL ✅

**Focus Mode (Pomodoro Timer)**
The "Enter Focus Mode" button in Summary view opens a clean 25-minute Pomodoro timer with the highest-priority task pre-loaded. Exactly the kind of opinionated productivity feature that differentiates Taskora.

**Global Search (Ctrl+K Command Palette)**
Polished implementation: instant results, keyboard navigation, shows tasks by name, provides quick actions (New Task, Keyboard Shortcuts) and view shortcuts. Comparable to Linear's command palette.

**AI Predictions (Burnout Heatmap)**
The 14-day workload prediction grid with color-coded overload warnings is genuinely useful for managers and visually distinctive.

**Manager View — Tab Architecture**
6 tabs (Overview, Workload & Capacity, Members, AI Predictions, Approvals, Collaboration, Channel) are logically organized and each tab loads purposefully with relevant data.

**Empty States**
All empty states have appropriate illustrations, descriptive text, and clear CTAs (Teams: "Create first team", Sprints: "Create first sprint"). No blank white screens.

**Dark Mode Toggle**
Instant, full-page dark mode switch from Settings → General. No flash, no lag.

**TaskDetailModal Auto-Save**
"Changes auto-saved" indicator in the modal footer gives users confidence that their changes aren't lost. Small but important trust signal.

---

## DESIGN SYSTEM CONSISTENCY

| Element | Consistency | Notes |
|---|---|---|
| Typography | ✅ Consistent | One font family throughout |
| Color system | ✅ Consistent | Purple primary, consistent status colors |
| Button styles | ✅ Consistent | Primary blue, secondary outlined |
| Card components | ✅ Consistent | Rounded corners, consistent shadows |
| Icon set | ✅ Consistent | One icon library throughout |
| Spacing | ✅ Consistent | Grid system applied uniformly |
| Empty states | ✅ Consistent | Illustration + text + CTA pattern |
| Loading states | ⚠️ Partial | Some views show spinner, some show text "Loading..." |
