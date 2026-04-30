"""
Log reading and anomaly detection tools.
"""
from typing import Dict, List, Optional
from services.taskora_client import TaskoraClient
import logging
from collections import Counter
from datetime import datetime

logger = logging.getLogger(__name__)


async def read_audit_logs(client: TaskoraClient, workspace_id: int,
                          limit: int = 50, filter_action: str = None) -> Dict:
    """Read Taskora audit logs with optional action filter."""
    try:
        logs = await client.get_audit_logs(workspace_id, limit=limit)
        if filter_action:
            logs = [l for l in logs if filter_action.lower() in l.get("action", "").lower()]

        # Anomaly detection
        anomalies = []
        action_counts = Counter(l.get("action") for l in logs)

        # Flag bulk deletions
        if action_counts.get("task_deleted", 0) >= 5:
            anomalies.append(f"⚠️ High task deletion rate: {action_counts['task_deleted']} deletions detected")

        # Flag repeated permission changes
        if action_counts.get("capacity_changed", 0) >= 10:
            anomalies.append(f"⚠️ Unusual capacity change volume: {action_counts['capacity_changed']} changes")

        # Flag approval rejections
        rejections = action_counts.get("approval_rejected", 0)
        if rejections >= 3:
            anomalies.append(f"⚠️ Multiple approval rejections: {rejections} rejections")

        return {
            "logs": logs,
            "total": len(logs),
            "action_breakdown": dict(action_counts.most_common(10)),
            "anomalies": anomalies,
        }
    except Exception as e:
        logger.error(f"read_audit_logs error: {e}")
        return {"error": str(e)}


async def read_ai_alerts(client: TaskoraClient, workspace_id: int) -> Dict:
    """Read AI-generated risk alerts for the workspace."""
    try:
        alerts = await client.get_ai_alerts(workspace_id)
        health  = await client.get_workspace_health(workspace_id)
        return {
            "health_score": health.get("score", "unknown"),
            "alerts": alerts,
            "alert_count": len(alerts),
        }
    except Exception as e:
        return {"error": str(e)}


async def get_overdue_report(client: TaskoraClient, workspace_id: int) -> Dict:
    """Generate a concise overdue tasks report."""
    try:
        from datetime import date
        tasks = await client.fetch_tasks(workspace_id)
        today = date.today().isoformat()

        overdue = [
            {
                "id": t["id"],
                "title": t["title"],
                "due_date": t["due_date"],
                "priority": t.get("priority"),
                "assignee": t.get("assignee_name"),
                "days_late": (date.today() - datetime.strptime(t["due_date"], "%Y-%m-%d").date()).days
                             if t.get("due_date") else None,
            }
            for t in tasks
            if t.get("due_date") and t["due_date"] < today and t.get("status") != "done"
        ]
        overdue.sort(key=lambda x: x.get("days_late") or 0, reverse=True)

        return {
            "overdue_count": len(overdue),
            "critical_overdue": [o for o in overdue if o["priority"] in ("high", "critical")],
            "all_overdue": overdue[:20],
        }
    except Exception as e:
        return {"error": str(e)}
