import logging
import time
import os
import sys
import asyncio
from contextlib import asynccontextmanager

if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError, HTTPException
from app.config import settings
from app.logging_config import configure_logging, LOGS_DIR
from app.db import init_db_pool, close_db_pool, execute
from app.routes import upload, learning

configure_logging()
logger = logging.getLogger("quizloop.main")
flow_logger = logging.getLogger("quizloop.prompts_and_flows")

async def run_db_migrations():
    """Runs the schema SQL migration if tables do not exist."""
    migration_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "migrations", "001_initial_schema.sql")
    if os.path.exists(migration_file):
        logger.info("Applying database migrations...")
        with open(migration_file, "r", encoding="utf-8") as f:
            sql = f.read()
        await execute(sql)
        logger.info("Database migrations applied successfully.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting QuizLoop FastAPI service...")
    await init_db_pool()
    try:
        await run_db_migrations()
    except Exception as e:
        logger.error(f"Migration error during startup: {e}", exc_info=True)
    try:
        from app.agents.pedagogical_graph import get_graph
        await get_graph()
    except Exception as e:
        logger.warning(f"Checkpointer graph initialization warning: {e}")
    yield
    # Shutdown
    logger.info("Shutting down QuizLoop FastAPI service...")
    try:
        from app.agents.pedagogical_graph import close_checkpointer_pool
        await close_checkpointer_pool()
    except Exception as e:
        logger.warning(f"Error during checkpointer pool shutdown: {e}")
    await close_db_pool()

app = FastAPI(
    title="QuizLoop Pedagogical AI Assessment Engine",
    version="3.0.0",
    lifespan=lifespan
)

# 1. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. HTTP Request & Flow Logging Middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    client_host = request.client.host if request.client else "unknown"
    method = request.method
    path = request.url.path
    query_str = f"?{request.url.query}" if request.url.query else ""
    
    logger.info(f"Incoming Request: {method} {path}{query_str} from {client_host}")
    flow_logger.info(f"[HTTP REQUEST] {method} {path}{query_str} | Client: {client_host}")
    
    try:
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000
        logger.info(f"Completed Request: {method} {path} -> {response.status_code} ({duration_ms:.1f}ms)")
        flow_logger.info(f"[HTTP RESPONSE] {method} {path} -> {response.status_code} in {duration_ms:.1f}ms")
        return response
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        logger.error(f"Failed Request: {method} {path} -> ERROR: {e} ({duration_ms:.1f}ms)", exc_info=True)
        flow_logger.error(f"[HTTP ERROR] {method} {path} -> {e} ({duration_ms:.1f}ms)")
        raise

# 3. Standardized Error Exception Handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    first_error = exc.errors()[0]["msg"] if exc.errors() else "Validation error"
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": first_error, "details": exc.errors()}
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "Internal server error"}
    )

# 3. Healthcheck
@app.get("/health")
async def health():
    return {"status": "ok", "service": "QuizLoop FastAPI", "model": settings.gemini_model_name}

# 4. Include Routers
app.include_router(upload.router)
app.include_router(learning.router)

