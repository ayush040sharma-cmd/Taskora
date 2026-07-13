# Taskora — AI-Powered Project Management Platform

A full-stack Jira/Trello-style project management tool with kanban boards, sprint planning,
workload/capacity management, approvals, analytics, enterprise RBAC, and an integrated AI
assistant ("Jarvis").

## Features

- **Kanban Board** — Drag & drop tasks across To Do / In Progress / Done, with progress bars, task types (Normal / Upgrade / RFP), and inline editing
- **Sprint Planning** — Sprint board with drag & drop, burndown chart
- **Workload & Capacity** — Battery-style capacity bars per team member, overload warnings, leave/travel tracking
- **Calendar View** — Monthly grid with tasks plotted by due date, color-coded by priority
- **Analytics & Dashboards** — Manager dashboard, throughput/analytics charts, dependency graph, collaboration score, AI risk heatmap
- **Approvals** — Approval workflows for task/status changes, enterprise approval center
- **Multi-workspace** — Each user can belong to multiple workspaces, with invites and join links
- **Enterprise RBAC** — Role hierarchy (team member / manager / super boss) plus a DB-backed granular permission system for enterprise-tier workspaces
- **Licensing / Plans** — Free / Pro / Enterprise plans with Razorpay-based payments and internal-domain bypass
- **AI Assistant (Jarvis)** — Natural-language task chat, AI insights panel, voice assistant UI, backed by a Python/FastAPI agent service using the Anthropic Claude API
- **Auth** — Email/password (JWT, httpOnly cookies) and Google OAuth
- **Real-time** — Live task/board updates via Socket.io
- **Notifications & Activity Feed** — In-app notification center and workspace activity feed
- **Import Wizard** — Bulk task import (Excel/CSV via `xlsx`)
- **Command Palette** — Keyboard-driven quick actions and navigation

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 8, React Router v7, @hello-pangea/dnd, Recharts, Socket.io client |
| Backend | Node.js + Express 5, Socket.io, JWT + bcryptjs, Helmet, express-rate-limit, Zod, Winston |
| AI Agent ("Jarvis") | Python + FastAPI, Anthropic Claude SDK (`ai-agent/`) — optional, separate service |
| Database | PostgreSQL |
| Payments | Razorpay |
| Email | Resend |
| Deployment | Vercel (frontend) + Render (backend) + managed PostgreSQL (Render/Neon/Supabase) |

## Repo Structure

```
backend/     Express API + Socket.io server, schema-v2..v11.sql migrations
frontend/    React (Vite) SPA
ai-agent/    Optional Python/FastAPI AI agent service ("Jarvis") — CLI + REST API
docs/        Architecture notes (licensing, full audit history)
DEPLOY.md    Full deployment walkthrough (Vercel + Render + DB + OAuth + email)
```

## Local Setup

### Prerequisites
- Node.js 18+
- PostgreSQL (local, or a hosted instance — Neon/Supabase/Render all work)
- Python 3.11+ (optional, only needed for the AI agent service)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in your values
psql -d your_db -f schema.sql
for i in 2 3 4 5 6 7 8 9 10 11; do psql -d your_db -f schema-v$i.sql; done
npm run dev            # runs on port 3001
```

### Frontend

```bash
cd frontend
npm install

npm run dev            # runs on port 5173
```

### AI Agent (optional)

```bash
cd ai-agent
pip install -r requirements.txt
cp .env.example .env   # needs ANTHROPIC_API_KEY + backend URL/DB
uvicorn main:app --reload --port 8000
```
See `ai-agent/SETUP.md` for the CLI and API reference.

### Environment Variables

**backend/.env** — see `backend/.env.example` for the full annotated list. Minimum to run locally:
```
PORT=3001
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=your_secret_key
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3001
```
Optional (feature-gated — the app runs without them): `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
(Google sign-in), `RESEND_API_KEY`/`FROM_EMAIL`/`EMAIL_REPLY_TO` (transactional email),
`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` (real payments — mock order returned in dev without
these), `PAYMENT_CURRENCY`/`PRO_PLAN_PRICE`/`ENTERPRISE_PLAN_PRICE` (pricing), `INTERNAL_DOMAINS`
(comma-separated email domains that bypass plan restrictions).

**frontend/.env.local** (production only)
```
VITE_API_URL=https://your-render-backend.onrender.com
```

## Deployment

See **[DEPLOY.md](DEPLOY.md)** for the full walkthrough (database, Render, Vercel, custom
domain, Google OAuth, Resend email). Short version:

- **Database**: create a managed PostgreSQL instance, run `schema.sql` then `schema-v2.sql`
  through `schema-v11.sql` in order
- **Backend → Render**: root `backend/`, build `npm install`, start `npm start`, set env vars
  from `backend/.env.example`
- **Frontend → Vercel**: root `frontend/`, set `VITE_API_URL`

## License

MIT
