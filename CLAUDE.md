# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Taskora is a project management SaaS (Jira/Trello-style) with workload tracking, AI risk scoring, sprint planning, real-time collaboration, and background automation agents.

## Commands

### Backend (`/backend`)
```bash
npm install       # Install dependencies
npm run dev       # Start with nodemon on port 3001
npm start         # Production start
```

### Frontend (`/frontend`)
```bash
npm install       # Install dependencies
npm run dev       # Vite dev server on port 5173
npm run build     # Production build → /dist
npm run lint      # ESLint check
npm run preview   # Preview production build
```

No test suite is configured.

### Database Setup (PostgreSQL)
Apply schema files in order against your database:
```bash
psql -d kanban_db -f backend/schema.sql
psql -d kanban_db -f backend/schema-v2.sql
psql -d kanban_db -f backend/schema-v3.sql
# ... through schema-v15.sql
```
`backend/schema-full.sql` is a combined base + v2 for reference only.

## Environment Variables

**Backend** (`backend/.env`):
```
PORT=3001
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=your_secret_key
FRONTEND_URL=http://localhost:5173
```

**Frontend** (`.env.local` for production overrides):
```
VITE_API_URL=https://your-render-backend.onrender.com
```

In development, Vite proxies `/api` → `http://localhost:3001` (configured in `frontend/vite.config.js`) so `VITE_API_URL` is not needed locally.

## Architecture

### Structure
Two independent npm projects — no monorepo/workspaces:
- `backend/` — Node.js + Express 5 API server (CommonJS)
- `frontend/` — React 19 + Vite SPA (ES modules)
- `productivity-platform/` — Legacy/in-progress secondary frontend (unused)

### Backend
- **Entry point:** `backend/server.js` — mounts all routes, configures CORS, initializes Socket.io, starts background agents
- **Database:** `backend/db.js` — PostgreSQL connection pool (Neon SSL in production via `?sslmode=require`)
- **Routes:** `backend/routes/*.js` (18 files) — auth, tasks, workspaces, sprints, workload, capacity, AI, integrations, NL queries, calendar, comments, subtasks, effort, etc.
- **Services:**
  - `workloadEngine.js` — Core capacity math: converts task days → hours, respects per-user `daily_hours`, `travel_mode`, leave windows, and per-type task limits (RFP, proposals, presentations, upgrades). Exposes `getNextAvailableSlot()`.
  - `agentRunner.js` — Cron-scheduled background agents (risk monitor hourly, overdue tagger every 6h, workload sync every 30min, digest mailer daily at 8am). Logs runs to `agent_runs` table.
  - `aiEngine.js` — AI risk scoring and dependency analysis for tasks.
  - `auditService.js`, `workloadLogger.js`, `notificationService.js` — Supporting services.
- **Middleware:** `auth.js` (JWT verification), `rbac.js` (role-based access: `team_member`, `manager`, `super_boss`)
- **Rate limiting:** Auth endpoints capped at 10 requests / 15 min per IP.

### Frontend
- **Entry:** `frontend/src/App.jsx` — React Router v7 with `AuthProvider` wrapping all routes; `ProtectedRoute` guards authenticated pages.
- **Auth:** `frontend/src/context/AuthContext.jsx` — JWT stored in localStorage; `frontend/src/api/api.js` is an axios instance that automatically attaches `Authorization: Bearer <token>` to every request.
- **Real-time:** `frontend/src/hooks/useSocket.js` — Singleton Socket.io connection; components join workspace rooms (`workspace:{workspaceId}`) for live task updates.
- **Pages:** `frontend/src/pages/` — Home (landing), Login, Register, Dashboard (main app shell), WorkspaceSetup.
- **Components:** `frontend/src/components/` (47 components) — KanbanBoard (drag-drop via `@hello-pangea/dnd`), CalendarView, GanttChart, ManagerDashboard, AnalyticsDashboard, CapacityPanel, CreateTaskModal, AIInsightsPanel, AIRiskHeatmap, DependencyGraph, NLChat, IntegrationsPanel, SimulationModal, and more.

### Key Data Flows
1. **Auth:** Register/Login → JWT → localStorage → axios interceptor auto-attaches header.
2. **Tasks:** REST CRUD at `/api/tasks/workspace/:workspaceId`; mutations emit Socket.io events to the workspace room for live updates to all connected clients.
3. **Workload:** `/api/workload?workspace_id=X` returns per-user load%, remaining hours, and per-type task counts. The `workloadEngine` is the single source of truth for capacity math.
4. **Sprints:** `/api/sprints` for CRUD; burndown data aggregated server-side.
5. **Background agents:** Triggered by `node-cron` schedules in `agentRunner.js`; output stored in `agent_runs` table (JSONB `result` column).

### Database Schema (key tables)
- `users` — id, name, email, password_hash, role, max_capacity
- `workspaces` — id, name, user_id
- `tasks` — id, title, status, priority, type, estimated_days, estimated_hours, actual_hours, progress, sprint_id, assigned_user_id, workspace_id, due_date, start_date, completed_at
- `sprints` — id, name, goal, start_date, end_date, status, workspace_id
- `user_capacity` — user_id (PK), daily_hours, travel_mode, leave_start, leave_end, max_rfp, max_proposals, max_presentations, max_upgrades
- `agent_runs` — id, agent_name, workspace_id, result (JSONB), status, ran_at
- Supporting: `task_dependencies`, `task_comments`, `subtasks`, `effort_logs`, `workspace_integrations`, `approvals`, `notifications`

## Deployment
- **Backend** → Render (root dir: `backend/`)
- **Frontend** → Vercel
- **Database** → Neon (serverless PostgreSQL)
- `render.yaml` at repo root enables one-click Render deploy with auto-provisioned PostgreSQL and auto-generated `JWT_SECRET`.

## CORS
Allowed origins: `http://localhost:5173`, `http://localhost:3000`, `FRONTEND_URL` env var, and `*.vercel.app` (wildcard). Socket.io uses the same origins.
