import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from models.requests import AuditRequest
from models.responses import AuditResponse
from services.claude_client import run_agent
from db.session import get_db
from db.schema import AuditRun
import json
import logging

router = APIRouter(prefix="/audit", tags=["audit"])
logger = logging.getLogger(__name__)


AUDIT_PROMPT = """Perform a comprehensive product audit of the Taskora workspace.

Step 1: Call collect_workspace_snapshot to get the workspace data.
Step 2: Call collect_ux_signals to analyze frontend code quality.
Step 3: Call read_audit_logs to check for anomalies.
Step 4: Call read_ai_alerts to see current risk signals.
Step 5: Synthesize ALL findings into a structured audit report.

For each issue found, provide:
- Title (concise)
- Location (screen/component/route)
- Problem (what's wrong)
- Impact (effect on users/business)
- Root Cause (technical cause)
- Fix (concrete solution)
- Priority (critical/high/medium/low)
- Category (ux/ui/bug/performance/security/missing_feature)

Format as JSON with this exact structure:
{
  "issues": [...],
  "summary": {
    "total_issues": N,
    "by_priority": {"critical": N, "high": N, "medium": N, "low": N},
    "by_category": {...}
  },
  "top_critical": ["issue1", "issue2", ...],
  "quick_wins": ["easy fix 1", "easy fix 2", ...],
  "score": 75
}

workspace_id: {workspace_id}
scope: {scope}
"""


@router.post("", response_model=AuditResponse)
async def run_audit(req: AuditRequest, db: AsyncSession = Depends(get_db)):
    audit_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().isoformat()

    prompt = AUDIT_PROMPT.format(workspace_id=req.workspace_id, scope=req.scope)
    messages = [{"role": "user", "content": prompt}]

    try:
        text, tool_calls, actions = await run_agent(
            messages=messages,
            token=req.token,
            workspace_id=req.workspace_id,
        )
    except Exception as e:
        logger.error(f"Audit agent error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Parse JSON from Claude's response
    issues_data = []
    summary_data = {}
    top_critical = []
    quick_wins = []
    score = 70

    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0:
            parsed = json.loads(text[start:end])
            issues_data = parsed.get("issues", [])
            summary_data = parsed.get("summary", {})
            top_critical = parsed.get("top_critical", [])
            quick_wins = parsed.get("quick_wins", [])
            score = parsed.get("score", 70)
    except Exception:
        # Claude returned prose instead of JSON — wrap it
        issues_data = [{"id": "1", "title": "See full report", "location": "General",
                        "problem": text[:500], "impact": "See report", "root_cause": "See report",
                        "fix": "See report", "priority": "medium", "category": "ux"}]
        summary_data = {"total_issues": 1}

    # Normalize issues
    normalized = []
    for i, issue in enumerate(issues_data):
        normalized.append({
            "id": issue.get("id", str(i + 1)),
            "title": issue.get("title", f"Issue {i+1}"),
            "location": issue.get("location", "Unknown"),
            "problem": issue.get("problem", ""),
            "impact": issue.get("impact", ""),
            "root_cause": issue.get("root_cause", ""),
            "fix": issue.get("fix", ""),
            "priority": issue.get("priority", "medium"),
            "category": issue.get("category", "bug"),
        })

    # Persist to DB
    try:
        db.add(AuditRun(
            audit_id=audit_id,
            workspace_id=req.workspace_id,
            scope=req.scope,
            issues_json=normalized,
            summary_json=summary_data,
            score=score,
        ))
        await db.commit()
    except Exception as e:
        logger.warning(f"Failed to persist audit: {e}")

    return AuditResponse(
        audit_id=audit_id,
        workspace_id=req.workspace_id,
        timestamp=timestamp,
        issues=normalized,
        summary=summary_data,
        top_critical=top_critical,
        quick_wins=quick_wins,
        score=score,
        tool_calls_made=tool_calls,
    )
