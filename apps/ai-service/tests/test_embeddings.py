import os
import sys
from unittest.mock import patch, MagicMock
import pytest
from embeddings.base import EmbeddingProvider
from embeddings.gemini import GeminiEmbeddingProvider
from embeddings.bge_local import BGELocalEmbeddingProvider
from embeddings.factory import get_embedding_provider


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
    assert provider._client is None


def test_gemini_provider_embed_mock():
    provider = GeminiEmbeddingProvider(api_key="mock-test-key")
    mock_client = MagicMock()
    mock_res_query = MagicMock()
    mock_emb_query = MagicMock()
    mock_emb_query.values = [0.1] * 768
    mock_res_query.embeddings = [mock_emb_query]

    mock_res_docs = MagicMock()
    mock_emb_doc1 = MagicMock()
    mock_emb_doc1.values = [0.1] * 768
    mock_emb_doc2 = MagicMock()
    mock_emb_doc2.values = [0.2] * 768
    mock_res_docs.embeddings = [mock_emb_doc1, mock_emb_doc2]

    def side_effect(*args, **kwargs):
        task_type = kwargs.get("config", MagicMock()).task_type
        if task_type == "RETRIEVAL_DOCUMENT":
            return mock_res_docs
        return mock_res_query

    mock_client.models.embed_content.side_effect = side_effect
    provider._client = mock_client

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
    from core.config import get_settings
    with patch.dict(os.environ, {"EMBEDDING_PROVIDER": "bge_local"}):
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()
        provider = get_embedding_provider()
        assert isinstance(provider, BGELocalEmbeddingProvider)
        assert provider.provider_name == "bge_local"
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()


def test_factory_selection_gemini():
    from core.config import get_settings
    with patch.dict(os.environ, {"EMBEDDING_PROVIDER": "gemini", "GEMINI_API_KEY": "test-key"}):
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()
        provider = get_embedding_provider()
        assert isinstance(provider, GeminiEmbeddingProvider)
        assert provider.provider_name == "gemini"
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()


def test_gemini_mode_does_not_load_sentence_transformers():
    """Verify that in Gemini mode, sentence_transformers model is not loaded into memory."""
    from core.config import get_settings
    with patch.dict(os.environ, {"EMBEDDING_PROVIDER": "gemini", "GEMINI_API_KEY": "test-key"}):
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()
        provider = get_embedding_provider()
        assert provider.provider_name == "gemini"
        # Verify BGELocalEmbeddingProvider._model is not on this provider
        assert not hasattr(provider, "_model")
        get_settings.cache_clear()
        get_embedding_provider.cache_clear()

