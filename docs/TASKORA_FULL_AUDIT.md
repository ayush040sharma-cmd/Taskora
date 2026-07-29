# Taskora — Full Feature Audit (Ground Truth vs. Marketing)

Read-only diagnostic audit. Zero files modified (`git status` confirmed clean before/after — only a pre-existing, unrelated `.claude/settings.local.json` change was present, not touched by this audit).

---

## 1. Executive Summary

1. **AI is not machine learning.** Every "AI" feature (risk scoring, forecasting, simulation, smart assignment) is deterministic hand-written arithmetic/regex. `model_version` is a hardcoded string `"v1-rules"` and `ai_fallback: true` is set unconditionally — the code was scaffolded for a real ML path that was never built.
2. **Task dependencies have no creation UI.** The `task_dependencies` table, write API, and a genuinely well-built graph visualizer all exist — but there is zero UI to create a dependency. In real usage the table stays empty, so the dependency graph, "Blocked · N deps" badges, and the risk engine's dependency rule are cosmetic on real data.
3. **AI *is* paywalled behind Pro/Enterprise, contrary to any "AI must never be paywalled" principle.** `ai.js`'s `/analyze`, `/health`, `/alerts` endpoints require the Pro-tier `AI_REASONING` feature flag server-side — NOT SUPPORTED as a "free AI" claim.
4. **Two of five headline AI features have no reachable UI.** 14-Day Load Forecasting (`/api/capacity/predict/:wsId`) and a "Capacity Heatmap" have zero frontend callers/components — both are dead backend code from a user's perspective.
5. **Plan gating is real and server-side enforced** (this contradicts a stale internal memory note claiming gates were removed) — every Pro/Enterprise feature independently re-checks the plan in the backend, not just the UI.
6. **The Python `ai-agent/` service is a separate internal dev-ops tool, not a product feature.** It's a standalone FastAPI app with its own audit scheduler and Claude client that the frontend never calls — unrelated to the in-app "Jarvis" (which is `backend/routes/jarvis.js`, a regex intent engine with one narrow LLM fallback).
7. **No Projects entity exists.** The hierarchy is flatly Workspace → Task; "project limit" appears in pricing config with nothing in the DB to enforce or represent it.
8. **List view and Table view don't exist.** Only Board/Kanban, Calendar, Gantt (bars only, no dependency arrows), and Workload views are implemented.
9. **Collaboration is thinner than it looks.** No threading, no @mentions, no reactions, no real followers/watchers — all either absent or cosmetic UI wired to nothing. Two separate task-drawer UI paths (Manager Dashboard vs Task Detail Modal) hit different, partially broken comment/activity endpoints.
10. **SEO metadata is minimal and the title actively undercuts the product's positioning:** `<title>Taskora — Kanban Productivity Platform</title>`, no meta description, no Open Graph/Twitter tags.

---

## 2. Repo Orientation

### Directory structure
- `frontend/` — React (Vite) SPA. `src/pages/` (16 route-level pages), `src/components/` (~54 components), `src/api/api.js` (single Axios client), `src/context/`, `src/config/`, `src/utils/`.
- `backend/` — Node/Express + Socket.io API. `routes/` (33 route files), `services/` (8 files — `aiEngine.js`, `workloadEngine.js`, `agentRunner.js`, `notificationService.js`, `auditService.js`, `emailService.js`, `alertService.js`, `workloadLogger.js`), `middleware/` (7 files), `migrations/` (6 manual SQL files), 11 versioned `schema*.sql` files (cumulative, applied in order v1→v11) plus `schema-full.sql`/`schema.sql` as consolidated snapshots.
- `ai-agent/` — **Separate, standalone Python FastAPI service** ("Jarvis-like AI assistant" per its own docstring) with routers for audit/backlog/tasks/code/logs/chat/security, agents for deploy/orchestrator/qa/security, and services including a Claude client and GitHub client. Confirmed **not called by the frontend** (see Module M) — an internal dev-ops/audit tool for building Taskora itself, not a product feature.
- `productivity-platform/frontend/` — stray leftover directory containing only Vite's `.vite/deps` cache; not a working app.
- `frontend/src/src/` — nested duplicate from the original "KanFlow" template scaffold (pre-rename to Taskora); dead, unreferenced by the build.
- `BrandGuid_line/`, `files/`, `docs/` — brand assets and design-token/spec docs, not application code.

### Frontend route map (`frontend/src/App.jsx`)
| Path | Component | Access |
|---|---|---|
| `/` | `Home` | Public (redirects if logged in) |
| `/login`, `/register` | `Login`, `Register` | Public |
| `/auth/callback` | `AuthCallback` | Public (OAuth) |
| `/reset-password` | `ResetPassword` | Public |
| `/about`, `/contact`, `/privacy`, `/terms` | static pages | Public |
| `/pricing` | `Pricing` | Public |
| `/onboarding` | `WorkspaceSetup` | Protected |
| `/onboarding/role` | `RoleSelection` | Protected, pre-onboarding only |
| `/payment` | `Payment` | Auth required |
| `/join/:token` | `JoinWorkspace` | Public/auth hybrid |
| `/dashboard` | `Dashboard` (the entire app shell — all "views" are internal state switches, not routes) | Protected |
| `/unauthorized` | `Unauthorized` | — |
| `*` | redirect to `/` | — |

Everything inside the product (Board, Calendar, Gantt, Sprints, Analytics, Manager Dashboard, AI Risk Heatmap, Members, Capacity, Dependency Graph, etc.) is a `view` state inside `Dashboard.jsx`, not a distinct URL route.

### Backend API surface (method + path + handler; all mounted under `/api/*` in `backend/server.js:170-203`)
Full list of 33 route files and every endpoint (auth middleware and plan/role gates noted inline where present):

- **auth.js** (`/api/auth`): `GET /status`, `POST /register`, `POST /login`, `POST /refresh`, `POST /logout`, `PUT /profile`, `PUT /password`, `GET /me`, `GET /me/sidebar-views`, `PATCH /me`, `GET /onboarding`, `PUT /onboarding`, `GET /google/status`, `POST /forgot-password`, `POST /reset-password`, `POST /demo`
- **oauth.js** (`/api/auth`): `GET /google`, `GET /google/callback`
- **workspaces.js** (`/api/workspaces`): `GET /`, `POST /` (enforceLimit PROJECT_LIMIT), `GET /:id/summary`, `PUT /:id`, `DELETE /:id`
- **tasks.js** (`/api/tasks`): `GET /workspace/:id`, `GET /team-intel/:id`, `GET /:id`, `POST /` (enforceLimit TASK_LIMIT), `PUT /:id`, `DELETE /:id`, `GET /workspace/:id/graph`, `POST /:id/dependencies`, `DELETE /:id/dependencies/:depId`, `GET /workspace/:id/collaboration`, `GET /workspace/:id/blocked-analytics`
- **sprints.js** (`/api/sprints`, all `requireFeature(SPRINTS)`): `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, `GET /:id/burndown`
- **workload.js** (`/api/workload`): `GET /` (manager+), `GET /users` (no workspace check), `GET /slot/:userId` (no workspace check)
- **capacity.js** (`/api/capacity`): `GET /me`, `PUT /me`, `PUT /travel`, `PUT /leave`, `GET /team/:wsId`, `PUT /team/:wsId/:uid`, `GET /predict/:wsId` (14-day forecast — no frontend caller), `POST/GET /requests`, `PUT /requests/:id/approve`, `PUT /requests/:id/reject`
- **approvals.js** (`/api/approvals`): `POST /` (manager+), `GET /` (manager+), `GET /pending`, `PUT /:id/approve`, `PUT /:id/reject`
- **notifications.js** (`/api/notifications`): `GET /`, `GET /count`, `PATCH /:id/read`, `PATCH /read-all`
- **simulate.js** (`/api/simulate`): `POST /assign` (Enterprise), `GET /suggest/:wsId/:taskId` (Pro+)
- **audit.js** (`/api/audit`): `GET /`
- **members.js** (`/api/members`): `GET /`, `POST /` (enforceLimit MEMBER_LIMIT), `PUT /:userId`, `DELETE /:userId`, `POST /invite`, `GET /invite/:token`, `POST /invite/:token/accept`
- **comments.js** (`/api/comments`): `GET /:taskId`, `POST /:taskId`, `DELETE /:id`
- **subtasks.js** (`/api/subtasks`): `GET /:taskId`, `POST /:taskId`, `PUT /:id`, `PATCH /:id/toggle`, `DELETE /:id`, `PUT /:taskId/reorder`
- **effort.js** (`/api/effort`): `GET /:taskId`, `POST /`, `PUT /:id`, `DELETE /:id`, `GET /summary/:userId`
- **calendar.js** (`/api/calendar`): `GET /`, `GET /range`, `POST /`, `PUT /:id`, `DELETE /:id`
- **ai.js** (`/api/ai`): `POST /predict/:taskId` (open, no plan/workspace gate), `POST /analyze/:workspaceId` (manager+, AI_REASONING/Pro), `GET /health/:workspaceId` (manager+, Pro), `GET /alerts/:workspaceId` (manager+, Pro)
- **integrations.js** (`/api/integrations`): `GET /:wsId`, `PUT /:wsId/:type`, `DELETE /:wsId/:type`, `POST /:wsId/slack/test`, `POST /:wsId/notify/slack`, `POST /github/webhook` (unauthenticated, no signature check), `POST /:wsId/jira/import`, `GET /:wsId/events`
- **nlquery.js** (`/api/nlquery`): `POST /:workspaceId` (pure regex, "zero external dependencies" per its own docstring)
- **channels.js** (`/api/channels`): `GET /:wsId/messages`, `POST /:wsId/messages`
- **personal.js** (`/api/personal`): `GET /dashboard`
- **jarvis.js** (`/api/jarvis`, `requireFeature(JARVIS)`/Pro): `POST /command`
- **firewall.js** (`/api/firewall`): `GET /events`, `GET /stats`, `GET /blocked-ips`, `POST /block/:ip`, `POST /unblock/:ip`
- **admin.js** (`/api/admin`, super_boss only, **no frontend caller anywhere**): `GET /stats`, `GET /users`, `PUT /users/:id`, `POST /users/:id/reset-password`, `GET /boards`, `GET /boards/:id/tasks`, `DELETE /boards/:id`, `POST /notifications`
- **payments.js** (`/api/payments`): `GET /plans`, `POST /create-order`, `POST /verify`, `POST /mock-upgrade`
- **seed.js** (`/api/seed`, non-production only): `POST /demo` (plants hardcoded AI fields)
- **roles.js** (`/api/roles`, enterprise permission-gated): `GET /`, `GET /permissions/all`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `PUT /:id/permissions`, `POST /:id/clone`
- **user-management.js** (`/api/user-mgmt`, enterprise permission-gated): users/roles/departments/teams CRUD, `GET /audit`
- **approval-engine.js** (`/api/approvals-engine`): `POST /`, `GET /`, `GET /pending`, `GET /stats`, `PUT /:id/approve`, `PUT /:id/reject`, `PUT /:id/info`, `PUT /:id/cancel`, `POST /:id/escalate`
- **teams.js** (`/api/teams`): full CRUD + member management + `GET /workspace/:wsId/tasks`
- **import.js** (`/api/import`): `GET /template`, `POST /tasks/:wsId`, `POST /tasks/:wsId/confirm`, `GET /tasks/:wsId/export` (Pro), `POST /status/:wsId`, `GET /logs/:wsId`
- **analytics.js** (`/api/analytics`): `GET /:wsId`

Plus `GET /health`, `GET /sysinfo` (auth-only, no role check), and Socket.io on the same HTTP server with JWT-verified handshake.

### Database schema (cumulative through schema-v11.sql + enterprise-rbac.sql + migrations)
Core tables: `users`, `workspaces`, `tasks` (heavily extended — progress, type, estimated/actual hours, risk_score, delay_probability, confidence_score, ai_suggestion, sprint_id, team_id, blocked_* fields), `sprints`, `user_capacity`, `effort_logs`, `approvals`, `notifications`, `audit_logs`, `workspace_members`, `subtasks`, `calendar_events`, `task_dependencies`, `workload_logs`, `ai_predictions`, `workspace_integrations`, `integration_events`, `agent_runs`, `security_events`, `blocked_ips`, `teams`, `team_members`, `import_logs`, `capacity_requests` (migration), `workspace_invites`. Enterprise layer (`enterprise-rbac.sql`): `roles`, `permissions_catalog`, `role_permissions_map`, `user_roles`, `user_permission_overrides`, `org_teams`, `org_team_members`. No `projects`, `tags`, `attachments`, `description_history`, `reactions`, `watchers`/`followers`, or `checklists` table exists anywhere.

### Feature flags / plan gating
`backend/config/licensing.js` `PLAN_FEATURES` matrix (FREE/PRO/ENTERPRISE), enforced via `backend/middleware/planEnforce.js`'s `requireFeature()`/`enforceLimit()`, applied directly on routes (see Module I). Mirrored client-side in `frontend/src/config/features.js` + `frontend/src/utils/canAccess.js` for UI-only cosmetic gating — but every gate has an independent server-side check.

### AI/LLM call sites
- `backend/routes/jarvis.js:788-799` — the **only** LLM call in the product. Model: `claude-haiku-4-5-20251001`. Trigger: only when Jarvis's 15 regex intents all miss (free-text fallback), 3-second timeout, then falls back to keyword search.
- Everything else labeled "AI" (`aiEngine.js`, `workloadEngine.js`, `nlquery.js`) is deterministic rules/arithmetic/regex — zero external model calls.
- `ai-agent/` (Python) uses a Claude client (`ai-agent/services/claude_client.py`) for its own internal audit/backlog tooling — not reachable from the product.

---

## 3. Feature Inventory (Module A–M)

*(Each module below was traced end-to-end UI→API→DB by direct code reading; file:line citations included per item.)*

### A. TASKS — CORE

Taskora's task model is solid on the core CRUD/fields/dependency side but several marketed-sounding features are UI stubs or entirely absent. Recurrence is still visibly disabled ("COMING SOON"/"SOON" badges) exactly as the prior audit found. There is no task attachment system, no tags, no human-readable task key, no real milestone entity, no task templates, and no description version history or sharing/public links; "auto-archive" is a localStorage-only setting with zero backend effect.

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| Task CRUD — create | ✅ EXISTS — WORKING | UI: `frontend/src/components/CreateTaskModal.jsx:104-129`; API: `backend/routes/tasks.js:146-229` (POST `/api/tasks`); DB: `backend/schema.sql:19-30` `tasks` table | Fully wired, emits socket event, notifies assignee. |
| Task CRUD — read | ✅ EXISTS — WORKING | API: `backend/routes/tasks.js:18-56` (list), `:125-143` (single); DB: `tasks` table | |
| Task CRUD — update | ✅ EXISTS — WORKING | UI: `frontend/src/components/TaskDetailModal.jsx:328-350` (`saveField`); API: `backend/routes/tasks.js:232-347` (PUT, dynamic allow-list) | Inline auto-save on every field. |
| Task CRUD — delete | ✅ EXISTS — WORKING | UI: `frontend/src/components/TaskCard.jsx:133-148,274-281`; API: `backend/routes/tasks.js:350-383` (DELETE, hard delete) | Hard delete only, no soft-delete/undo. |
| Task CRUD — archive | ❌ ABSENT | UI: `frontend/src/pages/SettingsPage.jsx:343,351,398` ("Auto-archive done tasks") | Setting is written only to `localStorage`; never read anywhere else in the codebase and no `archived`/`is_archived` column exists on `tasks`. Purely cosmetic. |
| Field: title | ✅ EXISTS — WORKING | UI: `CreateTaskModal.jsx:144-148`, `TaskDetailModal.jsx:431-444`; DB: `backend/schema.sql:21` `title VARCHAR(500)` | |
| Field: description | 🟡 EXISTS — PARTIAL | UI: `CreateTaskModal.jsx:151-155`, `TaskDetailModal.jsx:469-491`; DB: `backend/schema.sql:22` `description TEXT` | Plain `<textarea>`, not rich text — no editor lib in `frontend/package.json`. |
| Field: status | ✅ EXISTS — WORKING | UI: `TaskDetailModal.jsx:22-28,537-544`; DB: CHECK widened in `backend/schema-v8.sql:11-13` | |
| Field: priority | ✅ EXISTS — WORKING | UI: `TaskDetailModal.jsx:547-560`; DB: `backend/schema.sql:24` CHECK (low/medium/high) | |
| Field: type | ✅ EXISTS — WORKING | UI: `TaskDetailModal.jsx:562-574`; DB: `backend/schema-v8.sql:6-8` CHECK constraint | See "custom task types" row — fixed enum, not custom. |
| Field: assignee | ✅ EXISTS — WORKING (single only) | UI: `TaskDetailModal.jsx:375-386`; API `backend/routes/tasks.js:250-254`; DB: `backend/schema-v2.sql:10` `assigned_user_id` | See row below. |
| Field: start date | ✅ EXISTS — WORKING | UI: `TaskDetailModal.jsx:610-617`; DB: `schema-v2.sql:11`/`schema-v3.sql:32` `start_date` | |
| Field: due date | ✅ EXISTS — WORKING | UI: `TaskDetailModal.jsx:618-625`; DB: `backend/schema.sql:25` `due_date` | |
| Field: estimated hours | ✅ EXISTS — WORKING | UI: `TaskDetailModal.jsx:514-524`; DB: `schema-v3.sql:30`/`schema-v4.sql:38` `estimated_hours` | |
| Field: actual hours | 🟡 EXISTS — PARTIAL | UI: `TaskDetailModal.jsx:525-528` (read-only display); DB: `schema-v3.sql:31` `actual_hours` | Not directly editable in task modal — populated indirectly via Effort Log tab (`backend/routes/effort.js`). |
| Field: progress % | ✅ EXISTS — WORKING | UI: `TaskDetailModal.jsx:494-511` (slider); DB: `schema-v2.sql:5-6` CHECK 0-100 | |
| Field: tags | ❌ ABSENT | Searched all schema files, `tasks.js`, all task components — no `tags` column or UI control | Not a feature anywhere in the tasks domain. |
| Multiple assignees vs single | 🟡 EXISTS — PARTIAL (single only) | DB: `schema.sql:27` `assignee_id` (dead v1 column, unused) vs `schema-v2.sql:10` `assigned_user_id` (live column, confirmed via `tasks.js:45,89,103,133`) | Two assignee columns exist historically; only one is live. No join table for multiple assignees. |
| Task ID / human-readable key (TSK-123) | ❌ ABSENT | Checked all schema files (only `id SERIAL`), `TaskCard.jsx`, `TaskDetailModal.jsx` | Only raw numeric `id`, never surfaced as a friendly key. |
| Milestones | ❌ ABSENT (as a task feature) | `schema-v4.sql:19-33` `calendar_events.type` enum includes string `'milestone'`; only referenced in `CalendarView.jsx` | Just one calendar-event type label, not a dedicated milestone entity tied to tasks/phases. |
| Task detail view — full enumeration | ✅ EXISTS — WORKING | `frontend/src/components/TaskDetailModal.jsx:1-815` | Renders: title, description, progress slider, est./actual hours, status, priority, type, assignee search, start/due date, est. days, recurrence (disabled), team select, blocked-workflow fields (conditional), timestamps, tabs for Subtasks / Effort Log / Comments. |
| Description version/edit history | ❌ ABSENT | No `description_history` table in any schema; `TaskDetailModal.jsx:358-361` `saveDesc` overwrites in place | `audit_logs` records renames/status/assignment only, not description diffs (`tasks.js:333-340`). |
| Attachments | ❌ ABSENT | No "attachment" hits in any `backend/routes/*.js` or frontend; `multer` only used in `backend/routes/import.js` for XLSX import | No upload endpoint/storage backend for task files. |
| Bulk actions | 🟡 EXISTS — PARTIAL | UI: `ManagerDashboard.jsx:290,294,648-665` (checkbox select + bulk priority/done/blocked/reassign, looping PUT calls) | Functional but confined to the Manager Dashboard drill-down list — the primary `KanbanBoard.jsx` has no bulk-select at all. |
| Task templates | ❌ ABSENT | `schema-v11.sql:68` `workspaces.template` is a **workspace** template picked in `WorkspaceModal.jsx:6-107` (industry presets for new workspace); `ImportWizard.jsx` "Download Template" is an XLSX column-header template for import | Neither is a reusable task template. No such feature exists. |
| Recurring tasks | 🟡 EXISTS — PARTIAL (disabled stub, unchanged from prior audit) | DB: `schema-v4.sql:40-41` `tasks.recurrence`; API pass-through `tasks.js:150,195,253`; UI: `CreateTaskModal.jsx:324-340` and `TaskDetailModal.jsx:640-656` both render a **disabled** `<select>` labeled "COMING SOON"/"SOON" | No recurrence engine exists anywhere in `backend/services/` (no auto-spawn cron). Confirms this is still fake, same as the 2026-06 audit found. |
| Custom task types | ❌ ABSENT (fixed enum) | DB: `schema-v8.sql:6-8` CHECK of 10 fixed values; UI: `CreateTaskModal.jsx:7-16`/`TaskDetailModal.jsx:10-19` hardcoded `TYPE_META` exposing only 8 of the 10 | Fixed, DB-enforced enum; not user-definable. UI doesn't even expose all DB-allowed values. |
| Task sharing / public links | ❌ ABSENT | No share/public-link/token pattern scoped to tasks anywhere in backend or frontend | Not implemented. |

**Cross-reference for Module E:** `workloadEngine.js` treats task `type` via a hardcoded `TASK_HOURS` table (task/bug/story/rfp/proposal/presentation/upgrade/poc + legacy fallbacks) used to estimate hours when `estimated_hours` is blank — this is the same fixed-enum type system, confirming type is not extensible anywhere in the stack.

### B. TASK RELATIONSHIPS — HIGHEST PRIORITY, VERIFIED END-TO-END

**Headline finding: task dependencies exist as a DB table and a read-only API/UI, but there is no way for a real user to ever create one. In production use, `task_dependencies` will always be empty, so the dependency graph, "Blocked · N deps" badges, and the risk/blocking analytics that key off it are cosmetic on real data — they only "work" if you write rows directly via `POST /api/tasks/:id/dependencies` (e.g. curl/seed script), which no UI exposes.**

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| Dependencies — DB schema | ✅ EXISTS — WORKING | `backend/schema-v5.sql:238-248` `task_dependencies` table (`task_id`, `depends_on_task_id`, `dependency_type` default `finish_to_start`, unique pair, self-reference check) | Real table, indexed (`idx_task_deps_task`, `idx_task_deps_depends`). Only one type is ever set (`finish_to_start`); `dependency_type` is never written as anything else — see below. |
| Dependencies — write API | 🟡 EXISTS — PARTIAL (API only, no caller) | `backend/routes/tasks.js:428-455` `POST /api/tasks/:id/dependencies`; `backend/routes/tasks.js:458-479` `DELETE /api/tasks/:id/dependencies/:depId` | Both endpoints are fully implemented (auth-checked, self-dependency blocked, `ON CONFLICT DO NOTHING`). **Grepped the entire `frontend/src` for any call to these routes (`/dependencies`, `depends_on_task_id`, `addDependency`) — zero matches.** No component ever calls them. |
| Dependencies — read API | ✅ EXISTS — WORKING | `backend/routes/tasks.js:387-425` `GET /api/tasks/workspace/:workspaceId/graph` returns `{nodes, edges}`; also inlined as `blocking_dep_count` subquery in `tasks.js:40-43` (workspace list) and `tasks.js:99-101` (team-intel) | Correctly computes count of non-done dependency tasks. This part is real and queries live data — it's just that live data for `task_dependencies` will be empty absent manual API calls. |
| Dependencies — visualization UI | ✅ EXISTS — WORKING (display only) | `frontend/src/components/DependencyGraph.jsx:159-352` — topological-sort layered layout, SVG nodes/edges, pan, click-for-detail panel showing each dependency's status | Genuinely a real, well-built graph renderer, reachable from Dashboard. Its own empty state literally says "Create tasks and link dependencies to see the graph" (`DependencyGraph.jsx:255-256`) — but no such "link" affordance exists anywhere in the product. |
| Dependencies — creation UI | ❌ ABSENT | Searched `TaskDetailModal.jsx`, `CreateTaskModal.jsx`, `KanbanBoard.jsx`, `DependencyGraph.jsx` for "dependenc" (case-insensitive) — no matches outside the graph viewer/badge code | There is no dropdown/picker/button anywhere to say "this task depends on that task." The only place a user sees dependencies is the blocked badge (`TaskCard.jsx:198,230-237`, driven by `blocking_dep_count`) and the graph — both read-only. |
| Dependencies — enforcement | ❌ ABSENT | `backend/routes/tasks.js:232-347` `PUT /api/tasks/:id` — the `ALLOWED` field list and status-transition logic never checks `blocking_dep_count` or queries `task_dependencies` before permitting a status change to `done` | A task can be dragged/set to "done" via the Kanban board or detail modal even while `blocking_dep_count > 0`. Dependencies are purely decorative even in the hypothetical case where some exist — they don't block anything. |
| Dependency types (blocks / waiting-on / linked) | ❌ ABSENT (only one type modeled) | `dependency_type VARCHAR(20) DEFAULT 'finish_to_start'` (`schema-v5.sql:242`); `POST /dependencies` never accepts/sets `dependency_type` (`tasks.js:428-450`) | Column exists for future extensibility but only one dependency semantics (finish-to-start) is ever produced, and since nothing writes rows at all in practice, this is moot. |
| Blocked workflow (separate system from dependencies) | 🟡 EXISTS — PARTIAL | Columns: `blocked_by_task_id`, `blocked_reason`, `blocked_severity`, `blocked_expected_resolution`, `date_blocked`, `unblocked_at` (`schema-v11.sql:41-46`); settable via `PUT /api/tasks/:id` `ALLOWED` list (`tasks.js:255-257`); UI at `TaskDetailModal.jsx:673-710` | UI exposes **only** `blocked_reason` (free-text) and `blocked_severity` (dropdown) and expected-resolution date. `blocked_by_task_id` (the actual link to "which task is blocking this one") has a DB column and is accepted by the PUT endpoint, but **no UI element sets it** — grepped `TaskDetailModal.jsx` for `blocked_by_task_id`, zero matches. So `blocked-analytics`'s `blocked_by_task_title` join (`tasks.js:560-568`) will be null for every real user-created block. Status is set to `blocked` via a plain status dropdown/drag, independent of any real blocking task. |
| Subtasks | 🟡 EXISTS — PARTIAL (flat, no independent status/assignee) | Table: `subtasks(id, task_id, title, done, position, created_by, created_at)` (`schema-v4.sql:186-195`, boolean `done` only — **no `status` column**, **no `assignee` column**); full CRUD in `backend/routes/subtasks.js:38-208`; UI presumably in `TaskDetailModal.jsx` | Single level of nesting (a subtask cannot itself have subtasks — no `parent_subtask_id`). Each subtask is a title + boolean done, not an independently-assignable/status-tracked mini-task. `POST /api/subtasks/:taskId` (`subtasks.js:59-127`) accepts `assigned_to` in the request body **only to pick a notification recipient** — it is never written to the `subtasks` table (no such column exists), so "subtask assignee" is not actually persisted anywhere; refresh the page and that information is gone. |
| Checklists (distinct from subtasks) | ❌ ABSENT | Grepped whole repo case-insensitively for "checklist" — only hit is `frontend/src/components/onboarding/OnboardingChecklist.jsx`, which is the new-user product-onboarding checklist (unrelated to tasks), plus doc/audit files | No task-level checklist concept distinct from subtasks exists. |
| Linked/related tasks (non-dependency association) | ❌ ABSENT | Grepped backend for `related_task`, `linked_task`, `link_task` — no matches | No "relates to" / "duplicate of" style task linking exists at all. |

**Answering the prompt's explicit critical question: dependencies as a *user-facing, working* feature do NOT exist.** The data model, the read APIs, and a genuinely well-built graph visualization all exist — but the write path (creating a dependency) has zero UI, and even if a dependency were created via direct API call, it is not enforced (doesn't block status transitions). This should be treated as one of the single most important findings in the whole audit — see Module E for the cross-reference into the risk-scoring algorithm, which also depends on this same starved data.

### C. COLLABORATION

Comments are a flat list with no threading support, and posting one never notifies anyone (no @mention parsing, no assignee ping). "Followers," "@mentions," and emoji "reactions" all exist as UI chrome inside the team chat (`ChannelView.jsx`) but are cosmetic — they read from in-memory arrays or the plain workspace-member list, never write to a dedicated table, and never fire a notification. The workspace-level activity timeline is real and wired end-to-end, but the identical-looking "Activity" tab inside the Manager Dashboard's per-task drawer is broken because it calls the audit API with the wrong query parameter. In-app notifications work and are pushed live over Socket.io, but only for task/subtask assignment, capacity/leave requests, and the approval workflow — not for comments, mentions, or due dates, even though the bell UI has icons pre-built for `mention` and `task_due_soon` types that no backend code ever emits.

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| Comments (threaded vs flat) | 🟡 EXISTS — PARTIAL | API: `backend/routes/comments.js:29-92`; UI: `TaskDetailModal.jsx:318,392,402` | Flat only — no `parent_comment_id` anywhere. `task_comments` table has no `CREATE TABLE` statement in any repo SQL file (only referenced in route/seed code) — live-DB schema unverifiable from source. |
| Comments — second, broken UI path | 🟡 EXISTS — PARTIAL (bug) | `ManagerDashboard.jsx:1143-1144,1181` calls `/tasks/${task.id}/comments` | That route doesn't exist (backend only mounts `/api/comments/:taskId`). 404s silently (empty `catch{}`) — Manager Dashboard's Task Intel Drawer comment tab never loads/saves, while `TaskDetailModal.jsx`'s correct path works fine. |
| @mentions — parsing, storage, notification | ❌ ABSENT | UI-only: `ChannelView.jsx:485-499,686-729` (chat `@` autocomplete inserts plain text) | No backend mention parsing/storage. `notify()`/`notifyOne()` call sites never include a `mention` type, despite `NotificationCenter.jsx:13` having a pre-wired `mention` icon. |
| Assigned comments (comment → action item) | ❌ ABSENT | No such concept anywhere in comments.js/tasks.js/subtasks.js | Not implemented. |
| Reactions (emoji on comments/tasks) | ❌ ABSENT | Only hit: `ChannelView.jsx:8,503-504,700-704` | Emoji picker inserts a character into composed chat text — not a reaction/like on an existing comment/task. No `reaction(s)` table or route. |
| Followers/watchers (distinct from assignee) | ❌ ABSENT (relabeled member list) | `ChannelView.jsx:16,278-317` fetches `/workload/users`, labels panel "👥 Followers" | No `watcher`/`follower`/`subscribe` table/column/route anywhere in backend. Shows all workspace members regardless of actual follow relationship. |
| Activity timeline / audit log — workspace level | ✅ EXISTS — WORKING | DB: `audit_logs` (`schema-full.sql:144-155`); API: `audit.js:11-29`; write: `auditService.js:9-30`; UI: `ActivityFeed.jsx:100,115` at `Dashboard.jsx:831`, also `ManagerDashboard.jsx:239,1451`, `CommandCenter.jsx:146` | Correctly filters by workspace, genuinely displayed. |
| Activity timeline — per-task drawer | 🟡 EXISTS — PARTIAL (bug) | `ManagerDashboard.jsx:1147-1148` calls `/audit?task_id=${task.id}` | `audit.js:12-13` requires `workspace_id` and 400s otherwise — no `target_id`/`task_id` filter exists in the query at all. Call always fails, swallowed by `catch{}` — tab permanently shows "No activity recorded" even though matching rows exist. |
| Notifications — in-app (bell) | ✅ EXISTS — WORKING | API: `notifications.js:15-66`; service: `notificationService.js:12-50` (DB insert + Socket.io push to `user:${id}`); UI: `NotificationCenter.jsx:34-60` | Real-time via socket, polling fallback via GET. |
| Notifications — email | 🟡 EXISTS — PARTIAL (scope-limited) | `emailService.js:64-87` — real Resend integration (not stubbed) | Only wired to invite/workspace-added/password-reset. Never called from `notificationService.js` — task assignment/approval/capacity notifications are in-app+socket only, never emailed. |
| Notification trigger enumeration | ✅ EXISTS — WORKING | `tasks.js:207,318`; `subtasks.js:95`; `approval-engine.js:99,240,273,300,349`; `approvals.js:44,150,153,197`; `capacity.js:354,433,465` | Task assignment (create+reassign), subtask assignment, approval request/approve/reject/escalate/info-needed, capacity/leave submit/approve/reject. No triggers for comments, mentions, or due-date reminders despite UI type configs existing for them. |

### D. VIEWS

Taskora's sidebar (`frontend/src/components/Sidebar.jsx:8-45`) exposes exactly five workspace-level "views" plus a handful of team/AI panels; the actual `view` switch lives in `frontend/src/pages/Dashboard.jsx:606-934`. There is no List view and no Table view anywhere in the codebase. The Gantt chart renders bars only — it never queries or draws `task_dependencies`; a separate, unrelated "Dependency Graph" view does draw dependency arrows but has no dates/timeline. No view state (selected view, filters, group-by) is persisted server-side or in `localStorage` — `useState("board")` in `Dashboard.jsx:206` resets on every reload, and there is no `user_views`/`saved_view` table in any schema file.

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| Board/Kanban view | ✅ EXISTS — WORKING | UI: `Dashboard.jsx:625-669`, `KanbanBoard.jsx:13-80`; API: `PUT /tasks/:id`; DB: `tasks.status` | Fixed status columns, drag-drop via `@hello-pangea/dnd`. Filtering via `FilterBar.jsx`, but no sort control and grouping is hardcoded to status. |
| List view | ❌ ABSENT | No list-view component or nav item exists anywhere. |
| Calendar view | ✅ EXISTS — WORKING | UI: `CalendarView.jsx:1-60`, wired at `Dashboard.jsx:687-697`; API: `backend/routes/calendar.js`; DB: `calendar_events` | Event-type coloring, click-to-create; no saved views. |
| Gantt/Timeline view | 🟡 EXISTS — PARTIAL | UI: `GanttChart.jsx:1-349`, wired at `Dashboard.jsx:804-812` | Renders bars grouped by status/priority/assignee with today-line and progress overlay, but **never queries or renders `task_dependencies`** — no relationship arrows despite the table existing. Dependency arrows exist only in the separate "Dependency Graph" view, which has no dates/timeline. |
| Table view | ❌ ABSENT | No spreadsheet/table task view exists. |
| Workload view | ✅ EXISTS — WORKING | UI: `WorkloadDashboard.jsx:1-30`, wired at `Dashboard.jsx:843-852`; API: `GET /api/workload`; DB: `workload_logs`, `user_capacity` | Read-only capacity/load dashboard; falls back to a client-side "synthetic" estimate when the API returns empty (`:36-50`). |
| Saved views / per-user view persistence | ❌ ABSENT | `Dashboard.jsx:206` resets on load; no `saved_view`/`user_views`/`view_state` anywhere | View selection and filters reset on every page load. |

### E. AI / EXECUTION INTELLIGENCE — audited with maximum skepticism

**Top-line finding: every "AI" feature in Taskora is deterministic hand-written arithmetic/regex — not a trained model and not (with one narrow exception) an LLM call.** `aiEngine.js` and `workloadEngine.js` are plain rule engines; `model_version` is hardcoded to the literal string `"v1-rules"` and every prediction carries `ai_fallback: true` unconditionally (`aiEngine.js:196-197`) — meaning the code's own data model was designed with a real-ML-model path in mind that was never built; today the "fallback" IS the only path. The single genuine LLM call in the whole product is a 3-second-timeout Claude Haiku fallback buried inside Jarvis's free-text search intent (`jarvis.js:788-799`) — everything else is regex/SQL.

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| **AI Risk Scoring** | 🟡 EXISTS — WORKING but NOT "AI" | Algorithm: `backend/services/aiEngine.js:81-199` `calculateRiskScore()`; API: `POST /api/ai/predict/:taskId`, `POST /api/ai/analyze/:workspaceId` (`backend/routes/ai.js:22-111,113-195`); DB: `tasks.risk_score`/`delay_probability`/`confidence_score`, `ai_predictions` table (`schema-v5.sql:230-286`) | It is a **hand-coded 11-rule point-additive heuristic** (overdue → +40, due-soon-low-progress → +35, overloaded assignee → +25/+12, on-leave → +30, blocking deps → up to +40, high-effort+short-runway → +15, stale → +10, high-priority-not-started → +10, weekend-due → +5, travel-mode → +8), capped at 100. Not a trained model, not an LLM call — `model_version: "v1-rules"` is a literal constant, `ai_fallback: true` always. `delay_probability` is `score/100 * 0.95`, a pure linear transform, not a separately-modeled probability. **Real, deterministic, and does use live task data (due date, progress, priority, assignee load) — but calling it "AI" is a stretch; it's an if/else scoring rubric.** It DOES include blocking-dependency count as an input (Rule 6) — but per Module B, dependencies are never created by any UI, so this rule can never fire on real user data, only on directly-API-injected or seed-planted dependency rows. |
| **14-Day Load Forecasting** | 🟡 EXISTS — PARTIAL (engine real, but effectively unreachable in the UI) | Algorithm: `backend/services/workloadEngine.js:420-449` `predictFutureLoad()`; API: `GET /api/capacity/predict/:wsId` (`backend/routes/capacity.js:266-305`) | **Not a forecast of future work arriving** — it is a deterministic "drain simulation": takes the user's *current* total remaining hours and spreads them evenly across the next 14 working days at their daily capacity, flagging days ≥90% as high-risk and ≥5 such days as "burnout risk." It projects today's backlog forward; it does not predict new tasks, seasonality, or anything genuinely uncertain. Grepped the entire frontend for any caller of `/capacity/predict` — **zero matches**. The 14-day forecast engine has no dedicated UI screen at all; the only place `predictFutureLoad()` is reachable from a user action is indirectly, embedded inside the What-If Simulation response (`simulate.js:57` `prediction_after_assign`). As a standalone "14-Day Load Forecasting" feature, it is built on the backend and dead on the frontend. |
| **What-If Simulation Engine** | ✅ EXISTS — WORKING (deterministic arithmetic, not Monte-Carlo/probabilistic) | Algorithm: `workloadEngine.js:326-364` `simulateAssignment()`; API: `POST /api/simulate/assign` (`simulate.js:19-69`), gated Enterprise-only (`requireFeature(FEATURES.SIMULATION)`) | Computes `before`/`after` hours+percent-of-capacity for one candidate assignment, a `feasible` boolean (from `checkAssignment` — leave/type-limit/over-capacity rules), and a 3-bucket `delayRisk` (low/medium/high from a fixed 70%/90% threshold). This is real and correctly wired end-to-end (UI → API → DB task/user_capacity rows), and does produce different, meaningful output per input — but it's a single deterministic "what happens if I assign this" calculation, not a simulation with multiple scenarios/variance/Monte-Carlo sampling that the term "simulation" implies. |
| **Capacity Heatmap** | ❌ ABSENT as a distinct visual feature | Backend capacity data exists (`user_capacity` table, `capacity.js` `/team/:wsId`, `/predict/:wsId`); frontend consumers: `MembersPanel.jsx:358`, `ManagerDashboard.jsx:1986` | Grepped all of `frontend/src/components` for "heatmap" — the only match is `AIRiskHeatmap.jsx`, which visualizes **per-task risk score**, not per-person capacity over time. There is no grid/matrix component of people × days/weeks showing load intensity anywhere in the codebase. `MembersPanel`/`ManagerDashboard` show current-moment load percentage per member as badges/bars, not a heatmap. The per-person capacity number itself comes from `user_capacity.daily_hours`, user-configurable (default 8h) via `CapacityPanel.jsx`, not hardcoded — but the "heatmap" visualization the marketing term implies does not exist. |
| **Smart Assignment Suggestions** | ✅ EXISTS — WORKING (simple deterministic ranking, not ML) | Algorithm: `simulate.js:73-140` `GET /api/simulate/suggest/:wsId/:taskId`; ranking: `workloadEngine.js` `checkAssignment()` + `buildUserSummary()` | Ranks all workspace members by: feasible-candidates first (not on leave, under type-limit, under capacity), then ascending `load_pct` among feasible ones (`simulate.js:130-133`). This is a legitimate, real, live-computed ranking — but it is a two-key sort on a capacity percentage, not a learned or multi-factor scoring model (doesn't weight skill match, past performance, task-type affinity, etc.). Gated Pro+ (`FEATURES.SMART_ASSIGNMENT`). |
| **Jarvis — regex/intent fast-path** | ✅ EXISTS — WORKING | `backend/routes/jarvis.js:26-109` `detectIntent()` | 15 hand-written regex intents: `mark_done`, `set_status`, `create_task`, `assign_task`, `set_priority`, `set_due_date`, `delete_task`, `my_tasks`, `overdue`, `summary`, `high_priority`, `due_today`, `due_this_week`, `high_risk`, `blocked`, `unassigned`, falling back to `search`. All genuinely wired to real SQL reads/writes with socket broadcast + audit logging. |
| **Jarvis — LLM fallback** | 🟡 EXISTS — PARTIAL (narrow scope) | `jarvis.js:779-864` | Only triggers inside the catch-all `search` branch (i.e., only when none of the 15 regex intents matched) — calls `claude-haiku-4-5-20251001` with a 3-second race-timeout, asking it to re-classify intent or clean up a search term. **This is the only real LLM call found anywhere in the customer-facing product.** A second, separate rule-based NL engine, `backend/routes/nlquery.js` (used by a different UI entry point — the in-app "ask a question" search, distinct from voice/chat Jarvis), explicitly documents itself as "rule-based, zero external dependencies" (`nlquery.js:2`) and contains no LLM call at all — confirming most of what reads as "AI understanding" in the product is regex pattern matching, not language understanding. |
| **Jarvis — confirmation gate before destructive actions** | 🟡 EXISTS — PARTIAL (does not always block) | `jarvis.js:342-361` `fuzzyConfirmReply()`/`ambiguousReply()`; gate logic at `:505-506` (mark_done), `:533-534` (set_status), `:567-571` (assign_task), `:625-626` (delete_task) | A confirmation step ("say yes to delete it") is only inserted when the task-title match is a **fuzzy** (partial-substring) match. If the spoken/typed title is an **exact** or **prefix** match against a real task title, the action (including `delete_task`, a hard DB delete with no undo) executes **immediately with no confirmation**, in the very first request. So the gate is real but only covers the ambiguous case — a user who says "delete task Fix login bug" and there happens to be a task titled exactly "Fix login bug" gets it deleted instantly, no confirmation. |
| **AI features — real data vs. seeded** | See Section 4 (Demo Data) for full detail | — | Cross-reference: risk scoring/forecast/simulation/capacity all compute live off real task/capacity rows and degrade gracefully (never null/error) on an empty workspace. The one place seed data fakes the AI's output is the demo-seed endpoint (`routes/seed.js`) hardcoding `risk_score`/`delay_probability`/`ai_suggestion`/`confidence_score: 0.85` directly into planted tasks, which the Kanban board (`TaskCard.jsx`) then displays without ever calling the live engine. |

**Cross-cutting conclusion for Module E:** the compute layer (rules + arithmetic) is real, live, and reasonably well-engineered — it is not vaporware. But (a) it is deterministic heuristics, not machine learning or (mostly) LLM-based "AI" as the term is normally understood in this product category; (b) the risk model's one link to the product's flagship "dependency risk" narrative (Rule 6) is starved of real data because dependencies have no creation UI (Module B); and (c) two of the five headline AI capabilities in the marketing list — 14-Day Load Forecasting and Capacity Heatmap — have no reachable, dedicated UI surface at all despite working backend code.

### F. PROJECTS / SPRINTS / HIERARCHY

There is no `projects` table or `Project` entity anywhere in the schema (grep across all schema files returns zero matches). The real hierarchy is **Workspace → Task**, with Sprint as an optional grouping layer under a Workspace (`tasks.sprint_id` FK). A single workspace has exactly one Kanban board (columns hardcoded) — no boards table, no multi-board support. Sprints have real CRUD + a genuine burndown endpoint, but there is no story-points concept anywhere, and the "Velocity" label in the Sprint burndown tab is actually just percent-complete, not true velocity (a separate, better velocity chart exists in Analytics).

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| Projects entity | ❌ ABSENT | No `CREATE TABLE projects` in any schema file; `backend/config/licensing.js:61` (`PROJECT_LIMIT`) references "projects" in plan config text only, nothing backs it in the DB | Pricing config talks about a "project limit" per plan with no Project table to enforce/represent it — a dangling concept. |
| Hierarchy: Workspace → Task | ✅ EXISTS — WORKING | DB: `tasks.workspace_id` FK; API: `GET /tasks/workspace/:id`; UI: `Dashboard.jsx:270-278` | No intermediate Project layer. |
| Sprints (CRUD) | ✅ EXISTS — WORKING | UI: `SprintView.jsx:23-218`; API: `backend/routes/sprints.js:8-111`; DB: `sprints` (`schema-v2.sql:48-58`) | Gated behind `requireFeature(FEATURES.SPRINTS)`. |
| Sprint points / story points | ❌ ABSENT | No `points`/`story_point` column anywhere | Not implemented. |
| Burndown chart | ✅ EXISTS — WORKING | API: `GET /sprints/:id/burndown` (`sprints.js:114-156`, real day-by-day query against `tasks.completed_at`); UI: `BurndownChart.jsx` | Real ideal-vs-actual burndown. The "Velocity" stat next to it is mislabeled — it's `doneTasks/totalTasks` percent complete. |
| Velocity tracking/chart | ✅ EXISTS — WORKING | UI: `AnalyticsDashboard.jsx:37-78,152-160` (planned vs completed bars, computed client-side from `sprints`+`tasks.sprint_id`) | Real planned-vs-completed-per-sprint chart, distinct from the mislabeled Sprint-view stat. |
| Multiple boards per workspace | ❌ ABSENT | `KanbanBoard.jsx:5-11` hardcodes one column set per workspace; no `boards` table | One workspace = one board. |

### G. DASHBOARD / ANALYTICS

Taskora has three dashboard surfaces: Summary (personal/today), Analytics (workspace KPIs/velocity/throughput), and Manager Dashboard (team-wide/approvals/capacity). All widgets checked trace to real parameterized SQL aggregates rather than mock/hardcoded data — the only "synthetic" fallback found is in `WorkloadDashboard.jsx` when the workload API returns empty. Most of the dashboard is historical/current-state; two genuinely forward-looking elements exist: Personal dashboard's simple heuristic `tomorrow_load_pct`, and the AI Risk Heatmap view surfacing per-task `delay_probability`/`risk_score` predictions.

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| Summary Dashboard | ✅ EXISTS — WORKING | UI: `SummaryDashboard.jsx:67-100+`; API: `GET /personal/dashboard` (`personal.js:177-366`); DB: `tasks`, `user_capacity` | Real SQL-driven; risk detection/day-plan are server-side JS heuristics from real task rows (`personal.js:64-173`). |
| Analytics — KPI cards | ✅ EXISTS — WORKING | UI: `AnalyticsDashboard.jsx:132-164`; API: `GET /analytics/:wsId` (`analytics.js:25-37`) | Single real aggregate SQL query, workspace-scoped. |
| Analytics — Throughput chart | ✅ EXISTS — WORKING | `analytics.js:49-68` (`generate_series` + `LEFT JOIN tasks`) | Real weekly aggregate. |
| Analytics — Priority/Type distribution | ✅ EXISTS — WORKING | `analytics.js:71-84` | Real `GROUP BY` queries. |
| Analytics — 7-day completion trend | ✅ EXISTS — WORKING | `analytics.js:88-112` | Real, via correlated subqueries per day. |
| Analytics — Velocity chart | ✅ EXISTS — WORKING | `AnalyticsDashboard.jsx:37-78,152-160` | Real, client-side join of live data. |
| Manager Dashboard | ✅ EXISTS — WORKING | `ManagerDashboard.jsx` (lines 63-64,239,308,1451,1986,1998); API: approvals/capacity-requests/audit/team-intel/capacity-team | Multiple real access-checked SQL-backed endpoints. |
| Workload Dashboard | 🟡 EXISTS — PARTIAL | `WorkloadDashboard.jsx:11-50`; API: `GET /api/workload` | When API returns no rows, component silently synthesizes workload numbers client-side (`:36-50`) — not visually distinguished from real data. |
| AI Risk Heatmap (predictive) | ✅ EXISTS — WORKING | `AIRiskHeatmap.jsx:1-40`; DB: `ai_predictions`, `tasks.risk_score`/`delay_probability` | The one genuinely predictive dashboard element — real (rules-based) prediction infra with model_version/confidence/ai_fallback fields. |
| Predictive vs historical mix | ❓ UNCERTAIN (mostly historical) | `personal.js:325` (`tomorrowLoad = loadPercent + overdue*10`, a crude heuristic "forecast"); AI Risk Heatmap | Everything else in Analytics/Summary/Manager is current-state or backward-looking. |

### H. USERS, ROLES & PERMISSIONS

There are two parallel RBAC layers, both server-side. The legacy/platform layer (`users.role`: `team_member`/`manager`/`super_boss`, enforced by `middleware/rbac.js` and `middleware/adminAuth.js`) is live and used by most routes today. A newer enterprise RBAC layer (`roles`, `permissions_catalog`, `role_permissions_map`, `user_roles`, `user_permission_overrides` from `backend/migrations/enterprise-rbac.sql`, evaluated by `middleware/permission.js`'s `requirePerm()`) is wired into `roles.js` and `user-management.js`, with a built-in fallback to the legacy role system if no enterprise roles are assigned. `users.role` has no DB `CHECK` constraint — validity is enforced only in application code.

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| Platform roles (team_member/manager/super_boss) | ✅ EXISTS — WORKING | `backend/middleware/rbac.js:5-10` | Role always re-fetched from DB in `auth.js:32-35`, never trusted from JWT. |
| Enterprise roles/permissions catalog | ✅ EXISTS — WORKING | `backend/migrations/enterprise-rbac.sql:7-67`, `middleware/permission.js:47-146` | Full permission-override + scope system; falls back to legacy roles if unassigned. Migration is manual, not auto-applied at server start. |
| RBAC on tasks.js | ✅ EXISTS — WORKING | `tasks.js:232-243,350-360` | Inline ownership/membership check on every mutating route. |
| RBAC on workspaces.js | ✅ EXISTS — WORKING | `workspaces.js:243-280` | PUT/rename owner-only; DELETE allows owner or workspace-manager. |
| RBAC on members.js | ✅ EXISTS — WORKING | `members.js:46-65,252-259,283-293` | Role-change/invite restricted to workspace owner; remove allows owner or self. |
| RBAC on sprints.js | ✅ EXISTS — WORKING | `sprints.js:9-121` | Owner-or-member check + `requireFeature(SPRINTS)` on every route. |
| RBAC on ai.js | ✅ EXISTS — WORKING (mostly) | `ai.js:115,199,227` | `/analyze`,`/health`,`/alerts` use `requireMinRole("manager")`+plan gate+workspace check. `/predict/:taskId` (`ai.js:22`) is open to any authenticated user with **no workspace-membership check** — can predict on any task ID cross-workspace. |
| RBAC on capacity.js | ✅ EXISTS — WORKING | manager lookups at `capacity.js:324-334` | Approvals resolve to actual workspace owner/manager; self-service requests scoped to `req.user.id`. |
| RBAC on approvals.js | ✅ EXISTS — WORKING | `approvals.js:20,67,121-130,179-181` | Approve/reject inline-checks `a.approver_id !== req.user.id`. |
| RBAC on admin.js | ✅ EXISTS — WORKING | `admin.js:6-9` | `router.use(adminAuth)` gates every route to `role==="super_boss"` only (a stale comment says "manager" but enforcement is correct/more restrictive). |
| RBAC on workload.js | 🟡 EXISTS — PARTIAL | `workload.js:18,152,181` | Main dashboard is manager+workspace-scoped. `/users` and `/slot/:userId` require only `auth`, **no workspace check** — any authenticated user can search all users org-wide or query another user's workload/slot data by ID. Info-leak, not privilege escalation. |
| RBAC on analytics.js | ❓ UNCERTAIN | `analytics.js:11` | Only `auth` visible at route declaration; workspace-membership check (if any) is inside the handler body and wasn't independently confirmed — flag for direct re-verification. |
| RBAC on roles.js / user-management.js (enterprise) | ✅ EXISTS — WORKING | `roles.js:35-204`, `user-management.js:57-398` | Every route requires a specific enterprise permission string. |
| RBAC on teams.js | ✅ EXISTS — WORKING | `teams.js:20-45,84,118,147,199,240,262` | Explicit `canAccessWorkspace`/`isWorkspaceManagerOrOwner`/`isWorkspaceOwner` helpers per route; in-code note describes a prior "viewer could mutate teams" bug since fixed. |
| Workspace/team membership model | ✅ EXISTS — WORKING | `workspace_members` (role: manager/member/viewer), `org_teams`/`org_team_members` (enterprise) | Two membership concepts co-exist. |
| Invitations/onboarding flow | ✅ EXISTS — WORKING | `members.js:307-331,334-360,363+`, `JoinWorkspace.jsx` | Token-based via `workspace_invites`; expiry + single-use enforced server-side. |

### I. PRICING / PLAN GATING

Plan gating is a genuine two-layer system today, and **the prior 2026-06-25 audit note claiming pricing gates were removed is STALE and does not describe current code.** The backend (`middleware/planEnforce.js`, driven by `config/licensing.js`'s `PLAN_FEATURES` matrix) is the real enforcement point via `requireFeature()`/`enforceLimit()` applied directly on routes. The frontend (`utils/canAccess.js` + `config/features.js`) mirrors the same tier map for UI purposes only; `UpgradeGate.jsx` reacts to the backend's real 403 rather than a local plan check.

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| Backend plan-gate framework | ✅ EXISTS — WORKING | `middleware/planEnforce.js:98-182` | `requireFeature()` for booleans, `enforceLimit()` for numeric ceilings, resolved from DB not client input. |
| `PLAN_FEATURES` tier matrix | ✅ EXISTS — WORKING | `config/licensing.js:50-107` | FREE: no Gantt/Sprints/Simulation/Jarvis/AI/Export/PortfolioAI/SmartAssignment/Forecast, capped 3 projects/10 tasks/3 members. PRO: Gantt/Sprints/Jarvis/AI_REASONING/Export/SmartAssignment/Forecast true, Simulation/PortfolioAI still false, unlimited projects/tasks, 25 members. ENTERPRISE: everything true/unlimited. |
| **AI paywalled server-side** | ✅ EXISTS — WORKING (Pro+) | `ai.js:16,115,199,227` | `/analyze`,`/health`,`/alerts` require `requireFeature(AI_REASONING)` = **Pro tier**. `/predict/:taskId` deliberately not plan-gated (comment: "open to all roles") but also has no workspace check. **This directly confirms the audit's flagged contradiction: AI IS paywalled behind Pro/Enterprise in the code today**, for the analyze/health/alerts endpoints. |
| Jarvis paywalled server-side | ✅ EXISTS — WORKING (Pro+) | `jarvis.js:20,380` | `requireFeature(JARVIS)`. |
| Simulation paywalled server-side | ✅ EXISTS — WORKING (Enterprise-only) | `simulate.js:13,19,73` | `/assign` = Enterprise (`SIMULATION`); `/suggest` = Pro+ (`SMART_ASSIGNMENT`). |
| Sprints paywalled server-side | ✅ EXISTS — WORKING (Pro+) | `sprints.js:9,40,65,94,114` | Every route gated + workspace-scoped. |
| Export paywalled server-side | ✅ EXISTS — WORKING (Pro+) | `import.js:18,442` | `GET /tasks/:workspaceId/export`. |
| Numeric limits enforced server-side | ✅ EXISTS — WORKING | `workspaces.js:6,132`, `tasks.js:9,146`, `members.js:16,123` | `enforceLimit()` on workspace/task/member creation. |
| Internal-user bypass | ✅ EXISTS — WORKING (by design) | `planEnforce.js:104-108,156-160` | Internal-domain users bypass all checks — intentional for demo/dogfooding. |
| Frontend tier map | ✅ EXISTS — WORKING, mirrors backend | `config/features.js:5-28` | Matches `PLAN_FEATURES` tier-for-tier. |
| "`canAccess()`/`canViewSidebar()` always return true" claim | ❌ FALSE for current code | `utils/canAccess.js:65-77` | Both genuinely rank-compare plan/role. The June-2026 memory note describing this as removed is stale. |
| Frontend-only enforcement risk | ❌ ABSENT — not client-only | see rows above | Every gated route independently re-checks plan server-side. |
| Pricing page matches code | ✅ EXISTS — WORKING | `Pricing.jsx:11-59` | Free: Gantt/AI locked. Pro: Gantt+Sprints, 500 AI req/mo, Simulation locked. Enterprise: AI Risk Heatmap + Simulation. Matches `PLAN_FEATURES` exactly. |

**SECURITY FINDINGS:**
- No client-only/unenforced tier gating found — every checked feature has independent server-side enforcement.
- `POST /api/ai/predict/:taskId` (`ai.js:22`) has no workspace-membership check — any authenticated user can request/persist an AI prediction for any task ID across workspaces they don't belong to. Minor cross-tenant data-exposure gap.
- `GET /api/workload/users` and `GET /api/workload/slot/:userId` (`workload.js:152,181`) require only `auth`, no workspace check — org-wide user enumeration / cross-workspace workload lookup by any authenticated user.
- `GET /api/analytics/:wsId` (`analytics.js:11`) — membership check not independently confirmed inside handler body; flagged ❓ pending direct re-verification.
- `backend/migrations/enterprise-rbac.sql` is not auto-applied at server startup — if not run against the live DB, `requirePerm()` silently falls through to `LEGACY_FALLBACK` (safe, but the granular enterprise system may not actually be active in production).

**Marketing-claim verdict (plan-gating contradiction):** The product principle "AI must never be paywalled" is **NOT SUPPORTED BY CODE** — `routes/ai.js`'s `/analyze`, `/health`, and `/alerts` endpoints (workspace-wide AI analysis, health score, prescriptive alerts) are all gated behind the Pro-tier `AI_REASONING` feature flag server-side. Only the single-task `/predict/:taskId` endpoint is ungated (and that appears to be an oversight/missing-check rather than a deliberate "AI is free" design, since it also lacks a workspace check).

### J. INTEGRATIONS & API

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| Slack integration | ✅ EXISTS — WORKING | `integrations.js:56-62` real `axios.post` to a Slack Incoming Webhook URL; wired from test button `:167-190`, AI-alert push `:194-219`, cron agents `agentRunner.js:31-45,98-104,159-167` | Real outbound HTTP call to the webhook URL pasted in `IntegrationsPanel.jsx:5-13`. Config in `workspace_integrations`. |
| GitHub integration | 🟡 EXISTS — PARTIAL | Inbound webhook receiver `integrations.js:224-284` parses `fixes/closes/refs #123` from push payloads, adds a task comment | Inbound-only. No outbound GitHub API call (no octokit/SDK) — never reads/writes GitHub itself. |
| Google Calendar integration | ❌ ABSENT | `calendar.js` is a fully self-contained internal calendar; `oauth.js:24-32` only requests `"openid email profile"` (sign-in scope) | No calendar SDK calls anywhere. "Sign in with Google" ≠ calendar sync — the latter doesn't exist. |
| Email integration | 🟡 EXISTS — PARTIAL (config-only, never sends) | UI saves digest frequency to `workspace_integrations` type `email` (`integrations.js:119-148`) | Nothing ever reads this config to send anything. `agentRunner.js:8` documents a "Digest Mailer" 4th cron job that `startAgents()` never actually registers (only 3 jobs run) — dead documentation. `emailService.js` only sends invite/added/password-reset, no digest template. |
| Public/versioned third-party API | ❌ ABSENT | All routes at `/api/*`, no `/v1` versioning | Same internal API the SPA uses; no separate public surface. |
| API key/token auth for external callers | ❌ ABSENT | `middleware/auth.js` is JWT cookie/Bearer only | No API-key model. Only unauthenticated external endpoint is the GitHub webhook receiver. |
| Rate limiting | ✅ EXISTS — WORKING | `server.js:92-100` global limiter (300 req/15min on `/api`); `middleware/bruteForce.js`, `utils/writeLimiter.js` | Real `express-rate-limit` usage. |
| Webhooks — outbound | 🟡 EXISTS — PARTIAL | Only Slack is an outbound webhook target | No generic "any URL, any event" webhook config. |
| Webhooks — inbound | ✅ EXISTS — WORKING (no signature check) | `POST /api/integrations/github/webhook` (`:224`), public/unauthenticated | UI has an optional `webhook_secret` field but it's never checked against `X-Hub-Signature` — accepts any POST claiming to be from GitHub for a matching repo name. |
| Import — Jira CSV | ✅ EXISTS — WORKING | `POST /api/integrations/:workspaceId/jira/import` (`:288-355`), Jira-specific field/status/priority/type mapping | Real Jira-shaped CSV support. |
| Import — generic Excel/CSV | ✅ EXISTS — WORKING | `backend/routes/import.js` full pipeline (template/preview/confirm-UPSERT/status-import/logs); UI `ImportWizard.jsx` | Uses `xlsx` package, .xlsx/.xls/.csv. |
| Import — Asana/Trello-specific | ❌ ABSENT | No "Asana"/"Trello" matches anywhere in backend | Only Jira + generic CSV. |
| Export | ✅ EXISTS — WORKING | `GET /api/import/tasks/:workspaceId/export` (`:442-500`), gated `FEATURES.EXPORT` | Real .xlsx download. |

### K. AUTOMATIONS

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| User-configurable automations (trigger→action rules) | ❌ ABSENT | No automation/rule builder UI anywhere; no user-facing "automation" concept in backend routes | Risk scoring/overdue tagging/Slack alerts are hardcoded backend logic, not user-configurable. |
| Scheduled/cron jobs | ✅ EXISTS — WORKING | `agentRunner.js` via `node-cron`: Risk Monitor hourly (`:208`), Overdue Tagger every 6h (`:213`), Workload Sync every 30min (`:218`) | All 3 real, log to `agent_runs` table. A documented 4th "Digest Mailer" job (`:8` comment) is never registered — aspirational, not implemented. |
| Other interval jobs | 🟡 EXISTS — PARTIAL (infra only) | `bruteForce.js:19`, `server.js:332` (`setInterval`) | Housekeeping, not user-facing automation. |

### L. SEARCH & NOTIFICATIONS

There is no backend search endpoint of any kind — no `/api/search` route exists, and the only `ILIKE` usage is for user-autocomplete (assignee picker, @mention-in-chat dropdown), not content search. Every UI element that looks like "search" (Cmd+K command palette, channel chat search) is pure client-side `Array.filter()` over data already loaded into React state — only whatever's currently in memory, no descriptions/comments/cross-workspace results/ranking.

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| Global search — UI + backend | 🟡 EXISTS — PARTIAL (client-side only) | `CommandPalette.jsx:31-38,68-81` (Cmd+K) | No backend call — filters the already-loaded `tasks` prop by title text only. No `/api/search` route exists anywhere. |
| Search implementation type | ❌ ABSENT (no ILIKE search endpoint, tsvector, or embeddings) | Only hits for `ILIKE`: `members.js:143` (invite lookup), `workload.js:164` (assignee/@mention autocomplete) — both people-lookup helpers | No full-text index or vector search anywhere in schema. |
| Channel/chat search (secondary) | 🟡 EXISTS — PARTIAL (client-side only) | `ChannelView.jsx:271,293,323-329` | Filters already-fetched `messages` array — only covers the currently paginated window. |
| Notification delivery channels | ✅ EXISTS — WORKING (in-app+socket); 🟡 PARTIAL (email) | In-app: `notificationService.js:29-43`; email: `emailService.js:64-87` | Email (Resend, real) only for invite/added/password-reset — never for product events. |
| Notification trigger list (cross-ref) | ✅ EXISTS — WORKING | Same as Module C list | Comments, mentions, reactions never trigger a notification anywhere in backend. |

### M. OTHER / DEAD CODE

| Feature | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| `ai-agent/` Python service reachability | ❌ ABSENT — not reachable from product | `frontend/src/api/api.js:5-7` baseURL only ever points at the Node backend; zero references to `ai-agent`/`AGENT_URL`/port 8000 anywhere in frontend; `ai-agent/config.py:10` confirms its own port 8000 is never targeted | **Definitive: `ai-agent/` is a standalone internal dev-ops tool** (its own audit scheduler, GitHub client, Claude client, backlog generator) used to audit/develop Taskora itself — not a customer-reachable feature. |
| Orphaned backend route: `/api/admin` | ❌ ABSENT (dead route) | `admin.js` mounted at `server.js:193`; zero frontend references; no `Admin*` page/component exists | Whole admin surface with no UI. |
| Nested duplicate dir `frontend/src/src/` | 🟡 dead artifact | `frontend/src/src/components/Board.jsx`, from original "KanFlow" scaffold (pre-rename) | Not referenced by the Vite build entry; dead but still committed. |
| Top-level `productivity-platform/frontend/` | ❌ ABSENT (stray artifact) | Only contains `.vite/deps` cache files, no `src/`/`index.html` | Stray Vite dependency cache, not a second app. |
| Orphaned frontend components | ❌ ABSENT (dead code) | `Board.jsx`/`Card.jsx`/`Column.jsx` (0 imports, legacy kanban superseded by `KanbanBoard.jsx`), `AccountSettingsModal.jsx`, `SimulationModal.jsx`, `TaskoraLogo.jsx` (all 0 imports) | Verified via import grep across `frontend/src`. |
| UI promising capability backend lacks | 🟡 EXISTS — PARTIAL | `IntegrationsPanel.jsx` Email Digest card implies delivery; GitHub card's `webhook_secret` field implies signature verification | Both no-ops server-side — no digest ever sent; webhook secret never checked. |

---

## 4. Demo Data vs. Reality

**Two separate seed mechanisms exist, and they behave very differently:**

- `backend/seed-users.js` — CLI script. Creates 4 hardcoded users, one shared workspace, and adds all 4 as workspace members. Also does a no-op `INSERT INTO user_capacity (user_id) ... DO NOTHING` per new user (no field values set — pure defaults).
- `backend/seed-data.js` — CLI script, run after `seed-users.js`. Creates: 4 `user_capacity` rows with explicit hours/travel/leave (`:65-92`), 1 sprint, **14 tasks** (5 todo / 5 inprogress / 4 done) with `estimated_days`/`estimated_hours` filled in (`:109-227`), **18 subtasks** (`:250-293`), **12 comments** (`:297-335`), **12 calendar events** (`:343-431`). Critically, the `INSERT INTO tasks` column list here is `(title, description, type, priority, status, assigned_user_id, workspace_id, due_date, start_date, estimated_days, estimated_hours, progress, sprint_id, position, recurrence)` (`:232-236`) — **no `risk_score`, `delay_probability`, `confidence_score`, `ai_suggestion`, or `task_dependencies` rows are planted at all.** Tasks created by this script start with those AI columns `NULL` and would only get populated by a real predict/analyze call.
- `backend/routes/seed.js` (mounted only when `NODE_ENV !== "production"`, `server.js:195-196`) — the in-app "Seed demo data" HTTP endpoint (`POST /api/seed/demo`). This one is different: its `INSERT INTO tasks` explicitly writes `risk_score`, `delay_probability`, `ai_suggestion`, `ai_last_analyzed_at = NOW()`, and a flat hardcoded `confidence_score = 0.85` for every single task (`:203-212`), with per-task values hand-picked in the `TASKS` array (e.g. `risk_score: 88, delay_prob: 0.79, ai_suggestion: "OVERDUE — assign a second dev to unblock immediately."` for the overdue bug, `:162-167`). It also plants exactly **2 `task_dependencies` rows** (`:257-265`) and a synthetic **audit-log activity feed** (`:313-349`) with fabricated timestamps ("8h ago", "7 days ago", etc.) — this is data no live system produced, entirely scripted.

**Cross-reference against the AI/workload code (evidence-based, from actual algorithm code):**

- **Risk scoring** (`aiEngine.js` `calculateRiskScore`, called from `ai.js` `/predict/:taskId` and `/analyze/:workspaceId`) — purely rule-based on live task fields (due date, progress, priority, blocking-dep count, assignee load/leave/travel). On a brand-new workspace with 1 user + 3 tasks and no dependencies/effort logs, this **runs cleanly and returns a real computed score** — not null, not an error. If none of the 11 rules trigger, the score can legitimately be `0` with `reasoning: "No significant risk factors detected"` — a valid low-risk result, not a bug. Confidence score is always computed (min 0.5, scales with available data points), never null.
- **14-day load forecast** (`workloadEngine.js` `predictFutureLoad`, exposed via `capacity.js` `GET /predict/:wsId`) — also live and defensive: `effectiveCapacity()` gracefully falls back to `DEFAULT_DAILY_HOURS = 8` when no `user_capacity` row exists. `remainingHours()` falls back to `getTaskHours(task.type).avg` when a task has no `estimated_hours`/`estimated_days`. So even with zero effort logs, this **produces a genuine non-zero 14-day day-by-day forecast**, not nulls.
- **What-if simulation** (`workloadEngine.js` `simulateAssignment`, `simulate.js` `/assign`) — same defensive defaults as above; works standalone on a fresh workspace, returns real `before`/`after`/`feasible`/`delayRisk` values.
- **Capacity/heatmap** endpoints (`capacity.js` `/predict/:wsId`, `/team/:wsId`) — same `predictFutureLoad`/`buildUserSummary` code path; works the same way, live-computed, no seed dependency.

None of the four AI/workload features literally read `task.risk_score` etc. as an *input* to their own math — they are legitimately live-computed algorithms and would not error or silently return all-null on a from-scratch workspace.

**Where seed data IS doing the AI's job:** the gap is not in the compute engines but in **what the UI displays without triggering compute**. `frontend/src/components/TaskCard.jsx:82,98,196-343` (the Kanban board cards) reads `task.risk_score` / `task.delay_probability` / `task.ai_suggestion` **directly off the task object returned from the general tasks list** — it never calls `/api/ai/predict` itself. Those columns are only populated by (a) a prior `/api/ai/predict` or `/api/ai/analyze` call persisting results back via `UPDATE tasks SET risk_score=...` (`ai.js:67-82`, `171-179`), or (b) the demo-seed endpoint's hardcoded values. So on a freshly seeded demo workspace (`POST /api/seed/demo`), the Kanban board **immediately shows risk badges/pills that are the hardcoded numbers from `routes/seed.js`**, not anything the AI engine computed — until a manager explicitly clicks "Analyze all" or "Refresh prediction," which overwrites them with real values. The dedicated AI Risk Heatmap page (`AIRiskHeatmap.jsx:226-227`) does call live `/api/ai/alerts` on load and only falls back to the stale `task.risk_score` "best-effort" if that call fails — so that page is mostly honest, but the primary Kanban view is not.

---

## 5. Marketing Claims vs. Code Reality

| Claim | Verdict | Evidence |
|---|---|---|
| "Predicts delivery risk before projects fail" | **PARTIALLY SUPPORTED** | `aiEngine.js:calculateRiskScore` genuinely computes a live risk score from real task data (overdue, progress, priority, assignee load) and correctly identifies at-risk tasks — but it's a deterministic 11-rule heuristic, not predictive ML, and "before projects fail" overstates what a same-moment scoring rubric does. |
| "AI Risk Scoring with explanations" | **PARTIALLY SUPPORTED** | Real, live-computed (`ai.js:22-111`), and does return human-readable `reasoning`/`suggestions` strings built from the fired rules — genuinely explainable in the literal sense, but the "explanation" is a template string, not a model rationale. |
| "14-Day Load Forecasting" | **NOT SUPPORTED (in practice)** | Real algorithm exists (`workloadEngine.js:420-449`, `GET /capacity/predict/:wsId`) but has **zero frontend caller** — no UI screen shows it as a standalone feature. It's also not a forecast of future demand, just a drain-forward projection of today's backlog. |
| "What-If Simulation Engine" | **PARTIALLY SUPPORTED** | Real, reachable feature (Enterprise-gated) that computes before/after capacity for one candidate assignment — but it's a single deterministic calculation, not a simulation with variance/scenarios, and "Engine" overstates a ~40-line arithmetic function. |
| "Capacity Heatmap" | **NOT SUPPORTED** | No heatmap visualization component exists anywhere in the codebase. The only "heatmap" found (`AIRiskHeatmap.jsx`) visualizes per-task risk, not per-person capacity over time. |
| "Smart Assignment Suggestions" | **PARTIALLY SUPPORTED** | Real, live, reachable (Pro+) — but ranks candidates by a simple two-key sort (feasibility, then load %), not a multi-factor or learned scoring model. |
| "Dependency risk" | **NOT SUPPORTED** | Dependencies (`task_dependencies`) have **no creation UI anywhere in the product** (verified via full-repo grep). The risk engine's dependency rule (Rule 6) can only ever fire on directly-API-injected or seed-planted rows — never on data a real user created through the app. |
| "Sprint Intelligence" / "Portfolio Intelligence" / "Delivery Confidence" scores | **NOT SUPPORTED** | No component, route, or DB field matching these names exists. Sprints have real CRUD + burndown, but nothing resembling a named "intelligence" or "confidence" score. |
| Jarvis as an AI assistant that can take action | **PARTIALLY SUPPORTED** | Jarvis genuinely executes real mutations (create/complete/assign/reprioritize/delete tasks) via 15 regex intents, with real-time socket broadcast and audit logging — action-taking is real. But "AI assistant" is a stretch: intent detection is regex, not language understanding, except for a narrow 3-second LLM fallback used only for free-text search. The destructive-action confirmation gate only triggers for fuzzy title matches — exact/prefix matches (including delete) execute immediately with no confirmation. |

---

## 6. SEO / Metadata

| Item | Value found | file:line |
|---|---|---|
| `<title>` | `Taskora — Kanban Productivity Platform` | `frontend/index.html:7` |
| `<meta name="description">` | ❌ ABSENT — no such tag anywhere in the file | `frontend/index.html:1-19` (whole file read) |
| Open Graph (`og:*`) | ❌ ABSENT — no `og:title`, `og:description`, `og:image`, `og:url`, etc. | `frontend/index.html:1-19` |
| Twitter card (`twitter:*`) | ❌ ABSENT — no `twitter:card` or related tags | `frontend/index.html:1-19` |
| Favicon | ✅ EXISTS — WORKING: `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`; file confirmed present at `frontend/public/favicon.svg` | `frontend/index.html:5` |
| Manifest | ❌ ABSENT — no `<link rel="manifest">` tag, and no `manifest.json`/`site.webmanifest` file exists in `frontend/public/` | `frontend/index.html:1-19`; `frontend/public/` |

Confirms the context note: the live title reads "Taskora — Kanban Productivity Platform," a generic kanban-tool framing that says nothing about risk prediction, AI, or execution intelligence — actively working against the product's stated positioning. Combined with the total absence of a meta description and social-share tags, the site has no controlled narrative when shared or indexed; search engines and link previews fall back to whatever they can scrape from the page body.

---

## 7. Top 10 Gaps, Ranked by Impact on Core Positioning ("we predict execution risk")

1. **Task dependencies cannot be created by any user, ever, through the UI.** This is the single most damaging finding — the entire "dependency risk" narrative has no path from real user data to any output. (Module B)
2. **AI is paywalled behind Pro/Enterprise** (`ai.js` `/analyze`, `/health`, `/alerts`), directly contradicting a "free AI" positioning if that's the intended narrative. (Module I)
3. **14-Day Load Forecasting and Capacity Heatmap have no UI surface** — both headline predictive-capacity features are unreachable despite working backend code. (Module E)
4. **All "AI" is rule-based arithmetic, not ML**, with `model_version: "v1-rules"` hardcoded and `ai_fallback: true` always set — the product's entire differentiation claim rests on a scaffold for a model that doesn't exist yet. (Module E)
5. **No Projects entity** — the hierarchy is flat Workspace→Task, undermining any claim of portfolio/multi-project intelligence; a "project limit" is referenced in pricing config with nothing to enforce. (Module F)
6. **Gantt view never renders dependency arrows** despite the data existing — the one place a user might visually connect "dependency" to "timeline risk" doesn't do it. (Module D)
7. **Collaboration signals that would feed a "team risk" story are missing or fake**: no @mentions, no reactions, no real followers/watchers, and the per-task Activity tab in Manager Dashboard is silently broken (wrong query param, 404s swallowed). (Module C)
8. **List and Table views don't exist** — a plausible baseline expectation for any competitor comparison. (Module D)
9. **Recurring tasks are still a disabled "COMING SOON" stub**, unchanged since the June 2026 audit — any positioning implying ongoing/recurring workflow automation is unsupported. (Module A)
10. **The `ai-agent/` Python service could be mistaken for the product's AI layer but isn't** — it's an internal dev tool; anyone auditing "where's the AI" from the repo root without tracing actual HTTP calls would draw the wrong conclusion (as almost happened in this audit until verified). (Module M)

---

## 8. Quick Wins (<1 day, outsized impact)

- **Wire the 14-Day Forecast and Capacity Heatmap data into an existing dashboard tab** — the backend algorithm already exists and works; this is a rendering task, not new engineering. (Module E)
- **Fix the Manager Dashboard's broken comment/activity tabs** — both call wrong endpoints (`/tasks/:id/comments` instead of `/comments/:taskId`; `/audit?task_id=` instead of a supported filter) and fail silently. Small, high-visibility fix. (Module C)
- **Add a minimal task-dependency picker** (even a simple "depends on" dropdown in `TaskDetailModal`) — the entire backend (POST/DELETE/graph read) already exists; only the UI affordance is missing. This alone would activate three currently-decorative features at once (blocked badges, dependency graph, risk Rule 6). (Module B)
- **Add `<meta name="description">` and Open Graph/Twitter tags to `frontend/index.html`**, and fix the title to match actual positioning — a 10-minute change with real SEO/social-share impact. (Step 5)
- **Rename "Velocity" in the Sprint burndown tab** (`SprintView.jsx`) — it currently displays percent-complete mislabeled as velocity, while a correct velocity chart already exists in Analytics. (Module F)
- **Remove/hide the "Email Digest" integration UI or wire it to something** — currently a config-only no-op that silently promises a feature that doesn't exist. (Module M)

---

## 9. Anything That Surprised Me

- **The plan-gating system is more honest than a stale internal memory note suggested.** A prior audit record claimed pricing gates had been stripped out (`canAccess()` always `true`); the current code shows a fully rebuilt, server-side-enforced two-layer gating system. This is a case where the codebase moved forward and old notes went stale — worth flagging since it's easy to trust cached knowledge over re-verifying the live code, exactly as this audit's own instructions warned against.
- **Two competing RBAC systems coexist safely** — a legacy platform-role system and a newer enterprise permission-catalog system, with the enterprise one explicitly falling back to the legacy one if unassigned. This is unusually well-engineered for a project at this stage; most "audit" findings about RBAC end up being gaps, not this.
- **The seed/demo mechanisms are inconsistent with each other.** The CLI seed script (`seed-data.js`) plants realistic tasks with no AI fields at all (forcing a real compute pass), while the in-app demo endpoint (`routes/seed.js`) hardcodes fabricated risk scores and a flat `confidence_score: 0.85` for every task plus a synthetic activity feed with fake relative timestamps. A demo run through the in-app path would show numbers the AI engine never computed.
- **`nlquery.js` explicitly documents itself in its own header comment as "rule-based, zero external dependencies"** — a rare case of the code being more honest about its own limitations than any external marketing claim would be.
- **The Jarvis destructive-action confirmation gate has a real gap**: it only engages for ambiguous (fuzzy) title matches. An exact-title "delete task X" executes immediately, no confirmation, no undo (`tasks` has hard deletes only, no soft-delete anywhere in the schema).
- **A "capacity heatmap" was expected to exist somewhere given how central it is to workload messaging — it doesn't exist as a visual artifact at all**, only as raw current-load numbers on member cards.
