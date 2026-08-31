from functools import lru_cache
from embeddings.base import EmbeddingProvider
from embeddings.bge_local import BGELocalEmbeddingProvider
from core.config import get_settings


@lru_cache()
def get_embedding_provider() -> EmbeddingProvider:
    settings = get_settings()
    provider_name = (settings.EMBEDDING_PROVIDER or "bge_local").lower()

    if provider_name == "bge_local":
        return BGELocalEmbeddingProvider()
    else:
        return BGELocalEmbeddingProvider()

