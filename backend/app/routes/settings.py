from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import os
import re
import logging
from app.config import settings, ENV_FILE, reload_configuration, sync_api_key_state
from app.database import get_app_settings_collection
from app.services.auth_service import get_current_user
from openai import OpenAI

logger = logging.getLogger("biasguard.settings")

router = APIRouter(prefix="/settings", tags=["Settings"])

class SettingsUpdate(BaseModel):
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = None
    mock_ai_mode: Optional[bool] = None
    bias_score_delta_threshold: Optional[float] = None
    groq_api_key: Optional[str] = None
    transcription_provider: Optional[str] = None

@router.get("/status")
async def get_api_configuration_status():
    """
    Safe public / monitoring endpoint reporting whether OpenAI and Groq API credentials are configured.
    Never exposes the raw keys or secret values.
    """
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
        "transcription_provider": provider,
        "groq_key_configured": has_groq,
        "groq_model": settings.GROQ_TRANSCRIPTION_MODEL,
        "openai_key_configured": has_openai,
        "openai_model": settings.OPENAI_MODEL,
        "mock_ai_mode": settings.MOCK_AI_MODE,
        "speech_to_text_ready": stt_ready,
        "status": "ready" if stt_ready else "missing_transcription_key",
        "message": (
            f"Speech-to-text ready using {provider.upper()} ({settings.GROQ_TRANSCRIPTION_MODEL if provider == 'groq' else settings.WHISPER_MODEL})."
            if stt_ready else
            f"{provider.capitalize()} API key is missing. Please configure {provider.upper()}_API_KEY in backend/.env or in the Settings tab."
        )
    }

@router.get("")
async def get_system_settings(current_user: dict = Depends(get_current_user)):
    has_openai = bool(
        (settings.OPENAI_API_KEY and "your-" not in settings.OPENAI_API_KEY) or
        (os.environ.get("OPENAI_API_KEY") and "your-" not in os.environ.get("OPENAI_API_KEY", ""))
    )
    has_groq = bool(
        (settings.GROQ_API_KEY and "your-" not in settings.GROQ_API_KEY) or
        (os.environ.get("GROQ_API_KEY") and "your-" not in os.environ.get("GROQ_API_KEY", ""))
    )

    masked_openai = ""
    if has_openai:
        raw_o = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY", "")
        masked_openai = f"{raw_o[:3]}...{raw_o[-4:]}" if len(raw_o) > 10 else "****"

    masked_groq = ""
    if has_groq:
        raw_g = settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")
        masked_groq = f"{raw_g[:4]}...{raw_g[-4:]}" if len(raw_g) > 12 else "****"

    from app.database import get_sanitized_uri
    sanitized_uri = get_sanitized_uri(settings.MONGODB_URI)
    if "cluster0" in sanitized_uri:
        cluster_info = "MongoDB Atlas Cluster (cluster0)"
    elif "mongodb+srv://" in sanitized_uri:
        cluster_info = "MongoDB Atlas Cluster"
    else:
        cluster_info = "Local MongoDB (" + sanitized_uri + ")"

    return {
        "project_name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database_name": settings.effective_db_name,
        "mongodb_uri_masked": cluster_info,
        "has_openai_key": has_openai,
        "masked_api_key": masked_openai,
        "openai_model": settings.OPENAI_MODEL,
        "has_groq_key": has_groq,
        "masked_groq_key": masked_groq,
        "groq_model": settings.GROQ_TRANSCRIPTION_MODEL,
        "transcription_provider": settings.TRANSCRIPTION_PROVIDER,
        "mock_ai_mode": settings.MOCK_AI_MODE,
        "bias_score_delta_threshold": settings.BIAS_SCORE_DELTA_THRESHOLD,
        "available_models": ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
        "available_transcription_providers": ["groq", "openai"]
    }

@router.post("")
async def update_system_settings(
    update_data: SettingsUpdate,
    current_user: dict = Depends(get_current_user)
):
    app_settings_col = get_app_settings_collection()
    save_doc = {}

    if update_data.openai_api_key is not None:
        raw_key = update_data.openai_api_key.strip()
        settings.OPENAI_API_KEY = raw_key
        os.environ["OPENAI_API_KEY"] = raw_key
        save_doc["openai_api_key"] = raw_key

    if update_data.groq_api_key is not None:
        raw_groq = update_data.groq_api_key.strip()
        settings.GROQ_API_KEY = raw_groq
        os.environ["GROQ_API_KEY"] = raw_groq
        save_doc["groq_api_key"] = raw_groq

    if update_data.transcription_provider is not None:
        raw_prov = update_data.transcription_provider.strip().lower()
        if raw_prov in ("groq", "openai"):
            settings.TRANSCRIPTION_PROVIDER = raw_prov
            os.environ["TRANSCRIPTION_PROVIDER"] = raw_prov
            save_doc["transcription_provider"] = raw_prov

    if update_data.openai_model is not None:
        settings.OPENAI_MODEL = update_data.openai_model
        save_doc["openai_model"] = update_data.openai_model

    if update_data.mock_ai_mode is not None:
        settings.MOCK_AI_MODE = update_data.mock_ai_mode
        save_doc["mock_ai_mode"] = update_data.mock_ai_mode

    if update_data.bias_score_delta_threshold is not None:
        settings.BIAS_SCORE_DELTA_THRESHOLD = max(1.0, min(5.0, update_data.bias_score_delta_threshold))
        save_doc["bias_score_delta_threshold"] = settings.BIAS_SCORE_DELTA_THRESHOLD

    sync_api_key_state()

    # Persist to MongoDB
    if save_doc:
        app_settings_col.update_one({"type": "system_config"}, {"$set": save_doc}, upsert=True)

    # Persist keys to backend/.env if changed
    if update_data.openai_api_key is not None or update_data.groq_api_key is not None or update_data.transcription_provider is not None:
        try:
            if os.path.exists(ENV_FILE):
                with open(ENV_FILE, "r", encoding="utf-8") as f:
                    content = f.read()

                if update_data.openai_api_key is not None:
                    if re.search(r"^OPENAI_API_KEY=.*", content, flags=re.MULTILINE):
                        content = re.sub(r"^OPENAI_API_KEY=.*", f"OPENAI_API_KEY={update_data.openai_api_key.strip()}", content, flags=re.MULTILINE)
                    else:
                        content += f"\nOPENAI_API_KEY={update_data.openai_api_key.strip()}\n"

                if update_data.groq_api_key is not None:
                    if re.search(r"^GROQ_API_KEY=.*", content, flags=re.MULTILINE):
                        content = re.sub(r"^GROQ_API_KEY=.*", f"GROQ_API_KEY={update_data.groq_api_key.strip()}", content, flags=re.MULTILINE)
                    else:
                        content += f"\nGROQ_API_KEY={update_data.groq_api_key.strip()}\n"

                if update_data.transcription_provider is not None:
                    if re.search(r"^TRANSCRIPTION_PROVIDER=.*", content, flags=re.MULTILINE):
                        content = re.sub(r"^TRANSCRIPTION_PROVIDER=.*", f"TRANSCRIPTION_PROVIDER={update_data.transcription_provider.strip().lower()}", content, flags=re.MULTILINE)
                    else:
                        content += f"\nTRANSCRIPTION_PROVIDER={update_data.transcription_provider.strip().lower()}\n"

                with open(ENV_FILE, "w", encoding="utf-8") as f:
                    f.write(content)
            reload_configuration()
        except Exception as e:
            logger.error(f"Notice while updating .env file: {e}")

    has_openai = bool(settings.OPENAI_API_KEY and "your-" not in settings.OPENAI_API_KEY)
    has_groq = bool(settings.GROQ_API_KEY and "your-" not in settings.GROQ_API_KEY)
    return {
        "message": "Settings updated and saved successfully.",
        "has_openai_key": has_openai,
        "has_groq_key": has_groq,
        "transcription_provider": settings.TRANSCRIPTION_PROVIDER,
        "mock_ai_mode": settings.MOCK_AI_MODE
    }

@router.post("/test-ai")
async def test_ai_connection(current_user: dict = Depends(get_current_user)):
    api_key = (settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY", "")).strip()
    if settings.MOCK_AI_MODE or not api_key or "your-" in api_key:
        return {
            "status": "mock_mode",
            "message": "BiasGuard AI is currently in Mock / Offline Semantic Mode. All evaluation logic runs via local domain heuristics and deep NLP analysis without external API charges."
        }
    try:
        client = OpenAI(api_key=api_key, timeout=10.0)
        test_resp = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role": "user", "content": "Ping test. Respond with JSON: {\"status\": \"ok\"}"}],
            max_tokens=20,
            response_format={"type": "json_object"}
        )
        return {
            "status": "connected",
            "message": f"Successfully connected to OpenAI ({settings.OPENAI_MODEL})!",
            "response": test_resp.choices[0].message.content
        }
    except Exception as e:
        err_msg = str(e)
        if api_key and api_key in err_msg:
            err_msg = err_msg.replace(api_key, "[REDACTED_API_KEY]")
        return {
            "status": "error",
            "message": f"OpenAI Connection Failed: {err_msg}"
        }

@router.post("/test-groq")
async def test_groq_connection(current_user: dict = Depends(get_current_user)):
    """Tests Groq API credentials for speech-to-text whisper-large-v3 availability."""
    groq_key = (settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")).strip()
    if not groq_key or "your-" in groq_key:
        return {
            "status": "missing_key",
            "message": "Groq API key is not configured. Please paste your GROQ_API_KEY in backend/.env or the Settings tab."
        }
    try:
        try:
            from groq import Groq
            client = Groq(api_key=groq_key, timeout=10.0)
        except ImportError:
            from openai import OpenAI
            client = OpenAI(api_key=groq_key, base_url="https://api.groq.com/openai/v1", timeout=10.0)

        models = client.models.list()
        whisper_models = [m.id for m in models.data if "whisper" in m.id]
        return {
            "status": "connected",
            "message": f"Successfully connected to Groq API! Speech-to-text model ({settings.GROQ_TRANSCRIPTION_MODEL}) is active and ready.",
            "available_whisper_models": whisper_models
        }
    except Exception as e:
        err_msg = str(e)
        if groq_key and groq_key in err_msg:
            err_msg = err_msg.replace(groq_key, "[REDACTED_GROQ_KEY]")
        return {
            "status": "error",
            "message": f"Groq Connection Failed: {err_msg}"
        }
