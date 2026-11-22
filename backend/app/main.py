import os
import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings, reload_configuration, sync_api_key_state
from app.database import init_db, check_db_connection, get_users_collection, close_db
from app.routes import (
    auth,
    candidates,
    interviews,
    evaluations,
    reports,
    analytics,
    settings as settings_route,
    seed,
    datasets,
    feedback,
    training,
    performance,
    fairness,
    rag,
    voice,
    livekit_route
)
from app.services.rag_service import seed_default_rag_references

START_TIME = time.time()

# Configure safe stream encoding and logging handler (immune to charmap / UnicodeEncodeError)
from app.utils.logging_config import configure_safe_logging
configure_safe_logging(level=logging.INFO)
logger = logging.getLogger("biasguard.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing BiasGuard AI Backend Service...")
    try:
        # Reload environment variables from backend/.env on startup
        reload_configuration()

        # Resilient MongoDB initialization (does not crash backend if MongoDB starts slowly)
        db_connected = init_db()
        os.makedirs(settings.AUDIO_UPLOAD_DIR, exist_ok=True)
        os.makedirs(settings.VIDEO_UPLOAD_DIR, exist_ok=True)

        if db_connected:
            seed_default_rag_references()

            # Automatic migration: Ensure all invitation tokens in MongoDB use SHA-256 token_hash
            from app.routes.interviews import migrate_legacy_invitation_tokens
            migrate_legacy_invitation_tokens()

            # Restore saved system settings from MongoDB
            from app.database import get_app_settings_collection
            app_settings_col = get_app_settings_collection()
            saved_cfg = app_settings_col.find_one({"type": "system_config"})
            if saved_cfg:
                if saved_cfg.get("openai_api_key"):
                    settings.OPENAI_API_KEY = saved_cfg["openai_api_key"].strip()
                    os.environ["OPENAI_API_KEY"] = settings.OPENAI_API_KEY
                    settings.MOCK_AI_MODE = False
                if saved_cfg.get("groq_api_key"):
                    settings.GROQ_API_KEY = saved_cfg["groq_api_key"].strip()
                    os.environ["GROQ_API_KEY"] = settings.GROQ_API_KEY
                if saved_cfg.get("transcription_provider"):
                    settings.TRANSCRIPTION_PROVIDER = saved_cfg["transcription_provider"]
                    os.environ["TRANSCRIPTION_PROVIDER"] = settings.TRANSCRIPTION_PROVIDER
                if saved_cfg.get("openai_model"):
                    settings.OPENAI_MODEL = saved_cfg["openai_model"]
                if "mock_ai_mode" in saved_cfg and not saved_cfg.get("openai_api_key"):
                    settings.MOCK_AI_MODE = saved_cfg["mock_ai_mode"]
                if saved_cfg.get("bias_score_delta_threshold"):
                    settings.BIAS_SCORE_DELTA_THRESHOLD = saved_cfg["bias_score_delta_threshold"]
                sync_api_key_state()
                logger.info("Restored persistent settings from MongoDB.")

            # Check if users collection is empty, auto-seed with rich demo cases
            users_col = get_users_collection()
            if users_col.count_documents({}) == 0:
                logger.info("Database empty on startup. Automatically seeding with demo cases...")
                await seed.seed_database()
                logger.info("Auto-seed completed.")
        else:
            logger.warning("MongoDB was not reachable on initial startup. Operating in resilient degraded mode.")

        has_openai = bool(settings.OPENAI_API_KEY and "your-" not in settings.OPENAI_API_KEY)
        has_groq = bool(settings.GROQ_API_KEY and "your-" not in settings.GROQ_API_KEY)
        logger.info(
            f"AI Evaluation: configured={has_openai}, mock_mode={settings.MOCK_AI_MODE} | "
            f"Speech-to-Text: provider={settings.TRANSCRIPTION_PROVIDER}, groq_configured={has_groq}, model={settings.GROQ_TRANSCRIPTION_MODEL if settings.TRANSCRIPTION_PROVIDER == 'groq' else settings.WHISPER_MODEL}"
        )

        # Email & Invitation configuration diagnostic checks (Task 7)
        if settings.EMAIL_PROVIDER.lower() == "console":
            logger.warning(
                "[EMAIL CONFIG] EMAIL_PROVIDER is set to 'console'. "
                "Candidate invitation emails will be printed to stdout instead of being delivered via SMTP."
            )
        elif settings.EMAIL_PROVIDER.lower() == "smtp":
            missing_smtp = []
            if not settings.SMTP_HOST:
                missing_smtp.append("SMTP_HOST")
            if not settings.SMTP_USER:
                missing_smtp.append("SMTP_USER")
            if not settings.SMTP_PASSWORD:
                missing_smtp.append("SMTP_PASSWORD")
            if missing_smtp:
                logger.warning(f"[EMAIL CONFIG] Incomplete SMTP configuration: missing {', '.join(missing_smtp)}.")
            else:
                logger.info(f"[EMAIL CONFIG] SMTP provider configured with host {settings.SMTP_HOST}:{settings.SMTP_PORT}")

        frontend_url = settings.FRONTEND_BASE_URL.lower()
        if "localhost" in frontend_url or "127.0.0.1" in frontend_url:
            logger.warning(
                f"[INVITATION NOTICE] FRONTEND_BASE_URL is '{settings.FRONTEND_BASE_URL}'. "
                "Candidate invitation links will point to localhost. "
                "For candidates joining from other devices on your LAN or remote networks, "
                "configure FRONTEND_BASE_URL in backend/.env with your machine's IP, a tunnel URL, or a public domain."
            )

        # Security Hygiene: Check for insecure or default JWT_SECRET (variable name only, never print secret)
        insecure_jwt_defaults = {
            "change-me",
            "biasguard-production-jwt-secret-key-change-in-production-2026",
            "secret",
            "secretkey",
            "default",
            "your-secret-key"
        }
        jwt_sec = (settings.JWT_SECRET or "").strip()
        if not jwt_sec or jwt_sec in insecure_jwt_defaults or len(jwt_sec) < 32:
            logger.warning(
                "[SECURITY WARNING] JWT_SECRET appears to be using a default or short value (< 32 characters). "
                "Please configure a strong, random 256-bit secret in backend/.env for production deployment."
            )

        # LiveKit Configuration & Cryptographic Token Startup Self-Check
        from app.services.livekit_service import verify_livekit_config
        verify_livekit_config()

    except Exception as e:
        logger.error(f"Startup initialization notice: {e}")
    yield
    logger.info("Shutting down BiasGuard AI Backend Service...")
    close_db()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="BiasGuard AI: Evidence-based technical interview evaluation and continuous improvement pipeline.",
    lifespan=lifespan
)

# CORS Middleware - W3C compliant origin handling with credentials
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
if settings.FRONTEND_BASE_URL and settings.FRONTEND_BASE_URL not in allowed_origins:
    allowed_origins.append(settings.FRONTEND_BASE_URL.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global unhandled exception handler to maintain server stability
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception processing {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "detail": "An unexpected server error occurred. The backend remains operational.",
            "path": request.url.path
        }
    )

# API Routers
app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(candidates.router, prefix=settings.API_PREFIX)
app.include_router(interviews.router, prefix=settings.API_PREFIX)
app.include_router(evaluations.router, prefix=settings.API_PREFIX)
app.include_router(reports.router, prefix=settings.API_PREFIX)
app.include_router(analytics.router, prefix=settings.API_PREFIX)
app.include_router(settings_route.router, prefix=settings.API_PREFIX)
app.include_router(seed.router, prefix=settings.API_PREFIX)

# AI Training & Continuous Improvement Routers
app.include_router(datasets.router, prefix=settings.API_PREFIX)
app.include_router(feedback.router, prefix=settings.API_PREFIX)
app.include_router(training.router, prefix=settings.API_PREFIX)
app.include_router(performance.router, prefix=settings.API_PREFIX)
app.include_router(fairness.router, prefix=settings.API_PREFIX)
app.include_router(rag.router, prefix=settings.API_PREFIX)
app.include_router(voice.router, prefix=settings.API_PREFIX)
app.include_router(livekit_route.router, prefix=settings.API_PREFIX)

def get_health_payload():
    """Generates standardized health status payload without exposing credentials."""
    db_connected, db_msg = check_db_connection()
    uptime = round(time.time() - START_TIME, 2)
    has_openai = bool(
        (settings.OPENAI_API_KEY and "your-" not in settings.OPENAI_API_KEY) or
        (os.environ.get("OPENAI_API_KEY") and "your-" not in os.environ.get("OPENAI_API_KEY", ""))
    )
    has_groq = bool(
        (settings.GROQ_API_KEY and "your-" not in settings.GROQ_API_KEY) or
        (os.environ.get("GROQ_API_KEY") and "your-" not in os.environ.get("GROQ_API_KEY", ""))
    )
    provider = (settings.TRANSCRIPTION_PROVIDER or "groq").lower()
    stt_ready = has_groq if provider == "groq" else has_openai

    return {
        "status": "healthy" if db_connected else "degraded",
        "backend": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "uptime_seconds": uptime,
        "database": {
            "connected": db_connected,
            "detail": db_msg,
            "database_name": settings.effective_db_name
        },
        "transcription_provider": provider,
        "groq_key_configured": has_groq,
        "groq_model": settings.GROQ_TRANSCRIPTION_MODEL,
        "openai_key_configured": has_openai,
        "speech_to_text_ready": stt_ready,
        "mock_mode": settings.MOCK_AI_MODE,
        "rag_enabled": settings.ENABLE_RAG_EVALUATION,
        "voice_enabled": True,
        "whisper_model": settings.GROQ_TRANSCRIPTION_MODEL if provider == "groq" else settings.WHISPER_MODEL
    }

# Health Check Endpoints: Root /health and API-prefixed /api/health
@app.get("/health", tags=["Health Monitoring"])
async def root_health_check():
    return get_health_payload()

@app.get("/api/health", tags=["Health Monitoring"])
async def api_health_check():
    return get_health_payload()

@app.get("/")
async def root():
    return {
        "message": "Welcome to BiasGuard AI Engine & Continuous Improvement Pipeline",
        "docs": "/docs",
        "health": "/health",
        "api_health": "/api/health"
    }

if __name__ == "__main__":
    import uvicorn
    # Watch ONLY 'app' directory so recording audio uploads does not trigger unwanted reloads
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True, reload_dirs=["app"])
