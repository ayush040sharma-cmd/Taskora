"""
HTTP client for the Taskora Express backend.
All API calls go through this module — never call the backend directly from tools.
"""
import httpx
from typing import Optional, List, Dict, Any
from config import settings
import logging

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(30.0)


class TaskoraClient:
    def __init__(self, token: str):
        self.base = settings.taskora_api_url
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def _get(self, path: str, params: dict = None) -> Dict:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(f"{self.base}{path}", headers=self.headers, params=params)
            r.raise_for_status()
            return r.json()

    async def _post(self, path: str, body: dict) -> Dict:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(f"{self.base}{path}", headers=self.headers, json=body)
            r.raise_for_status()
            return r.json()

    async def _put(self, path: str, body: dict) -> Dict:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.put(f"{self.base}{path}", headers=self.headers, json=body)
            r.raise_for_status()
            return r.json()

    # ── Tasks ─────────────────────────────────────────────────────────────────

    async def fetch_tasks(self, workspace_id: int) -> List[Dict]:
        data = await self._get(f"/tasks/workspace/{workspace_id}")
        return data if isinstance(data, list) else data.get("tasks", [])

    async def create_task(self, payload: dict) -> Dict:
        return await self._post("/tasks", payload)

    async def update_task(self, task_id: int, payload: dict) -> Dict:
        return await self._put(f"/tasks/{task_id}", payload)

    async def get_task(self, task_id: int) -> Dict:
        return await self._get(f"/tasks/{task_id}")

    # ── Workspace ─────────────────────────────────────────────────────────────

    async def get_workspace_summary(self, workspace_id: int) -> Dict:
        return await self._get(f"/workspaces/{workspace_id}/summary")

    async def get_workspaces(self) -> List[Dict]:
        return await self._get("/workspaces")

    # ── Members ───────────────────────────────────────────────────────────────

    async def get_members(self, workspace_id: int) -> List[Dict]:
        data = await self._get("/members", params={"workspace_id": workspace_id})
        return data if isinstance(data, list) else []

    # ── Audit Logs ────────────────────────────────────────────────────────────

    async def get_audit_logs(self, workspace_id: int, limit: int = 50) -> List[Dict]:
        data = await self._get("/audit", params={"workspace_id": workspace_id, "limit": limit})
        return data if isinstance(data, list) else data.get("logs", [])

    # ── Workload ──────────────────────────────────────────────────────────────

    async def get_workload(self, workspace_id: int) -> List[Dict]:
        data = await self._get("/workload", params={"workspace_id": workspace_id})
        return data if isinstance(data, list) else []

    # ── Capacity ──────────────────────────────────────────────────────────────

    async def get_team_capacity(self, workspace_id: int) -> List[Dict]:
        data = await self._get(f"/capacity/team/{workspace_id}")
        return data if isinstance(data, list) else []

    # ── AI / Risk ─────────────────────────────────────────────────────────────

    async def get_workspace_health(self, workspace_id: int) -> Dict:
        return await self._get(f"/ai/health/{workspace_id}")

    async def get_ai_alerts(self, workspace_id: int) -> List[Dict]:
        data = await self._get(f"/ai/alerts/{workspace_id}")
        return data if isinstance(data, list) else []

    # ── Sprints ───────────────────────────────────────────────────────────────

    async def get_sprints(self, workspace_id: int) -> List[Dict]:
        data = await self._get("/sprints", params={"workspace_id": workspace_id})
        return data if isinstance(data, list) else []

    # ── Personal Dashboard ────────────────────────────────────────────────────

    async def get_personal_dashboard(self, workspace_id: int) -> Dict:
        return await self._get("/personal/dashboard", params={"workspace_id": workspace_id})
