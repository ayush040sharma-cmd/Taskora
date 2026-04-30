from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean
from sqlalchemy.sql import func
from db.session import Base


class AgentMemory(Base):
    """Long-term memory: stores session history, decisions, context."""
    __tablename__ = "agent_memory"

    id          = Column(Integer, primary_key=True)
    session_id  = Column(String(64), index=True, nullable=False)
    role        = Column(String(16), nullable=False)   # user | assistant | tool
    content     = Column(Text, nullable=False)
    meta        = Column(JSON, default={})
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class AuditRun(Base):
    """Persists every audit run result."""
    __tablename__ = "agent_audit_runs"

    id           = Column(Integer, primary_key=True)
    audit_id     = Column(String(64), unique=True, index=True)
    workspace_id = Column(Integer, index=True)
    scope        = Column(String(32))
    issues_json  = Column(JSON)
    summary_json = Column(JSON)
    score        = Column(Integer)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


class BacklogRun(Base):
    """Persists every generated backlog."""
    __tablename__ = "agent_backlog_runs"

    id           = Column(Integer, primary_key=True)
    backlog_id   = Column(String(64), unique=True, index=True)
    workspace_id = Column(Integer, index=True)
    audit_id     = Column(String(64), nullable=True)
    items_json   = Column(JSON)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


class DecisionLog(Base):
    """Records every AI decision and action for traceability."""
    __tablename__ = "agent_decisions"

    id           = Column(Integer, primary_key=True)
    session_id   = Column(String(64), index=True)
    workspace_id = Column(Integer, nullable=True)
    decision     = Column(Text)
    tool_used    = Column(String(64), nullable=True)
    tool_input   = Column(JSON, nullable=True)
    tool_output  = Column(JSON, nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
