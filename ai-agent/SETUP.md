# Taskora AI Agent (Jarvis) — Setup Guide

## Prerequisites
- Python 3.11+
- Taskora Express backend running on port 3001
- Anthropic API key

## 1. Install dependencies

```bash
cd ai-agent
pip install -r requirements.txt
```

## 2. Configure environment

```bash
cp .env.example .env
# Edit .env:
# ANTHROPIC_API_KEY=sk-ant-...
# TASKORA_API_URL=http://localhost:3001/api
# DATABASE_URL=postgresql://user:pass@localhost/kanban_db
```

## 3. Start the agent

```bash
uvicorn main:app --reload --port 8000
# → http://localhost:8000
# → Docs: http://localhost:8000/docs
```

## 4. Use the CLI

```bash
# Get your JWT token from browser localStorage:
# Open DevTools → Application → Local Storage → "token"

# Run audit
python scripts/cli.py audit --workspace-id 1 --token YOUR_JWT

# Generate backlog
python scripts/cli.py backlog --workspace-id 1 --token YOUR_JWT

# Analyze a file
python scripts/cli.py code --file ../frontend/src/components/TaskCard.jsx --token YOUR_JWT

# Interactive chat (Jarvis mode)
python scripts/cli.py chat --workspace-id 1 --token YOUR_JWT
```

## 5. VS Code Integration

Press `Ctrl+Shift+P` → "Tasks: Run Task" → choose:
- 🤖 Start AI Agent (Jarvis)
- 🔍 Audit Project (Jarvis)
- 📋 Generate Backlog (Jarvis)
- 🔬 Analyze Current File (Jarvis)
- 💬 Open Jarvis Chat

## 6. API Reference

```
POST http://localhost:8000/api/audit
POST http://localhost:8000/api/generate-backlog
POST http://localhost:8000/api/tasks/create
GET  http://localhost:8000/api/tasks/workspace/{id}?token=...
POST http://localhost:8000/api/analyze-code
POST http://localhost:8000/api/logs
POST http://localhost:8000/api/chat
GET  http://localhost:8000/api/tools
GET  http://localhost:8000/health
```

## 7. Example API call

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Show me all overdue tasks and create a bug for the highest priority one",
    "token": "YOUR_JWT",
    "workspace_id": 1
  }'
```
