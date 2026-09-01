import os
import time
import logging
from typing import List, Optional
from embeddings.base import EmbeddingProvider
from core.config import get_settings

logger = logging.getLogger(__name__)

# Maximum chunk batch size per Google GenAI API request
BATCH_SIZE = 50
MAX_RETRIES = 3


class GeminiEmbeddingProvider(EmbeddingProvider):
    """
    Production-grade Gemini Embedding Provider for Syntra Chat.
    Uses Google GenAI remote API without loading any heavy PyTorch or CUDA weights into memory.
    Ideal for memory-constrained environments like Render 512 MB instances.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        dimension: Optional[int] = None,
    ):
        settings = get_settings()
        self.api_key = api_key or settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
        self._model_name = model_name or getattr(settings, "GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
        self._dim = dimension or getattr(settings, "GEMINI_EMBEDDING_DIMENSION", 768)
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not self.api_key:
                raise ValueError(
                    "GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in your environment to use the Gemini embedding provider."
                )
            from google import genai
            self._client = genai.Client(api_key=self.api_key)
            logger.info(f"Gemini embedding client initialized (Model: {self._model_name}, Dimension: {self._dim})")
        return self._client

    def _embed_with_retry(self, contents, task_type: str) -> List[List[float]]:
        from google.genai import types

        client = self._get_client()
        config = types.EmbedContentConfig(
            output_dimensionality=self._dim,
            task_type=task_type,
        )

        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                res = client.models.embed_content(
                    model=self._model_name,
                    contents=contents,
                    config=config,
                )
                if hasattr(res, "embeddings") and res.embeddings:
                    return [emb.values for emb in res.embeddings]
                elif hasattr(res, "embedding") and res.embedding:
                    return [res.embedding.values]
                return []
            except Exception as e:
                err_str = str(e).lower()
                last_error = e
                if "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str:
                    wait_time = (2 ** attempt) * 2  # 2s, 4s, 8s
                    logger.warning(
                        f"Gemini embedding rate limit hit (429 RESOURCE_EXHAUSTED). Retrying in {wait_time}s (attempt {attempt + 1}/{MAX_RETRIES})..."
                    )
                    time.sleep(wait_time)
                    continue
                logger.error(f"Gemini embedding API error: {e}")
                raise e

        raise last_error or RuntimeError("Gemini embedding requests failed after maximum retries.")

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        all_embeddings: List[List[float]] = []
        # Batch requests to respect API limits and network efficiency
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            batch_vectors = self._embed_with_retry(batch, task_type="RETRIEVAL_DOCUMENT")
            all_embeddings.extend(batch_vectors)

        return all_embeddings

    def embed_query(self, text: str) -> List[float]:
        if not text or not text.strip():
            return [0.0] * self._dim

        vectors = self._embed_with_retry(text.strip(), task_type="RETRIEVAL_QUERY")
        if vectors:
            return vectors[0]
        return [0.0] * self._dim

    @property
    def dimension(self) -> int:
        return self._dim

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model_name
