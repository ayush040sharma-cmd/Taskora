import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from models.requests import ChatRequest
from models.responses import ChatResponse
from services.claude_client import run_agent
from services.memory import short_term, LongTermMemory
from db.session import get_db
import logging

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

FOLLOW_UP_PROMPT = """Based on the conversation and tools used, suggest 3 concise follow-up actions the user might want to take next. Return as a JSON array of strings."""


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    # Manage session
    session_id = short_term.ensure_session(req.session_id)
    ltm = LongTermMemory(db)

    # Load history (short-term first, fall back to DB)
    history = short_term.get_messages(session_id, limit=15)
    if not history:
        history = await ltm.load_history(session_id, limit=15)

    # Build messages for Claude
    messages = history + [{"role": "user", "content": req.message}]

    try:
        reply, tool_calls, actions = await run_agent(
            messages=messages,
            token=req.token,
            workspace_id=req.workspace_id,
        )
    except Exception as e:
        logger.error(f"Chat agent error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Persist to memory
    short_term.append_message(session_id, "user", req.message)
    short_term.append_message(session_id, "assistant", reply)

    try:
        await ltm.save_message(session_id, "user", req.message)
        await ltm.save_message(session_id, "assistant", reply)
        if actions:
            await ltm.log_decision(session_id, f"Actions: {', '.join(actions)}", workspace_id=req.workspace_id)
    except Exception as e:
        logger.warning(f"Memory persist failed: {e}")

    # Generate follow-up suggestions
    follow_ups = []
    if tool_calls > 0:
        try:
            from services.claude_client import simple_completion
            raw = await simple_completion(
                f"Last assistant reply: {reply[:500]}\n\n{FOLLOW_UP_PROMPT}"
            )
            import json
            start = raw.find("[")
            end = raw.rfind("]") + 1
            if start >= 0:
                follow_ups = json.loads(raw[start:end])
        except Exception:
            pass

    return ChatResponse(
        session_id=session_id,
        reply=reply,
        tool_calls_made=tool_calls,
        actions_taken=actions,
        follow_up_suggestions=follow_ups[:3],
    )
