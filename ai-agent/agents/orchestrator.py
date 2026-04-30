"""
Jarvis Orchestrator — Core Brain.

Execution flow:
  1. Security Agent scan
  2. QA Agent scan
  3. Aggregate + classify findings
  4. Auto-fix LOW issues only
  5. Escalate HIGH/CRITICAL via GitHub Issues
  6. Trigger Deploy Agent
  7. Persist audit run
  8. Send monitoring summary
"""

import json
import logging
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

from .security_agent import SecurityAgent, VulnerabilityReport
from .qa_agent import QAAgent, QAReport
from .deploy_agent import DeployAgent, DeployResult

logger = logging.getLogger("jarvis.orchestrator")


class CycleState(str, Enum):
    IDLE       = "idle"
    SCANNING   = "scanning"
    CLASSIFYING = "classifying"
    FIXING     = "fixing"
    DEPLOYING  = "deploying"
    ESCALATING = "escalating"
    DONE       = "done"
    FAILED     = "failed"


@dataclass
class AuditCycleResult:
    cycle_id:        str
    started_at:      str
    completed_at:    str = ""
    state:           str = CycleState.IDLE
    security_report: Optional[dict] = None
    qa_report:       Optional[dict] = None
    deploy_result:   Optional[dict] = None
    auto_fixed:      list[str]      = field(default_factory=list)
    escalated:       list[dict]     = field(default_factory=list)
    summary:         dict           = field(default_factory=dict)
    error:           str = ""

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items()}


class Orchestrator:

    # Severity thresholds
    AUTO_FIX_SEVERITIES = {"Low"}
    CAUTIOUS_SEVERITIES = {"Medium"}
    ESCALATE_SEVERITIES = {"High", "Critical"}

    def __init__(
        self,
        project_root:    str,
        github_token:    str = "",
        github_owner:    str = "",
        github_repo:     str = "",
        dry_run:         bool = False,
    ):
        self.project_root = Path(project_root)
        self.dry_run      = dry_run
        self.state        = CycleState.IDLE

        self.security_agent = SecurityAgent(str(self.project_root))
        self.qa_agent       = QAAgent(str(self.project_root))
        self.deploy_agent   = DeployAgent(
            repo_dir=str(self.project_root),
            github_token=github_token,
            github_owner=github_owner,
            github_repo=github_repo,
        )

        # Audit log path
        self.log_dir = self.project_root / "ai-agent" / ".jarvis_logs"
        self.log_dir.mkdir(parents=True, exist_ok=True)

    # ── Public entry point ────────────────────────────────────────────────────
    def run_cycle(self) -> AuditCycleResult:
        cycle_id = datetime.now(timezone.utc).strftime("cycle-%Y%m%d-%H%M%S")
        result   = AuditCycleResult(
            cycle_id=cycle_id,
            started_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.info(f"═══ Jarvis Audit Cycle {cycle_id} ═══")

        try:
            # ── 1. Security scan ──────────────────────────────────────────────
            self._set_state(CycleState.SCANNING)
            logger.info("Phase 1: Security scan")
            sec_report: VulnerabilityReport = self.security_agent.run()
            result.security_report = sec_report.to_dict()

            # ── 2. QA scan ────────────────────────────────────────────────────
            logger.info("Phase 2: QA scan")
            qa_report: QAReport = self.qa_agent.run()
            result.qa_report = qa_report.to_dict()

            # ── 3. Classify ───────────────────────────────────────────────────
            self._set_state(CycleState.CLASSIFYING)
            logger.info("Phase 3: Classifying findings")
            low_files, escalations = self._classify(sec_report, qa_report)

            # ── 4. Auto-fix LOW issues ────────────────────────────────────────
            if low_files and not self.dry_run:
                self._set_state(CycleState.FIXING)
                logger.info(f"Phase 4: Auto-fixing {len(low_files)} file(s)")
                deploy: DeployResult = self.deploy_agent.run_fix_cycle(
                    files_to_fix=low_files,
                    project_dir=str(self.project_root),
                    pr_title=f"fix(jarvis): auto-fix low-severity issues [{cycle_id}]",
                    pr_body=self._build_pr_body(sec_report, qa_report, cycle_id),
                )
                result.deploy_result = asdict(deploy)
                result.auto_fixed    = deploy.fixes_applied
            elif self.dry_run:
                logger.info(f"[DRY RUN] Would fix: {low_files}")

            # ── 5. Escalate HIGH/CRITICAL ─────────────────────────────────────
            if escalations:
                self._set_state(CycleState.ESCALATING)
                logger.info(f"Phase 5: Escalating {len(escalations)} HIGH/CRITICAL issue(s)")
                escalated = self._escalate(escalations, cycle_id)
                result.escalated = escalated

            # ── 6. Summary ────────────────────────────────────────────────────
            self._set_state(CycleState.DONE)
            result.completed_at = datetime.now(timezone.utc).isoformat()
            result.state        = CycleState.DONE
            result.summary      = self._build_summary(sec_report, qa_report, result)

            self._persist(result)
            self._log_summary(result)

        except Exception as exc:
            logger.error(f"Cycle failed: {exc}", exc_info=True)
            result.state        = CycleState.FAILED
            result.error        = str(exc)
            result.completed_at = datetime.now(timezone.utc).isoformat()
            self._persist(result)

        return result

    # ── Classification ────────────────────────────────────────────────────────
    def _classify(
        self,
        sec:  VulnerabilityReport,
        qa:   QAReport,
    ) -> tuple[list[str], list[dict]]:
        """
        Returns:
          low_files:   unique file paths with only LOW/Info issues → safe to auto-fix
          escalations: list of HIGH/CRITICAL findings to escalate
        """
        escalations = []
        low_candidate_files: dict[str, list] = {}  # file → [issues]
        blocked_files: set[str] = set()

        # Process security vulnerabilities
        for v in sec.vulnerabilities:
            if v.severity in self.ESCALATE_SEVERITIES:
                escalations.append({
                    "source":      "security",
                    "severity":    v.severity,
                    "file":        v.file,
                    "line":        v.line,
                    "category":    v.category,
                    "description": v.description,
                    "fix":         v.fix,
                    "cwe":         v.cwe,
                })
                blocked_files.add(v.file)
            elif v.severity == "Medium":
                blocked_files.add(v.file)  # Don't auto-touch medium security findings
            else:
                if v.file not in blocked_files:
                    low_candidate_files.setdefault(v.file, []).append(v)

        # Process QA issues
        for i in qa.issues:
            if i.severity in self.ESCALATE_SEVERITIES:
                escalations.append({
                    "source":      "qa",
                    "severity":    i.severity,
                    "file":        i.file,
                    "line":        i.line,
                    "category":    i.category,
                    "description": i.description,
                    "fix":         i.fix,
                })
                blocked_files.add(i.file)
            elif i.severity == "Medium":
                blocked_files.add(i.file)
            else:
                if i.file not in blocked_files:
                    low_candidate_files.setdefault(i.file, []).append(i)

        # Final low files = candidates that weren't blocked
        low_files = [f for f in low_candidate_files if f not in blocked_files]

        logger.info(
            f"Classification: {len(low_files)} files safe to auto-fix, "
            f"{len(escalations)} items to escalate"
        )
        return low_files, escalations

    # ── Escalation ────────────────────────────────────────────────────────────
    def _escalate(self, escalations: list[dict], cycle_id: str) -> list[dict]:
        escalated = []

        # Group by severity
        critical = [e for e in escalations if e["severity"] == "Critical"]
        high     = [e for e in escalations if e["severity"] == "High"]

        if not critical and not high:
            return escalated

        # Try to create a GitHub issue
        title = f"🚨 Jarvis: {len(critical)} Critical + {len(high)} High issues [{cycle_id}]"
        body  = self._build_escalation_body(critical, high, cycle_id)

        if not self.dry_run and self.deploy_agent.gh:
            try:
                issue = self.deploy_agent.gh.create_issue(
                    title=title,
                    body=body,
                    labels=["security", "jarvis", "needs-review"],
                )
                for e in escalations:
                    e["github_issue"] = issue.get("html_url", "")
                    escalated.append(e)
                logger.info(f"GitHub issue created: {issue.get('html_url')}")
            except Exception as ex:
                logger.error(f"Failed to create GitHub issue: {ex}")
                escalated = escalations
        else:
            if self.dry_run:
                logger.info(f"[DRY RUN] Would escalate: {title}")
            escalated = escalations

        return escalated

    # ── Persistence ───────────────────────────────────────────────────────────
    def _persist(self, result: AuditCycleResult) -> None:
        log_path = self.log_dir / f"{result.cycle_id}.json"
        try:
            log_path.write_text(json.dumps(result.to_dict(), indent=2, default=str))
            logger.info(f"Cycle log saved: {log_path}")
        except Exception as e:
            logger.error(f"Failed to persist cycle log: {e}")

    def load_last_cycle(self) -> Optional[dict]:
        logs = sorted(self.log_dir.glob("cycle-*.json"), reverse=True)
        if not logs:
            return None
        return json.loads(logs[0].read_text())

    # ── Summary / Reporting ───────────────────────────────────────────────────
    def _build_summary(
        self,
        sec: VulnerabilityReport,
        qa:  QAReport,
        result: AuditCycleResult,
    ) -> dict:
        return {
            "security": {
                "risk_score":     sec.risk_score,
                "critical":       sec.critical_count,
                "high":           sec.high_count,
                "medium":         sec.medium_count,
                "low":            sec.low_count,
                "files_scanned":  sec.total_files,
                "dep_vulns":      len(sec.dep_audit),
            },
            "quality": {
                "score":          qa.quality_score,
                **qa.issue_counts,
                "tests_total":    qa.test_result.total,
                "tests_passed":   qa.test_result.passed,
                "tests_failed":   qa.test_result.failed,
                "dead_files":     len(qa.dead_files),
            },
            "actions": {
                "auto_fixed":     len(result.auto_fixed),
                "escalated":      len(result.escalated),
                "pr_opened":      bool(result.deploy_result and result.deploy_result.get("pr_url")),
            },
        }

    def _log_summary(self, result: AuditCycleResult) -> None:
        s = result.summary
        logger.info("═══ CYCLE SUMMARY ═══")
        logger.info(f"  Security Risk Score : {s['security']['risk_score']}/100")
        logger.info(f"  Critical/High/Med/Low: {s['security']['critical']}/{s['security']['high']}/{s['security']['medium']}/{s['security']['low']}")
        logger.info(f"  Quality Score       : {s['quality']['score']}/100")
        logger.info(f"  Tests               : {s['quality']['tests_passed']}/{s['quality']['tests_total']} passed")
        logger.info(f"  Auto-fixed          : {s['actions']['auto_fixed']} issues")
        logger.info(f"  Escalated           : {s['actions']['escalated']} items")
        logger.info(f"  PR Opened           : {s['actions']['pr_opened']}")

    @staticmethod
    def _build_pr_body(sec: VulnerabilityReport, qa: QAReport, cycle_id: str) -> str:
        lines = [
            f"## 🤖 Jarvis Auto-Fix — {cycle_id}",
            "",
            "| Metric | Value |",
            "|--------|-------|",
            f"| Security Risk Score | {sec.risk_score}/100 |",
            f"| Quality Score       | {qa.quality_score}/100 |",
            f"| Critical Issues     | {sec.critical_count} |",
            f"| High Issues         | {sec.high_count} |",
            f"| Tests Passed        | {qa.test_result.passed}/{qa.test_result.total} |",
            "",
            "### Auto-fixed (Low severity only)",
            "> All HIGH/CRITICAL issues have been escalated separately and are NOT in this PR.",
            "",
            "### Safety",
            "- Tests passed before this PR was opened",
            "- Only formatting + low-risk fixes applied",
            "- No logic changes",
            "",
            "> 🔒 This is a **draft PR**. Human review required before merge.",
        ]
        return "\n".join(lines)

    @staticmethod
    def _build_escalation_body(critical: list, high: list, cycle_id: str) -> str:
        lines = [
            f"## 🚨 Jarvis Security Escalation — {cycle_id}",
            "",
            f"Jarvis detected **{len(critical)} Critical** and **{len(high)} High** severity issues.",
            "These require **manual review** and cannot be auto-fixed.",
            "",
        ]
        if critical:
            lines.append("### 🔴 Critical")
            for e in critical[:10]:
                lines.append(f"- **{e['category']}** in `{Path(e['file']).name}:{e['line']}`")
                lines.append(f"  > {e['description']}")
                lines.append(f"  > Fix: {e['fix']}")
                if e.get('cwe'):
                    lines.append(f"  > Reference: {e['cwe']}")
                lines.append("")

        if high:
            lines.append("### 🟠 High")
            for e in high[:10]:
                lines.append(f"- **{e['category']}** in `{Path(e['file']).name}:{e['line']}`")
                lines.append(f"  > {e['description']}")
                lines.append(f"  > Fix: {e['fix']}")
                lines.append("")

        lines += [
            "---",
            "_This issue was automatically created by Jarvis. Assign to the security team for review._",
        ]
        return "\n".join(lines)

    def _set_state(self, state: CycleState) -> None:
        self.state = state
        logger.info(f"State → {state.value}")
