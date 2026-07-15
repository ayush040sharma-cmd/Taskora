from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    anthropic_api_key: str
    taskora_api_url: str = "http://localhost:3001/api"
    taskora_admin_token: str = ""
    database_url: str = "postgresql://localhost/kanban_db"
    agent_port: int = 8000
    agent_env: str = "development"
    max_tool_iterations: int = 10
    memory_ttl_seconds: int = 3600
    claude_model: str = "claude-sonnet-4-6"
    # The SDK's own default is ~10 minutes -- fine for a CLI, too generous
    # for a web-facing agent loop that can make several of these calls per
    # request (see run_agent's iteration loop in services/claude_client.py).
    # Every other HTTP client in this codebase uses an explicit 30-120s
    # timeout; this brings the Anthropic client in line with that.
    claude_timeout_seconds: float = 120.0

    # GitHub integration (for Jarvis multi-agent system)
    github_token: str = ""
    github_owner: str = ""
    github_repo: str = ""

    # Security — required, no default. An empty/missing secret used to
    # silently disable JWT verification on protected routes entirely
    # (see firewall/middleware.py) rather than fail closed; removing the
    # default means the service now refuses to start without a real one,
    # matching anthropic_api_key's existing required-field pattern above.
    jwt_secret: str

    # Orchestrator behaviour
    dry_run: bool = False
    audit_schedule_hour: int = 3  # 3 AM UTC daily

    class Config:
        env_file = ".env"


settings = Settings()
