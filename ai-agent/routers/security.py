"""
Security & QA REST endpoints — expose Jarvis agent results to the frontend.

Routes:
  POST /api/security/scan      — run full orchestrator cycle (async job)
  GET  /api/security/status    — last cycle summary
  GET  /api/security/report    — full last cycle JSON
  POST /api/security/fix       — trigger auto-fix only (dry_run aware)
"""

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("jarvis.routers.security")
router = APIRouter(tags=["security"])

_PROJECT_ROOT = str(Path(__file__).resolve().parents[2])  # …/Taskora

_last_cycle: dict = {}
_cycle_running: bool = False


# ── Request / Response models ─────────────────────────────────────────────────

class ScanRequest(BaseModel):
    dry_run: Optional[bool] = None   # overrides config if set


class ScanResponse(BaseModel):
    accepted: bool
    message: str


# ── Background worker ─────────────────────────────────────────────────────────

def _run_cycle_bg(dry_run: bool) -> None:
    global _last_cycle, _cycle_running
    try:
        from config import settings
        from agents.orchestrator import Orchestrator

        orch = Orchestrator(
            project_root=_PROJECT_ROOT,
            github_token=settings.github_token,
            github_owner=settings.github_owner,
            github_repo=settings.github_repo,
            dry_run=dry_run,
        )
        result = orch.run_cycle()
        _last_cycle = result.to_dict()
        logger.info(f"Background cycle {result.cycle_id} → {result.state}")
    except Exception as exc:
        logger.error(f"Background cycle failed: {exc}", exc_info=True)
        _last_cycle = {"error": str(exc), "state": "failed"}
    finally:
        _cycle_running = False


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/security/scan", response_model=ScanResponse)
async def trigger_scan(req: ScanRequest, background_tasks: BackgroundTasks):
    global _cycle_running

    if _cycle_running:
        return ScanResponse(accepted=False, message="A scan is already running. Try again later.")

    from config import settings
    effective_dry_run = req.dry_run if req.dry_run is not None else settings.dry_run

    _cycle_running = True
    background_tasks.add_task(_run_cycle_bg, effective_dry_run)

    return ScanResponse(
        accepted=True,
        message=f"Audit cycle started {'(dry run)' if effective_dry_run else ''}.",
    )


@router.get("/security/status")
async def scan_status():
    if not _last_cycle:
        return {"status": "no_cycle_run", "message": "No audit cycle has been run yet."}

    s = _last_cycle.get("summary", {})
    return {
        "cycle_id":    _last_cycle.get("cycle_id"),
        "state":       _last_cycle.get("state"),
        "started_at":  _last_cycle.get("started_at"),
        "completed_at": _last_cycle.get("completed_at"),
        "running":     _cycle_running,
        "security": s.get("security", {}),
        "quality":  s.get("quality", {}),
        "actions":  s.get("actions", {}),
        "error":    _last_cycle.get("error", ""),
    }


@router.get("/security/report")
async def full_report():
    if not _last_cycle:
        raise HTTPException(status_code=404, detail="No audit cycle has been run yet.")
    return _last_cycle


@router.post("/security/fix")
async def trigger_fix(background_tasks: BackgroundTasks):
    """Force an auto-fix-only pass (dry_run=False). Skips escalation."""
    global _cycle_running

    if _cycle_running:
        raise HTTPException(status_code=409, detail="A scan/fix cycle is already running.")

    _cycle_running = True
    background_tasks.add_task(_run_cycle_bg, False)
    return {"accepted": True, "message": "Fix cycle started."}
