import os
import time
import logging
from typing import List, Optional
from embeddings.base import EmbeddingProvider
from core.config import get_settings

logger = logging.getLogger(__name__)

MAX_RETRIES = 5


class GeminiEmbeddingProvider(EmbeddingProvider):
    """
    Production-grade Gemini Embedding Provider for Syntra Chat.
    Uses Google's Gemini Embedding API via LangChain Google GenAI without loading
    any heavy local PyTorch or SentenceTransformer weights into memory.
    Ideal for memory-constrained production environments like Render (512 MB).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        dimension: Optional[int] = None,
    ):
        settings = get_settings()
        self.api_key = api_key or settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
        raw_model = model_name or getattr(settings, "GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
        # Ensure model is formatted as expected by langchain_google_genai
        self._model_name = raw_model if raw_model.startswith("models/") else f"models/{raw_model}"
        self._dim = dimension or getattr(settings, "GEMINI_EMBEDDING_DIMENSION", 768)
        self._embedder = None

    def _get_embedder(self):
        if self._embedder is None:
            if not self.api_key:
                raise ValueError(
                    "GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in your environment to use the Gemini embedding provider."
                )
            clean_name = self._model_name.replace("models/", "")
            logger.info(f"Using Gemini embedding model: {clean_name}")
            from langchain_google_genai import GoogleGenerativeAIEmbeddings

            self._embedder = GoogleGenerativeAIEmbeddings(
                model=self._model_name,
                google_api_key=self.api_key,
                output_dimensionality=self._dim,
            )
        return self._embedder

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        embedder = self._get_embedder()
        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                return embedder.embed_documents(texts)
            except Exception as e:
                err_str = str(e).lower()
                last_error = e
                if "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str:
                    wait_time = (2 ** attempt) * 2
                    logger.warning(
                        f"Gemini embedding rate limit hit (429 RESOURCE_EXHAUSTED). Retrying in {wait_time}s (attempt {attempt + 1}/{MAX_RETRIES})..."
                    )
                    time.sleep(wait_time)
                    continue
                logger.error(f"Gemini embed_documents error: {e}")
                raise e

        raise last_error or RuntimeError("Gemini embed_documents failed after maximum retries.")

    def embed_query(self, text: str) -> List[float]:
        if not text or not text.strip():
            return [0.0] * self._dim

        embedder = self._get_embedder()
        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                return embedder.embed_query(text.strip())
            except Exception as e:
                err_str = str(e).lower()
                last_error = e
                if "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str:
                    wait_time = (2 ** attempt) * 2
                    logger.warning(
                        f"Gemini embedding rate limit hit (429 RESOURCE_EXHAUSTED). Retrying in {wait_time}s (attempt {attempt + 1}/{MAX_RETRIES})..."
                    )
                    time.sleep(wait_time)
                    continue
                logger.error(f"Gemini embed_query error: {e}")
                raise e

        raise last_error or RuntimeError("Gemini embed_query failed after maximum retries.")

    @property
    def dimension(self) -> int:
        return self._dim

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model_name.replace("models/", "")
