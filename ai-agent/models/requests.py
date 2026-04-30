from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class Priority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class TaskType(str, Enum):
    task = "task"
    bug = "bug"
    story = "story"
    rfp = "rfp"
    proposal = "proposal"
    presentation = "presentation"
    upgrade = "upgrade"
    poc = "poc"


class AuditRequest(BaseModel):
    workspace_id: int
    token: str
    scope: Optional[str] = "full"  # full | ux | security | performance
    depth: Optional[str] = "deep"  # deep | quick


class BacklogRequest(BaseModel):
    workspace_id: int
    token: str
    audit_id: Optional[str] = None
    context: Optional[str] = None
    max_items: int = Field(default=20, le=50)


class CreateTaskRequest(BaseModel):
    workspace_id: int
    token: str
    title: str
    description: Optional[str] = None
    priority: Priority = Priority.medium
    type: TaskType = TaskType.task
    assigned_user_id: Optional[int] = None
    due_date: Optional[str] = None
    sprint_id: Optional[int] = None


class AnalyzeCodeRequest(BaseModel):
    file_path: str
    token: str
    workspace_id: Optional[int] = None
    focus: Optional[str] = None  # bugs | security | performance | all


class LogsRequest(BaseModel):
    workspace_id: int
    token: str
    limit: int = Field(default=50, le=200)
    filter_action: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    token: str
    workspace_id: Optional[int] = None
    session_id: Optional[str] = None
    context: Optional[dict] = None
