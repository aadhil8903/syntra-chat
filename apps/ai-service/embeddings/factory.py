import logging
from functools import lru_cache
from embeddings.base import EmbeddingProvider
from core.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache()
def get_embedding_provider() -> EmbeddingProvider:
    settings = get_settings()
    provider_name = (settings.EMBEDDING_PROVIDER or "bge_local").strip().strip("'\"").lower()

    if provider_name == "gemini":
        logger.info("Embedding provider: gemini")
        from embeddings.gemini import GeminiEmbeddingProvider
        return GeminiEmbeddingProvider()
    elif provider_name == "bge_local":
        logger.info("Embedding provider: bge_local")
        from embeddings.bge_local import BGELocalEmbeddingProvider
        return BGELocalEmbeddingProvider()
    else:
        # If unknown, check if GEMINI_API_KEY is configured (e.g. Render production)
        if settings.GEMINI_API_KEY:
            logger.warning(
                f"Unknown EMBEDDING_PROVIDER '{provider_name}'. GEMINI_API_KEY detected, selecting 'gemini'."
            )
            from embeddings.gemini import GeminiEmbeddingProvider
            return GeminiEmbeddingProvider()

        logger.warning(
            f"Unknown EMBEDDING_PROVIDER '{provider_name}'. Defaulting to 'bge_local'."
        )
        from embeddings.bge_local import BGELocalEmbeddingProvider
        return BGELocalEmbeddingProvider()


