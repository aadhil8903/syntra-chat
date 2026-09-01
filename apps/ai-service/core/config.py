from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

_AI_SERVICE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    # Service settings
    SERVICE_NAME: str = "ai-service"
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    DEBUG: bool = False

    # MongoDB settings
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "enter_chat"

    # LLM Settings
    LLM_PROVIDER: str = "gemini"  # "gemini" or "local"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash"

    # Local LLM (e.g. Ollama)
    LOCAL_LLM_BASE_URL: str = "http://localhost:11434"
    LOCAL_LLM_MODEL: str = "llama3.2"

    # Embedding Settings
    EMBEDDING_PROVIDER: str = "bge_local"  # "bge_local" or "gemini"
    BGE_MODEL: str = "BAAI/bge-base-en-v1.5"
    BGE_DIMENSION: int = 768  # BGE base model dimension

    # Gemini Embedding Settings (Production)
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-001"
    GEMINI_EMBEDDING_DIMENSION: int = 768  # Configurable output dimension (default: 768)

    # Chunking Configuration
    CHUNK_SIZE: int = 800
    CHUNK_OVERLAP: int = 150

    def model_post_init(self, __context):
        # Prevent root backend PORT=3000 environment variable from hijacking AI service port
        if self.PORT == 3000:
            self.PORT = 8000

    model_config = SettingsConfigDict(
        env_file=(
            str(_AI_SERVICE_DIR / ".env"),
            str(_AI_SERVICE_DIR / ".env.local"),
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()

