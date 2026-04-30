"""
Two-tier memory system:
  - Short-term: in-process dict keyed by session_id (TTL enforced)
  - Long-term: PostgreSQL via agent_memory table (persisted across restarts)
"""
import time
import uuid
from typing import List, Dict, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from db.schema import AgentMemory, DecisionLog
import logging

logger = logging.getLogger(__name__)


# ── Short-term memory (in-process) ────────────────────────────────────────────

class ShortTermMemory:
    def __init__(self, ttl_seconds: int = 3600):
        self._store: Dict[str, Dict] = {}
        self._ttl = ttl_seconds

    def _now(self) -> float:
        return time.time()

    def new_session(self) -> str:
        sid = str(uuid.uuid4())
        self._store[sid] = {"messages": [], "created_at": self._now(), "meta": {}}
        return sid

    def get_session(self, session_id: str) -> Optional[Dict]:
        entry = self._store.get(session_id)
        if not entry:
            return None
        if self._now() - entry["created_at"] > self._ttl:
            del self._store[session_id]
            return None
        return entry

    def ensure_session(self, session_id: Optional[str]) -> str:
        if session_id and self.get_session(session_id):
            return session_id
        return self.new_session()

    def append_message(self, session_id: str, role: str, content: str):
        session = self.get_session(session_id)
        if not session:
            session_id = self.new_session()
            session = self.get_session(session_id)
        session["messages"].append({"role": role, "content": content})

    def get_messages(self, session_id: str, limit: int = 20) -> List[Dict]:
        session = self.get_session(session_id)
        if not session:
            return []
        return session["messages"][-limit:]

    def set_meta(self, session_id: str, key: str, value: Any):
        session = self.get_session(session_id)
        if session:
            session["meta"][key] = value

    def get_meta(self, session_id: str, key: str) -> Any:
        session = self.get_session(session_id)
        return session["meta"].get(key) if session else None

    def clear_expired(self):
        now = self._now()
        expired = [k for k, v in self._store.items() if now - v["created_at"] > self._ttl]
        for k in expired:
            del self._store[k]


# ── Long-term memory (PostgreSQL) ─────────────────────────────────────────────

class LongTermMemory:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def save_message(self, session_id: str, role: str, content: str, meta: dict = None):
        record = AgentMemory(
            session_id=session_id,
            role=role,
            content=content,
            meta=meta or {},
        )
        self.db.add(record)
        await self.db.commit()

    async def load_history(self, session_id: str, limit: int = 30) -> List[Dict]:
        result = await self.db.execute(
            select(AgentMemory)
            .where(AgentMemory.session_id == session_id)
            .order_by(AgentMemory.created_at.desc())
            .limit(limit)
        )
        rows = result.scalars().all()
        return [{"role": r.role, "content": r.content} for r in reversed(rows)]

    async def log_decision(self, session_id: str, decision: str, tool_used: str = None,
                           tool_input: dict = None, tool_output: Any = None,
                           workspace_id: int = None):
        record = DecisionLog(
            session_id=session_id,
            workspace_id=workspace_id,
            decision=decision,
            tool_used=tool_used,
            tool_input=tool_input,
            tool_output=tool_output if isinstance(tool_output, (dict, list)) else {"value": str(tool_output)},
        )
        self.db.add(record)
        await self.db.commit()

    async def purge_old(self, days: int = 30):
        from sqlalchemy import text
        await self.db.execute(
            text("DELETE FROM agent_memory WHERE created_at < NOW() - INTERVAL ':days days'"),
            {"days": days}
        )
        await self.db.commit()


# ── Singleton short-term store ─────────────────────────────────────────────────

from config import settings
short_term = ShortTermMemory(ttl_seconds=settings.memory_ttl_seconds)
