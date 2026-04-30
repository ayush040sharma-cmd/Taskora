from fastapi import APIRouter, HTTPException
from models.requests import LogsRequest
from models.responses import LogsResponse, LogEntry
from services.taskora_client import TaskoraClient
from tools.log_tools import read_audit_logs, get_overdue_report, read_ai_alerts
import logging

router = APIRouter(prefix="/logs", tags=["logs"])
logger = logging.getLogger(__name__)


@router.post("", response_model=LogsResponse)
async def get_logs(req: LogsRequest):
    client = TaskoraClient(req.token)
    try:
        result = await read_audit_logs(client, req.workspace_id, req.limit, req.filter_action)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    entries = []
    for i, log in enumerate(result.get("logs", [])):
        entries.append(LogEntry(
            id=log.get("id", i),
            action=log.get("action", "unknown"),
            actor=log.get("actor_name") or log.get("actor_email"),
            target=log.get("target_type"),
            meta=log.get("meta"),
            created_at=str(log.get("created_at", "")),
        ))

    return LogsResponse(
        workspace_id=req.workspace_id,
        entries=entries,
        total=result.get("total", len(entries)),
        anomalies=result.get("anomalies", []),
        tool_calls_made=1,
    )
