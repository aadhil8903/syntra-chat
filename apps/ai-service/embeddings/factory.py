import logging
from functools import lru_cache
from embeddings.base import EmbeddingProvider
from core.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache()
def get_embedding_provider() -> EmbeddingProvider:
    settings = get_settings()
    provider_name = (settings.EMBEDDING_PROVIDER or "bge_local").strip().lower()

    if provider_name == "gemini":
        from embeddings.gemini import GeminiEmbeddingProvider
        return GeminiEmbeddingProvider()
    elif provider_name == "bge_local":
        from embeddings.bge_local import BGELocalEmbeddingProvider
        return BGELocalEmbeddingProvider()
    else:
        logger.warning(
            f"Unknown EMBEDDING_PROVIDER '{provider_name}'. Defaulting to 'bge_local'."
        )
        from embeddings.bge_local import BGELocalEmbeddingProvider
        return BGELocalEmbeddingProvider()


