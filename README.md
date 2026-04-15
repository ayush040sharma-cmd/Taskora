# Taskora — Kanban Productivity Platform

A full-stack Jira/Trello-style project management tool with task tracking, workload management, calendar views, and sprint planning.

## Features

- **Kanban Board** — Drag & drop tasks across To Do / In Progress / Done
- **Task Progress** — 0–100% progress bar on every card, click to edit
- **Task Types** — Normal / Upgrade / RFP with capacity percentages
- **Workload Dashboard** — Battery-style capacity bars per team member, overload warnings
- **Calendar View** — Monthly grid with tasks plotted by due date, color-coded by priority
- **Sprint Planning** — Create sprints, board view with D&D, burndown chart
- **Multi-workspace** — Each user can have multiple workspaces
- **JWT Auth** — Register, login, persistent sessions

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 8, React Router v7, @hello-pangea/dnd |
| Backend | Node.js + Express 5, JWT, bcryptjs |
| Database | PostgreSQL |
| Deployment | Vercel (frontend) + Render (backend) + Neon (DB) |

## Local Setup

### Prerequisites
- Node.js 18+
- PostgreSQL (local or Neon)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in your values
psql -d your_db -f schema.sql
psql -d your_db -f schema-v2.sql
npm run dev            # runs on port 3001
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # runs on port 5173
```

### Environment Variables

**backend/.env**
```
PORT=3001
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=your_secret_key
FRONTEND_URL=http://localhost:5173
```

**frontend/.env.local** (production only)
```
VITE_API_URL=https://your-render-backend.onrender.com
```

## Deployment

- **Frontend → Vercel**: connect repo, set `VITE_API_URL` env var
- **Backend → Render**: connect repo, set root to `backend/`, add env vars
- **Database → Neon**: create project, copy `DATABASE_URL` to Render env vars

## License

MIT
