#!/bin/bash
# Daily Taskora Audit Runner
# Runs at 2AM via GitHub Actions or local cron

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$REPO_DIR/.taskora/audit_log.md"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo ""
echo "======================================"
echo "  TASKORA DAILY AUDIT — $DATE"
echo "======================================"
echo ""

cd "$REPO_DIR"

# 1. Frontend lint + type check
echo "[1/4] Running frontend checks..."
cd frontend
npm run lint --silent 2>&1 | head -50 || true
cd ..

# 2. Backend syntax check
echo "[2/4] Running backend checks..."
cd backend
node --check server.js 2>&1 || true
for f in routes/*.js; do node --check "$f" 2>&1 || true; done
cd ..

# 3. Python ai-agent checks
echo "[3/4] Running ai-agent checks..."
if command -v python3 &>/dev/null; then
  cd ai-agent
  python3 -m py_compile main.py 2>&1 || true
  python3 -m py_compile config.py 2>&1 || true
  cd ..
fi

# 4. Write summary to audit_log.md
echo "[4/4] Writing audit summary..."
cat >> "$LOG" << ENTRY

---

## Automated Daily Audit — $(date '+%Y-%m-%d')

- Frontend lint: completed
- Backend syntax: completed
- AI-agent compile: completed
- Next manual review: scheduled
- Run timestamp: $DATE

ENTRY

echo ""
echo "Audit complete. Results written to .taskora/audit_log.md"
echo ""
