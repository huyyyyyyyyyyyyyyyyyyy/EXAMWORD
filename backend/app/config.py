import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv(
            "DATABASE_URL", f"sqlite:///{(BACKEND_DIR / 'examworld.db').as_posix()}"
        )
        self.jwt_secret = os.getenv("JWT_SECRET", "examworld-development-secret-change-me")
        self.jwt_algorithm = "HS256"
        self.access_token_minutes = int(os.getenv("ACCESS_TOKEN_MINUTES", "1440"))
        self.environment = os.getenv("ENVIRONMENT", "development").lower()
        self.upload_dir = Path(os.getenv("UPLOAD_DIR", str(BACKEND_DIR / "uploads")))
        self.max_upload_bytes = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
        self.max_audio_bytes = int(os.getenv("MAX_AUDIO_BYTES", str(20 * 1024 * 1024)))
        self.ai_provider = os.getenv("AI_PROVIDER", "deterministic").lower()
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")


settings = Settings()
