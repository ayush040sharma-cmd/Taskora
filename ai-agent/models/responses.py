from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime


class IssueItem(BaseModel):
    id: str
    title: str
    location: str
    problem: str
    impact: str
    root_cause: str
    fix: str
    priority: str  # critical | high | medium | low
    category: str  # ux | ui | bug | performance | security | missing_feature


class AuditResponse(BaseModel):
    audit_id: str
    workspace_id: int
    timestamp: str
    issues: List[IssueItem]
    summary: Dict[str, Any]
    top_critical: List[str]
    quick_wins: List[str]
    score: int  # 0-100 health score
    tool_calls_made: int


class BacklogItem(BaseModel):
    id: str
    title: str
    description: str
    type: str       # Bug | Feature | Improvement | Chore
    priority: str
    effort_hours: int
    status: str = "todo"
    tags: List[str]
    column: str     # urgent | in_progress | backlog | done
    depends_on: List[str] = []
    suggested_owner: Optional[str] = None


class BacklogResponse(BaseModel):
    backlog_id: str
    workspace_id: int
    items: List[BacklogItem]
    execution_order: List[str]
    total_effort_hours: int
    tool_calls_made: int


class CreatedTask(BaseModel):
    id: int
    title: str
    status: str
    priority: str
    workspace_id: int
    created_at: str


class CreateTaskResponse(BaseModel):
    success: bool
    task: Optional[CreatedTask]
    message: str
    tool_calls_made: int


class CodeIssue(BaseModel):
    line: Optional[int]
    severity: str       # critical | high | medium | low
    category: str       # bug | security | performance | style
    description: str
    suggestion: str
    code_snippet: Optional[str] = None


class AnalyzeCodeResponse(BaseModel):
    file_path: str
    language: str
    issues: List[CodeIssue]
    summary: str
    risk_score: int     # 0-100
    test_cases: List[str]
    refactor_suggestions: List[str]
    tool_calls_made: int


class LogEntry(BaseModel):
    id: int
    action: str
    actor: Optional[str]
    target: Optional[str]
    meta: Optional[Dict]
    created_at: str


class LogsResponse(BaseModel):
    workspace_id: int
    entries: List[LogEntry]
    total: int
    anomalies: List[str]
    tool_calls_made: int


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    tool_calls_made: int
    actions_taken: List[str]
    follow_up_suggestions: List[str]
