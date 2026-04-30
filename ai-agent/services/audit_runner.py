"""
APScheduler-based daily audit runner.
Triggers the full Orchestrator cycle on a schedule and optionally
sends a push notification / logs a summary.
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("jarvis.audit_runner")

_PROJECT_ROOT = str(Path(__file__).resolve().parents[2])  # …/Taskora


def run_audit_cycle() -> None:
    """Called by APScheduler. Runs the full Jarvis orchestration cycle."""
    logger.info(f"[AuditRunner] Scheduled cycle starting at {datetime.now(timezone.utc).isoformat()}")
    try:
        from config import settings
        from agents.orchestrator import Orchestrator

        orch = Orchestrator(
            project_root=_PROJECT_ROOT,
            github_token=settings.github_token,
            github_owner=settings.github_owner,
            github_repo=settings.github_repo,
            dry_run=settings.dry_run,
        )
        result = orch.run_cycle()

        s = result.summary
        logger.info(
            f"[AuditRunner] Cycle {result.cycle_id} complete — "
            f"state={result.state} "
            f"risk={s.get('security', {}).get('risk_score', '?')}/100 "
            f"quality={s.get('quality', {}).get('score', '?')}/100 "
            f"auto_fixed={s.get('actions', {}).get('auto_fixed', 0)} "
            f"escalated={s.get('actions', {}).get('escalated', 0)}"
        )
    except Exception as exc:
        logger.error(f"[AuditRunner] Cycle failed: {exc}", exc_info=True)


def start_scheduler(hour: int | None = None) -> BackgroundScheduler:
    """
    Start and return the background scheduler.
    Defaults to the hour set in config (3 AM UTC).
    """
    from config import settings

    effective_hour = hour if hour is not None else settings.audit_schedule_hour

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        run_audit_cycle,
        trigger=CronTrigger(hour=effective_hour, minute=0),
        id="jarvis_daily_audit",
        name="Jarvis Daily Security & QA Audit",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    logger.info(f"Audit scheduler armed — fires daily at {effective_hour:02d}:00 UTC")
    return scheduler


def trigger_now() -> None:
    """Fire a one-shot cycle immediately (useful for manual triggers / CI)."""
    run_audit_cycle()
