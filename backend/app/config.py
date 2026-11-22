import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
from dotenv import load_dotenv

# Absolute path to backend directory and backend/.env file
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(BASE_DIR, ".env")

# Configure python-dotenv to load backend/.env explicitly on startup
load_dotenv(dotenv_path=ENV_FILE, override=False)

class Settings(BaseSettings):
    PROJECT_NAME: str = "BiasGuard AI"
    VERSION: str = "1.2.0"
    API_PREFIX: str = "/api"
    
    # MongoDB / MongoDB Atlas
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: Optional[str] = "biasguard"
    DATABASE_NAME: str = "biasguard"

    @property
    def effective_db_name(self) -> str:
        return self.MONGODB_DB_NAME or self.DATABASE_NAME or "biasguard"

    @property
    def clean_mongodb_uri(self) -> str:
        uri = (self.MONGODB_URI or "").strip()
        if ":<" in uri and ">@" in uri:
            import re
            uri = re.sub(r":<([^@>]+)>@", r":\1@", uri)
        return uri
    
    # JWT Auth
    JWT_SECRET: str = "biasguard-secret-encryption-key-for-jwt-2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    
    # AI / LLM Configuration (Independent technical evaluation engine)
    OPENAI_API_KEY: Optional[str] = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    MOCK_AI_MODE: bool = False
    
    # Embeddings & MongoDB Atlas Vector Search
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    ATLAS_VECTOR_SEARCH_INDEX: str = "vector_index"
    ENABLE_RAG_EVALUATION: bool = True
    
    # Training & Fine-Tuning
    TRAINING_VAL_SPLIT_RATIO: float = 0.2
    
    # Voice & Speech-to-Text Configuration
    AUDIO_UPLOAD_DIR: str = os.path.join(BASE_DIR, "uploads", "audio")
    MAX_AUDIO_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB
    MAX_RECORDING_DURATION_SECONDS: int = 300      # 5 minutes
    
    # Transcription Provider: 'groq' (default/recommended) or 'openai'
    TRANSCRIPTION_PROVIDER: str = "groq"
    
    # Groq Speech-to-Text
    GROQ_API_KEY: Optional[str] = ""
    GROQ_TRANSCRIPTION_MODEL: str = "whisper-large-v3"
    
    # OpenAI Whisper (Fallback)
    WHISPER_MODEL: str = "whisper-1"
    WHISPER_TEMPERATURE: float = 0.0
    WHISPER_LANGUAGE: Optional[str] = None
    WHISPER_PROMPT: Optional[str] = None
    
    # Bias Detection thresholds
    BIAS_SCORE_DELTA_THRESHOLD: float = 2.5
    
    # Video Call & LiveKit Configuration
    VIDEO_UPLOAD_DIR: str = os.path.join(BASE_DIR, "uploads", "video")
    LIVEKIT_URL: str = "wss://biasguard-dev.livekit.cloud"
    LIVEKIT_API_KEY: str = "devkey"
    LIVEKIT_API_SECRET: str = "secret_key_biasguard_livekit_video_2026"
    
    # Email Invitations Configuration
    EMAIL_PROVIDER: str = "console"  # 'console' | 'resend' | 'smtp'
    RESEND_API_KEY: Optional[str] = ""
    SMTP_HOST: Optional[str] = ""
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = ""
    SMTP_PASSWORD: Optional[str] = ""
    EMAIL_FROM: str = "BiasGuard AI <interviews@biasguard.ai>"
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    INVITATION_EXPIRY_HOURS: int = 48
    DEBUG: bool = False
    
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

def sync_api_key_state():
    """Synchronizes API keys between settings and os.environ, and updates mode flags."""
    # 1. Sync OpenAI Key
    openai_k = (settings.OPENAI_API_KEY or "").strip()
    if not openai_k or "your-" in openai_k:
        env_k = os.environ.get("OPENAI_API_KEY", "").strip()
        if env_k and "your-" not in env_k:
            openai_k = env_k
            settings.OPENAI_API_KEY = openai_k

    if openai_k and "your-" not in openai_k:
        settings.OPENAI_API_KEY = openai_k
        os.environ["OPENAI_API_KEY"] = openai_k
        settings.MOCK_AI_MODE = False
    else:
        settings.MOCK_AI_MODE = True

    # 2. Sync Groq Key
    groq_k = (settings.GROQ_API_KEY or "").strip()
    if not groq_k or "your-" in groq_k:
        env_groq = os.environ.get("GROQ_API_KEY", "").strip()
        if env_groq and "your-" not in env_groq:
            groq_k = env_groq
            settings.GROQ_API_KEY = groq_k

    if groq_k and "your-" not in groq_k:
        settings.GROQ_API_KEY = groq_k
        os.environ["GROQ_API_KEY"] = groq_k

    # 3. Sync Transcription Provider
    prov = (settings.TRANSCRIPTION_PROVIDER or "groq").strip().lower()
    env_prov = os.environ.get("TRANSCRIPTION_PROVIDER", "").strip().lower()
    if env_prov in ("groq", "openai"):
        prov = env_prov
    settings.TRANSCRIPTION_PROVIDER = prov
    os.environ["TRANSCRIPTION_PROVIDER"] = prov

def reload_configuration():
    """Reloads environment variables from backend/.env and re-synchronizes settings state."""
    load_dotenv(dotenv_path=ENV_FILE, override=True)
    if os.environ.get("MONGODB_URI"):
        settings.MONGODB_URI = os.environ["MONGODB_URI"].strip()
    if os.environ.get("MONGODB_DB_NAME"):
        settings.MONGODB_DB_NAME = os.environ["MONGODB_DB_NAME"].strip()
        settings.DATABASE_NAME = settings.MONGODB_DB_NAME
    elif os.environ.get("DATABASE_NAME"):
        settings.DATABASE_NAME = os.environ["DATABASE_NAME"].strip()
    if os.environ.get("OPENAI_API_KEY"):
        settings.OPENAI_API_KEY = os.environ["OPENAI_API_KEY"].strip()
    if os.environ.get("GROQ_API_KEY"):
        settings.GROQ_API_KEY = os.environ["GROQ_API_KEY"].strip()
    if os.environ.get("TRANSCRIPTION_PROVIDER"):
        settings.TRANSCRIPTION_PROVIDER = os.environ["TRANSCRIPTION_PROVIDER"].strip().lower()
    if os.environ.get("GROQ_TRANSCRIPTION_MODEL"):
        settings.GROQ_TRANSCRIPTION_MODEL = os.environ["GROQ_TRANSCRIPTION_MODEL"].strip()
    # Email & Invitation settings
    if os.environ.get("EMAIL_PROVIDER"):
        settings.EMAIL_PROVIDER = os.environ["EMAIL_PROVIDER"].strip().lower()
    if os.environ.get("SMTP_HOST"):
        settings.SMTP_HOST = os.environ["SMTP_HOST"].strip()
    if os.environ.get("SMTP_PORT"):
        try:
            settings.SMTP_PORT = int(os.environ["SMTP_PORT"].strip())
        except ValueError:
            pass
    if os.environ.get("SMTP_USER"):
        settings.SMTP_USER = os.environ["SMTP_USER"].strip()
    if os.environ.get("SMTP_PASSWORD"):
        settings.SMTP_PASSWORD = os.environ["SMTP_PASSWORD"].strip()
    if os.environ.get("EMAIL_FROM"):
        settings.EMAIL_FROM = os.environ["EMAIL_FROM"].strip()
    if os.environ.get("FRONTEND_BASE_URL"):
        settings.FRONTEND_BASE_URL = os.environ["FRONTEND_BASE_URL"].strip().rstrip("/")
    if os.environ.get("INVITATION_EXPIRY_HOURS"):
        try:
            settings.INVITATION_EXPIRY_HOURS = int(os.environ["INVITATION_EXPIRY_HOURS"].strip())
        except ValueError:
            pass
    if os.environ.get("RESEND_API_KEY"):
        settings.RESEND_API_KEY = os.environ["RESEND_API_KEY"].strip()
    # Video Call & LiveKit settings
    if os.environ.get("LIVEKIT_URL"):
        settings.LIVEKIT_URL = os.environ["LIVEKIT_URL"].strip().strip("\"'").strip()
    if os.environ.get("LIVEKIT_API_KEY"):
        settings.LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"].strip().strip("\"'").strip()
    if os.environ.get("LIVEKIT_API_SECRET"):
        settings.LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"].strip().strip("\"'").strip()
    sync_api_key_state()

# Initial sync on module load
sync_api_key_state()
