"""
Auto Bug→Fix Pipeline
Flow: Issue → Root Cause Analysis → Fix Generation → Test Cases → Deployment Guide
"""
import uuid
from typing import Dict, List
from services.claude_client import simple_completion
from services.taskora_client import TaskoraClient
from tools.task_tools import create_task
import json
import logging

logger = logging.getLogger(__name__)


PIPELINE_SYSTEM = """You are a senior engineer. Given a bug or issue, you must:
1. Identify the root cause precisely
2. Write the exact code fix
3. Write test cases to validate the fix
4. Assess regression risk
5. Define deployment steps

Be concrete — provide real code, not pseudocode.
Return a JSON object with keys: root_cause, fix_code, test_cases, regression_risk, deployment_steps, estimated_hours
"""


async def run_fix_pipeline(issue: Dict, token: str, workspace_id: int = None,
                           auto_create_task: bool = True) -> Dict:
    """
    Run the complete bug→fix pipeline for a single issue.
    Returns the full pipeline result including fix code and test cases.
    """
    pipeline_id = str(uuid.uuid4())[:8]

    prompt = f"""
Issue Title: {issue.get('title', 'Unknown')}
Location: {issue.get('location', 'Unknown')}
Problem: {issue.get('problem', '')}
Root Cause Hint: {issue.get('root_cause', '')}
Priority: {issue.get('priority', 'medium')}
Category: {issue.get('category', 'bug')}

Run the full fix pipeline. Return valid JSON only.
"""

    raw = await simple_completion(prompt, system=PIPELINE_SYSTEM)

    # Parse JSON from response
    pipeline_result = {}
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            pipeline_result = json.loads(raw[start:end])
    except json.JSONDecodeError:
        pipeline_result = {
            "root_cause": "Could not parse structured response",
            "fix_code": raw,
            "test_cases": [],
            "regression_risk": "unknown",
            "deployment_steps": [],
            "estimated_hours": 4,
        }

    result = {
        "pipeline_id": pipeline_id,
        "issue": issue,
        "root_cause": pipeline_result.get("root_cause", ""),
        "fix_code": pipeline_result.get("fix_code", ""),
        "test_cases": pipeline_result.get("test_cases", []),
        "regression_risk": pipeline_result.get("regression_risk", "low"),
        "deployment_steps": pipeline_result.get("deployment_steps", []),
        "estimated_hours": pipeline_result.get("estimated_hours", 4),
    }

    # Optionally auto-create a task for the fix
    if auto_create_task and workspace_id and token:
        try:
            client = TaskoraClient(token)
            task_result = await create_task(
                client=client,
                workspace_id=workspace_id,
                title=f"[FIX] {issue.get('title', 'Bug Fix')}",
                description=f"**Root Cause:** {result['root_cause']}\n\n**Fix:**\n```\n{result['fix_code'][:500]}\n```\n\n**Estimated Hours:** {result['estimated_hours']}",
                priority=issue.get("priority", "medium"),
                type="bug",
            )
            result["created_task"] = task_result
        except Exception as e:
            logger.warning(f"Auto task creation failed: {e}")

    return result


async def run_batch_pipeline(issues: List[Dict], token: str,
                              workspace_id: int = None) -> List[Dict]:
    """Run the fix pipeline for multiple issues (top critical ones)."""
    critical = [i for i in issues if i.get("priority") in ("critical", "high")][:5]
    results = []
    for issue in critical:
        result = await run_fix_pipeline(issue, token, workspace_id, auto_create_task=True)
        results.append(result)
    return results
