from abc import ABC, abstractmethod
from typing import List


class EmbeddingProvider(ABC):
    @abstractmethod
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Generates embedding vectors for a list of document texts."""
        pass

    @abstractmethod
    def embed_query(self, text: str) -> List[float]:
        """Generates an embedding vector for a single search query."""
        pass

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Returns the embedding vector dimensionality (e.g. 768)."""
        pass

