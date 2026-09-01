import logging
from typing import List, Optional
from embeddings.base import EmbeddingProvider
from core.config import get_settings

logger = logging.getLogger(__name__)


class BGELocalEmbeddingProvider(EmbeddingProvider):
    def __init__(self, model_name: Optional[str] = None):
        settings = get_settings()
        self._model_name = model_name or settings.BGE_MODEL
        self._dim = settings.BGE_DIMENSION
        self._model = None

    def _get_model(self):
        if self._model is None:
            logger.info(f"Loading local BGE embedding model: {self._model_name} (CPU mode)")
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self._model_name, device="cpu")
            logger.info(f"BGE embedding model loaded successfully. Dimension: {self._dim}")
        return self._model

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        model = self._get_model()
        # Normalize embeddings for cosine similarity
        embeddings = model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return embeddings.tolist()

    def embed_query(self, text: str) -> List[float]:
        model = self._get_model()
        # BGE query instruction for optimal retrieval performance
        query_text = f"Represent this sentence for searching relevant passages: {text}"
        embedding = model.encode(
            query_text,
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return embedding.tolist()

    @property
    def dimension(self) -> int:
        return self._dim

    @property
    def provider_name(self) -> str:
        return "bge_local"

    @property
    def model_name(self) -> str:
        return self._model_name


