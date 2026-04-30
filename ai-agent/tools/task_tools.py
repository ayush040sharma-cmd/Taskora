"""
Task management tools — Claude calls these to read and write Taskora tasks.
"""
from typing import Optional, List, Dict, Any
from services.taskora_client import TaskoraClient
import logging

logger = logging.getLogger(__name__)


async def fetch_tasks(client: TaskoraClient, workspace_id: int) -> Dict:
    """Fetch all active tasks from the workspace."""
    try:
        tasks = await client.fetch_tasks(workspace_id)
        summary = {
            "total": len(tasks),
            "by_status": {},
            "by_priority": {},
            "overdue": [],
            "unassigned": [],
            "tasks": tasks[:50],  # cap for context window
        }
        from datetime import date
        today = date.today().isoformat()
        for t in tasks:
            s = t.get("status", "unknown")
            p = t.get("priority", "unknown")
            summary["by_status"][s] = summary["by_status"].get(s, 0) + 1
            summary["by_priority"][p] = summary["by_priority"].get(p, 0) + 1
            if t.get("due_date") and t["due_date"] < today and s != "done":
                summary["overdue"].append({"id": t["id"], "title": t["title"], "due_date": t["due_date"]})
            if not t.get("assigned_user_id"):
                summary["unassigned"].append({"id": t["id"], "title": t["title"]})
        return summary
    except Exception as e:
        logger.error(f"fetch_tasks error: {e}")
        return {"error": str(e)}


async def create_task(client: TaskoraClient, workspace_id: int, title: str,
                      description: str = None, priority: str = "medium",
                      type: str = "task", assigned_user_id: int = None,
                      due_date: str = None, sprint_id: int = None) -> Dict:
    """Create a new task in the workspace."""
    try:
        payload = {
            "workspace_id": workspace_id,
            "title": title,
            "description": description or "",
            "priority": priority,
            "type": type,
            "status": "todo",
        }
        if assigned_user_id:
            payload["assigned_user_id"] = assigned_user_id
        if due_date:
            payload["due_date"] = due_date
        if sprint_id:
            payload["sprint_id"] = sprint_id

        task = await client.create_task(payload)
        return {"success": True, "task_id": task.get("id"), "title": task.get("title"), "status": task.get("status")}
    except Exception as e:
        logger.error(f"create_task error: {e}")
        return {"success": False, "error": str(e)}


async def update_task_status(client: TaskoraClient, task_id: int, status: str,
                              progress: int = None) -> Dict:
    """Update a task's status and optional progress percentage."""
    try:
        payload = {"status": status}
        if progress is not None:
            payload["progress"] = max(0, min(100, progress))
        result = await client.update_task(task_id, payload)
        return {"success": True, "task_id": task_id, "new_status": status}
    except Exception as e:
        logger.error(f"update_task_status error: {e}")
        return {"success": False, "error": str(e)}


async def get_workspace_summary(client: TaskoraClient, workspace_id: int) -> Dict:
    """Get high-level workspace statistics."""
    try:
        return await client.get_workspace_summary(workspace_id)
    except Exception as e:
        return {"error": str(e)}


async def get_workload_overview(client: TaskoraClient, workspace_id: int) -> Dict:
    """Get team workload and capacity overview."""
    try:
        workload = await client.get_workload(workspace_id)
        members = await client.get_members(workspace_id)
        capacity = await client.get_team_capacity(workspace_id)
        return {
            "workload": workload,
            "member_count": len(members),
            "capacity_summary": capacity,
        }
    except Exception as e:
        return {"error": str(e)}
