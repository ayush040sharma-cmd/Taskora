from fastapi import APIRouter, HTTPException
from models.requests import AnalyzeCodeRequest
from models.responses import AnalyzeCodeResponse, CodeIssue
from services.claude_client import run_agent
from tools.code_tools import read_source_file
import json
import logging

router = APIRouter(prefix="/analyze-code", tags=["code"])
logger = logging.getLogger(__name__)


ANALYZE_PROMPT = """Analyze the source file at path: {file_path}
Focus: {focus}

Step 1: Call read_source_file to get the file content.
Step 2: Optionally call scan_for_patterns for related patterns.
Step 3: Analyze for: bugs, security issues, performance problems, bad patterns, accessibility.
Step 4: Generate test cases for critical functions.

Return JSON:
{{
  "language": "javascript",
  "issues": [
    {{
      "line": 42,
      "severity": "high",
      "category": "bug",
      "description": "...",
      "suggestion": "...",
      "code_snippet": "..."
    }}
  ],
  "summary": "Overall assessment...",
  "risk_score": 45,
  "test_cases": ["test 1...", "test 2..."],
  "refactor_suggestions": ["suggestion 1", "suggestion 2"]
}}
"""


@router.post("", response_model=AnalyzeCodeResponse)
async def analyze_code(req: AnalyzeCodeRequest):
    prompt = ANALYZE_PROMPT.format(
        file_path=req.file_path,
        focus=req.focus or "all",
    )
    messages = [{"role": "user", "content": prompt}]

    try:
        text, tool_calls, _ = await run_agent(
            messages=messages,
            token=req.token,
            workspace_id=req.workspace_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    issues = []
    summary = text
    risk_score = 50
    test_cases = []
    refactor = []
    language = "unknown"

    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0:
            parsed = json.loads(text[start:end])
            language = parsed.get("language", "unknown")
            risk_score = parsed.get("risk_score", 50)
            summary = parsed.get("summary", "")
            test_cases = parsed.get("test_cases", [])
            refactor = parsed.get("refactor_suggestions", [])
            for raw in parsed.get("issues", []):
                issues.append(CodeIssue(
                    line=raw.get("line"),
                    severity=raw.get("severity", "medium"),
                    category=raw.get("category", "bug"),
                    description=raw.get("description", ""),
                    suggestion=raw.get("suggestion", ""),
                    code_snippet=raw.get("code_snippet"),
                ))
    except Exception:
        pass

    return AnalyzeCodeResponse(
        file_path=req.file_path,
        language=language,
        issues=issues,
        summary=summary,
        risk_score=risk_score,
        test_cases=test_cases,
        refactor_suggestions=refactor,
        tool_calls_made=tool_calls,
    )
