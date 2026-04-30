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

    # GitHub integration (for Jarvis multi-agent system)
    github_token: str = ""
    github_owner: str = ""
    github_repo: str = ""

    # Security
    jwt_secret: str = ""

    # Orchestrator behaviour
    dry_run: bool = False
    audit_schedule_hour: int = 3  # 3 AM UTC daily

    class Config:
        env_file = ".env"


settings = Settings()
