import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from models.requests import BacklogRequest
from models.responses import BacklogResponse, BacklogItem
from services.claude_client import run_agent
from db.session import get_db
from db.schema import BacklogRun
import json
import logging

router = APIRouter(prefix="/generate-backlog", tags=["backlog"])
logger = logging.getLogger(__name__)


BACKLOG_PROMPT = """Generate a prioritized product backlog for the Taskora workspace.

Step 1: Call get_workspace_summary to understand the current state.
Step 2: Call fetch_tasks to see existing tasks and gaps.
Step 3: Call get_workload_overview to understand capacity.
Step 4: Call read_ai_alerts for existing risk signals.
Step 5: Generate backlog items that address gaps, risks, and improvements.

Additional context from user: {context}
Max items to generate: {max_items}

For each backlog item return:
{{
  "id": "BL-001",
  "title": "...",
  "description": "Detailed description with acceptance criteria",
  "type": "Bug|Feature|Improvement|Chore",
  "priority": "critical|high|medium|low",
  "effort_hours": 8,
  "status": "todo",
  "tags": ["backend", "ui", "performance"],
  "column": "urgent|in_progress|backlog",
  "depends_on": ["BL-002"],
  "suggested_owner": "engineer|designer|pm"
}}

Return JSON:
{{
  "items": [...],
  "execution_order": ["BL-001", "BL-003", "BL-002"],
  "total_effort_hours": N
}}

workspace_id: {workspace_id}
"""


@router.post("", response_model=BacklogResponse)
async def generate_backlog(req: BacklogRequest, db: AsyncSession = Depends(get_db)):
    backlog_id = str(uuid.uuid4())

    prompt = BACKLOG_PROMPT.format(
        workspace_id=req.workspace_id,
        context=req.context or "Focus on UX improvements, reliability, and missing features.",
        max_items=req.max_items,
    )
    messages = [{"role": "user", "content": prompt}]

    try:
        text, tool_calls, actions = await run_agent(
            messages=messages,
            token=req.token,
            workspace_id=req.workspace_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    items = []
    execution_order = []
    total_effort = 0

    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0:
            parsed = json.loads(text[start:end])
            raw_items = parsed.get("items", [])
            execution_order = parsed.get("execution_order", [])
            total_effort = parsed.get("total_effort_hours", 0)

            for i, item in enumerate(raw_items[:req.max_items]):
                items.append(BacklogItem(
                    id=item.get("id", f"BL-{i+1:03d}"),
                    title=item.get("title", f"Backlog Item {i+1}"),
                    description=item.get("description", ""),
                    type=item.get("type", "Improvement"),
                    priority=item.get("priority", "medium"),
                    effort_hours=item.get("effort_hours", 4),
                    status="todo",
                    tags=item.get("tags", []),
                    column=item.get("column", "backlog"),
                    depends_on=item.get("depends_on", []),
                    suggested_owner=item.get("suggested_owner"),
                ))
    except Exception as e:
        logger.error(f"Backlog parse error: {e}")
        items = [BacklogItem(
            id="BL-001", title="Review full backlog report",
            description=text[:1000], type="Improvement", priority="medium",
            effort_hours=4, tags=[], column="backlog",
        )]

    if not total_effort:
        total_effort = sum(i.effort_hours for i in items)

    try:
        db.add(BacklogRun(
            backlog_id=backlog_id,
            workspace_id=req.workspace_id,
            audit_id=req.audit_id,
            items_json=[i.model_dump() for i in items],
        ))
        await db.commit()
    except Exception as e:
        logger.warning(f"Failed to persist backlog: {e}")

    return BacklogResponse(
        backlog_id=backlog_id,
        workspace_id=req.workspace_id,
        items=items,
        execution_order=execution_order,
        total_effort_hours=total_effort,
        tool_calls_made=tool_calls,
    )
