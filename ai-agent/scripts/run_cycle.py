#!/usr/bin/env python
"""
CLI script — manually trigger a full Jarvis orchestrator cycle.

Usage:
  python scripts/run_cycle.py              # real run
  python scripts/run_cycle.py --dry-run    # simulation only
  python scripts/run_cycle.py --json       # output result as JSON
"""

import argparse
import json
import logging
import sys
from pathlib import Path

# Add project root to path so imports resolve
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


def main():
    parser = argparse.ArgumentParser(description="Jarvis Manual Audit Cycle")
    parser.add_argument("--dry-run", action="store_true", help="Simulate fixes without writing files or opening PRs")
    parser.add_argument("--json",    action="store_true", help="Print full result JSON to stdout")
    parser.add_argument("--project-root", default=None,  help="Override project root path")
    args = parser.parse_args()

    from config import settings
    from agents.orchestrator import Orchestrator

    project_root = args.project_root or str(Path(__file__).resolve().parents[2])

    print(f"\n{'='*60}")
    print(f"  Jarvis Audit Cycle {'(DRY RUN) ' if args.dry_run else ''}— {project_root}")
    print(f"{'='*60}\n")

    orch = Orchestrator(
        project_root=project_root,
        github_token=settings.github_token,
        github_owner=settings.github_owner,
        github_repo=settings.github_repo,
        dry_run=args.dry_run,
    )

    result = orch.run_cycle()

    if args.json:
        print(json.dumps(result.to_dict(), indent=2, default=str))
    else:
        s = result.summary
        sec = s.get("security", {})
        qual = s.get("quality", {})
        act = s.get("actions", {})

        print(f"\n{'─'*60}")
        print(f"  Cycle ID   : {result.cycle_id}")
        print(f"  State      : {result.state}")
        print(f"  Duration   : {result.started_at} → {result.completed_at}")
        print(f"{'─'*60}")
        print(f"  Security Risk Score : {sec.get('risk_score', '?')}/100")
        print(f"  Critical / High     : {sec.get('critical', 0)} / {sec.get('high', 0)}")
        print(f"  Medium / Low        : {sec.get('medium', 0)} / {sec.get('low', 0)}")
        print(f"  Dep Vulnerabilities : {sec.get('dep_vulns', 0)}")
        print(f"{'─'*60}")
        print(f"  Quality Score       : {qual.get('score', '?')}/100")
        print(f"  Tests               : {qual.get('tests_passed', 0)}/{qual.get('tests_total', 0)} passed")
        print(f"  Dead Files          : {qual.get('dead_files', 0)}")
        print(f"{'─'*60}")
        print(f"  Auto-fixed          : {act.get('auto_fixed', 0)} issues")
        print(f"  Escalated           : {act.get('escalated', 0)} items")
        print(f"  PR Opened           : {act.get('pr_opened', False)}")
        if result.error:
            print(f"\n  ERROR: {result.error}")
        print(f"{'─'*60}\n")

    sys.exit(0 if result.state == "done" else 1)


if __name__ == "__main__":
    main()
