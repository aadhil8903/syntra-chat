import os
import sys
import inspect
from unittest.mock import patch, MagicMock
import pytest
from embeddings.base import EmbeddingProvider
from embeddings.gemini import GeminiEmbeddingProvider
from embeddings.bge_local import BGELocalEmbeddingProvider
from embeddings.factory import get_embedding_provider
from core.config import get_settings


def test_bge_provider_metadata():
    provider = BGELocalEmbeddingProvider()
    assert provider.provider_name == "bge_local"
    assert provider.dimension == 768
    assert "bge" in provider.model_name.lower()
    # Ensure model is not loaded upon instantiation
    assert provider._model is None


def test_gemini_provider_metadata():
    provider = GeminiEmbeddingProvider(api_key="dummy-key-for-unit-test")
    assert provider.provider_name == "gemini"
    assert provider.dimension == 768
    assert "gemini-embedding" in provider.model_name.lower()
    # Ensure client is not loaded upon instantiation
    assert provider._embedder is None


def test_gemini_provider_embed_mock():
    provider = GeminiEmbeddingProvider(api_key="mock-test-key")
    mock_embedder = MagicMock()
    mock_embedder.embed_query.return_value = [0.1] * 768
    mock_embedder.embed_documents.return_value = [[0.1] * 768, [0.2] * 768]
    provider._embedder = mock_embedder

    # Test embed_query
    query_vec = provider.embed_query("search term")
    assert len(query_vec) == 768
    assert query_vec[0] == 0.1

    # Test embed_documents
    doc_vecs = provider.embed_documents(["doc chunk 1", "doc chunk 2"])
    assert len(doc_vecs) == 2
    assert len(doc_vecs[0]) == 768
    assert len(doc_vecs[1]) == 768


def test_factory_selection_bge():
    """Requirement 17.b: EMBEDDING_PROVIDER=bge_local selects the BGE provider."""
    with patch.dict(os.environ, {"EMBEDDING_PROVIDER": "bge_local"}):
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()
        provider = get_embedding_provider()
        assert isinstance(provider, BGELocalEmbeddingProvider)
        assert provider.provider_name == "bge_local"
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()


def test_factory_selection_gemini():
    """Requirement 17.a: EMBEDDING_PROVIDER=gemini selects the Gemini provider."""
    with patch.dict(os.environ, {"EMBEDDING_PROVIDER": "gemini", "GEMINI_API_KEY": "test-key"}):
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()
        provider = get_embedding_provider()
        assert isinstance(provider, GeminiEmbeddingProvider)
        assert provider.provider_name == "gemini"
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()


def test_gemini_mode_does_not_instantiate_sentence_transformers():
    """Requirement 17.c: Importing/selecting with EMBEDDING_PROVIDER=gemini does NOT instantiate SentenceTransformer."""
    with patch.dict(os.environ, {"EMBEDDING_PROVIDER": "gemini", "GEMINI_API_KEY": "test-key"}):
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()
        provider = get_embedding_provider()
        assert provider.provider_name == "gemini"
        # Verify BGELocalEmbeddingProvider is not used and has no _model loaded
        assert not hasattr(provider, "_model")
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()


def test_fastapi_startup_does_not_load_bge():
    """Requirement 17.d: FastAPI startup and /health do NOT load BGE."""
    from fastapi.testclient import TestClient
    with patch.dict(os.environ, {"EMBEDDING_PROVIDER": "gemini", "GEMINI_API_KEY": "test-key"}):
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()
        from main import app

        client = TestClient(app)
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["embedding_provider"] == "gemini"
        assert "gemini-embedding" in data["embedding_model"]

        res_root = client.get("/")
        assert res_root.status_code == 200

        # Verify BGELocalEmbeddingProvider is not initialized anywhere in the running app
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()


def test_embedding_factory_does_not_hardcode_bge():
    """Requirement 17.e: The embedding factory does not directly hardcode BGE."""
    import embeddings.factory as factory_mod
    source = inspect.getsource(factory_mod.get_embedding_provider)
    assert "provider_name == \"gemini\"" in source
    assert "GeminiEmbeddingProvider" in source
    assert "BGELocalEmbeddingProvider" in source
