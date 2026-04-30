"""
Tool Registry — defines all tools Claude can call, maps names to async handlers.
Claude's tool_use block will contain a `name` and `input` dict.
The registry dispatches to the correct Python function.
"""
from typing import Dict, List, Any, Callable
from services.taskora_client import TaskoraClient
import logging

logger = logging.getLogger(__name__)

# ── Anthropic tool schemas (what Claude sees) ─────────────────────────────────

TOOL_DEFINITIONS: List[Dict] = [
    {
        "name": "fetch_tasks",
        "description": "Fetch all tasks in a workspace. Returns counts by status/priority, overdue list, and unassigned tasks.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "integer", "description": "Taskora workspace ID"}
            },
            "required": ["workspace_id"]
        }
    },
    {
        "name": "create_task",
        "description": "Create a new task in Taskora.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "integer"},
                "title":        {"type": "string"},
                "description":  {"type": "string"},
                "priority":     {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                "type":         {"type": "string", "enum": ["task", "bug", "story", "rfp", "proposal", "presentation", "upgrade", "poc"]},
                "assigned_user_id": {"type": "integer"},
                "due_date":     {"type": "string", "description": "ISO date YYYY-MM-DD"},
                "sprint_id":    {"type": "integer"},
            },
            "required": ["workspace_id", "title"]
        }
    },
    {
        "name": "update_task_status",
        "description": "Update a task's status (todo, inprogress, review, done) and optionally its progress percentage.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id":  {"type": "integer"},
                "status":   {"type": "string", "enum": ["todo", "inprogress", "review", "done"]},
                "progress": {"type": "integer", "minimum": 0, "maximum": 100},
            },
            "required": ["task_id", "status"]
        }
    },
    {
        "name": "get_workspace_summary",
        "description": "Get high-level stats for a workspace: total tasks, completed this week, due soon, active tasks.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "integer"}
            },
            "required": ["workspace_id"]
        }
    },
    {
        "name": "get_workload_overview",
        "description": "Get team workload: who is overloaded, member count, and capacity data.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "integer"}
            },
            "required": ["workspace_id"]
        }
    },
    {
        "name": "collect_workspace_snapshot",
        "description": "Collect a comprehensive audit snapshot of the workspace: tasks, workload, health, alerts, anomalies.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "integer"}
            },
            "required": ["workspace_id"]
        }
    },
    {
        "name": "collect_ux_signals",
        "description": "Scan the frontend source code for UX patterns: loading states, error handling, empty states, accessibility, responsiveness.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "read_audit_logs",
        "description": "Read Taskora audit logs with anomaly detection.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id":   {"type": "integer"},
                "limit":          {"type": "integer", "default": 50},
                "filter_action":  {"type": "string"},
            },
            "required": ["workspace_id"]
        }
    },
    {
        "name": "get_overdue_report",
        "description": "Get a detailed report of all overdue tasks sorted by how many days late.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "integer"}
            },
            "required": ["workspace_id"]
        }
    },
    {
        "name": "read_source_file",
        "description": "Read a frontend or backend source file for code analysis.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Relative or absolute path to file"}
            },
            "required": ["file_path"]
        }
    },
    {
        "name": "scan_for_patterns",
        "description": "Search for a regex pattern across project source files.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern":   {"type": "string", "description": "Regex pattern to search"},
                "directory": {"type": "string"},
                "extension": {"type": "string", "description": "File extension filter e.g. .jsx"},
            },
            "required": ["pattern"]
        }
    },
    {
        "name": "generate_test_cases",
        "description": "Generate structured test case templates for a source file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path":     {"type": "string"},
                "function_name": {"type": "string"},
            },
            "required": ["file_path"]
        }
    },
    {
        "name": "read_ai_alerts",
        "description": "Get AI-generated risk alerts and workspace health score.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "integer"}
            },
            "required": ["workspace_id"]
        }
    },
]


# ── Dispatcher ────────────────────────────────────────────────────────────────

async def dispatch_tool(name: str, inputs: Dict, client: TaskoraClient) -> Any:
    """Route a tool call to the correct Python function."""
    from tools.task_tools import (fetch_tasks, create_task, update_task_status,
                                   get_workspace_summary, get_workload_overview)
    from tools.code_tools import read_source_file, scan_for_patterns, generate_test_cases
    from tools.log_tools import read_audit_logs, read_ai_alerts, get_overdue_report
    from tools.audit_tools import collect_workspace_snapshot, collect_ux_signals

    dispatch: Dict[str, Callable] = {
        "fetch_tasks":              lambda i: fetch_tasks(client, i["workspace_id"]),
        "create_task":              lambda i: create_task(client, **i),
        "update_task_status":       lambda i: update_task_status(client, i["task_id"], i["status"], i.get("progress")),
        "get_workspace_summary":    lambda i: get_workspace_summary(client, i["workspace_id"]),
        "get_workload_overview":    lambda i: get_workload_overview(client, i["workspace_id"]),
        "collect_workspace_snapshot": lambda i: collect_workspace_snapshot(client, i["workspace_id"]),
        "collect_ux_signals":       lambda i: collect_ux_signals(),
        "read_audit_logs":          lambda i: read_audit_logs(client, i["workspace_id"], i.get("limit", 50), i.get("filter_action")),
        "get_overdue_report":       lambda i: get_overdue_report(client, i["workspace_id"]),
        "read_source_file":         lambda i: read_source_file(i["file_path"]),
        "scan_for_patterns":        lambda i: scan_for_patterns(i["pattern"], i.get("directory"), i.get("extension")),
        "generate_test_cases":      lambda i: generate_test_cases(i["file_path"], i.get("function_name")),
        "read_ai_alerts":           lambda i: read_ai_alerts(client, i["workspace_id"]),
    }

    handler = dispatch.get(name)
    if not handler:
        return {"error": f"Unknown tool: {name}"}
    try:
        return await handler(inputs)
    except Exception as e:
        logger.error(f"Tool {name} failed: {e}")
        return {"error": str(e), "tool": name}
