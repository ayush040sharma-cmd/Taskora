"""
Taskora AI Agent — FastAPI entry point
Jarvis-like AI assistant for Taskora SaaS platform.
"""
import logging
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from config import settings
from routers import audit, backlog, tasks, code, logs, chat
from routers import security as security_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_scheduler = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    logger.info("Starting Taskora AI Agent...")
    try:
        from db.session import init_db
        await init_db()
        logger.info("Database tables initialized")
    except Exception as e:
        logger.warning(f"DB init skipped (will retry on first request): {e}")

    # Start the daily audit scheduler (skip in test/dry-run envs)
    if settings.agent_env != "test":
        try:
            from services.audit_runner import start_scheduler
            _scheduler = start_scheduler()
            logger.info("Jarvis audit scheduler started")
        except Exception as e:
            logger.warning(f"Audit scheduler not started: {e}")

    yield

    # Shutdown
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Audit scheduler stopped")
    logger.info("Shutting down Taskora AI Agent")


app = FastAPI(
    title="Taskora AI Agent (Jarvis)",
    description="Production-grade AI assistant for Taskora — audits, backlog generation, code analysis, and task automation.",
    version="1.0.0",
    lifespan=lifespan,
)

# Firewall middleware must be added BEFORE CORS so it runs first
try:
    from firewall.middleware import JarvisFirewallMiddleware
    app.add_middleware(JarvisFirewallMiddleware, jwt_secret=settings.jwt_secret)
    logger.info("Jarvis firewall middleware registered")
except Exception as e:
    logger.warning(f"Firewall middleware not loaded: {e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3001", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(audit.router,           prefix="/api")
app.include_router(backlog.router,         prefix="/api")
app.include_router(tasks.router,           prefix="/api")
app.include_router(code.router,            prefix="/api")
app.include_router(logs.router,            prefix="/api")
app.include_router(chat.router,            prefix="/api")
app.include_router(security_router.router, prefix="/api")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "agent": "Taskora Jarvis v1.0",
        "model": settings.claude_model,
        "env": settings.agent_env,
    }


@app.get("/api/tools")
async def list_tools():
    from services.tool_registry import TOOL_DEFINITIONS
    return {"tools": [{"name": t["name"], "description": t["description"]} for t in TOOL_DEFINITIONS]}


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error", "error": str(exc)})


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.agent_port,
        reload=settings.agent_env == "development",
        log_level="info",
    )
