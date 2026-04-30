"""
Audit data collection tools — gathers signals for Claude to synthesize into issues.
"""
from typing import Dict, List
from services.taskora_client import TaskoraClient
from tools.task_tools import fetch_tasks, get_workload_overview
from tools.log_tools import read_audit_logs, read_ai_alerts, get_overdue_report
import logging

logger = logging.getLogger(__name__)


async def collect_workspace_snapshot(client: TaskoraClient, workspace_id: int) -> Dict:
    """
    Aggregate everything Claude needs to audit the workspace:
    tasks, workload, members, health, alerts, overdue items.
    """
    try:
        tasks_data     = await fetch_tasks(client, workspace_id)
        workload_data  = await get_workload_overview(client, workspace_id)
        overdue_data   = await get_overdue_report(client, workspace_id)
        health_data    = await read_ai_alerts(client, workspace_id)
        audit_logs     = await read_audit_logs(client, workspace_id, limit=100)
        sprints        = await client.get_sprints(workspace_id)
        members        = await client.get_members(workspace_id)

        # Derived signals
        unassigned_pct = (
            len(tasks_data.get("unassigned", [])) / max(tasks_data.get("total", 1), 1) * 100
        )
        overloaded_members = [
            m for m in workload_data.get("workload", [])
            if m.get("load_percent", 0) >= 90
        ]

        return {
            "task_summary": {
                "total": tasks_data.get("total"),
                "by_status": tasks_data.get("by_status"),
                "by_priority": tasks_data.get("by_priority"),
                "overdue_count": overdue_data.get("overdue_count"),
                "overdue_critical": len(overdue_data.get("critical_overdue", [])),
                "unassigned_count": len(tasks_data.get("unassigned", [])),
                "unassigned_pct": round(unassigned_pct, 1),
            },
            "team": {
                "member_count": len(members),
                "overloaded_members": overloaded_members,
                "capacity_issues": [
                    m for m in members if m.get("on_leave") or m.get("travel_mode")
                ],
            },
            "sprints": {
                "total": len(sprints),
                "active": [s for s in sprints if s.get("status") == "active"],
                "overdue_sprints": [
                    s for s in sprints
                    if s.get("end_date") and s["end_date"] < __import__("datetime").date.today().isoformat()
                       and s.get("status") != "completed"
                ],
            },
            "health": {
                "score": health_data.get("health_score"),
                "alert_count": health_data.get("alert_count"),
                "alerts": health_data.get("alerts", [])[:10],
            },
            "anomalies": audit_logs.get("anomalies", []),
            "recent_actions": audit_logs.get("action_breakdown", {}),
        }
    except Exception as e:
        logger.error(f"collect_workspace_snapshot error: {e}")
        return {"error": str(e)}


async def collect_ux_signals() -> Dict:
    """
    Static analysis of frontend components to flag known UX patterns.
    Returns structural signals — Claude synthesizes these into UX issues.
    """
    from tools.code_tools import scan_for_patterns, list_project_files

    signals = {}

    # Check for loading states
    loading_states = await scan_for_patterns(r"setLoading\(true\)", extension=".jsx")
    loading_fallbacks = await scan_for_patterns(r"if.*loading.*return", extension=".jsx")
    signals["loading_state_coverage"] = {
        "components_with_loading": loading_states.get("total", 0),
        "components_with_fallback": loading_fallbacks.get("total", 0),
    }

    # Check for error handling
    error_catches = await scan_for_patterns(r"catch\s*\(", extension=".jsx")
    error_displays = await scan_for_patterns(r"setError\(", extension=".jsx")
    signals["error_handling"] = {
        "try_catch_blocks": error_catches.get("total", 0),
        "error_state_usage": error_displays.get("total", 0),
    }

    # Check for empty states
    empty_states = await scan_for_patterns(r'No.*tasks|empty|no data', extension=".jsx")
    signals["empty_states"] = {"coverage": empty_states.get("total", 0)}

    # Check for accessibility
    aria_labels = await scan_for_patterns(r'aria-label', extension=".jsx")
    signals["accessibility"] = {"aria_label_count": aria_labels.get("total", 0)}

    # Check for mobile responsiveness
    media_queries = await scan_for_patterns(r'@media', extension=".css")
    signals["responsiveness"] = {"media_query_count": media_queries.get("total", 0)}

    return signals
