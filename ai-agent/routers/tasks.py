from fastapi import APIRouter, HTTPException
from models.requests import CreateTaskRequest
from models.responses import CreateTaskResponse, CreatedTask
from services.taskora_client import TaskoraClient
from tools.task_tools import fetch_tasks, create_task
import logging

router = APIRouter(prefix="/tasks", tags=["tasks"])
logger = logging.getLogger(__name__)


@router.post("/create", response_model=CreateTaskResponse)
async def create_task_endpoint(req: CreateTaskRequest):
    client = TaskoraClient(req.token)
    result = await create_task(
        client=client,
        workspace_id=req.workspace_id,
        title=req.title,
        description=req.description,
        priority=req.priority.value,
        type=req.type.value,
        assigned_user_id=req.assigned_user_id,
        due_date=req.due_date,
        sprint_id=req.sprint_id,
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to create task"))

    return CreateTaskResponse(
        success=True,
        task=CreatedTask(
            id=result["task_id"],
            title=req.title,
            status="todo",
            priority=req.priority.value,
            workspace_id=req.workspace_id,
            created_at="now",
        ),
        message="Task created successfully",
        tool_calls_made=1,
    )


@router.get("/workspace/{workspace_id}")
async def list_tasks(workspace_id: int, token: str):
    client = TaskoraClient(token)
    try:
        return await fetch_tasks(client, workspace_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
