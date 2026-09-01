import numpy as np
import logging
from typing import List, Dict, Any, Optional
from embeddings.factory import get_embedding_provider
from core.database import get_database
from schemas.chat import Citation

logger = logging.getLogger(__name__)


def search_documents_vector(
    user_id: str,
    query: str,
    document_ids: Optional[List[str]] = None,
    history: Optional[List[Dict[str, Any]]] = None,
    top_k: int = 6,
) -> List[Citation]:
    """
    Semantic vector search over accessible document chunks.
    - Scoped strictly to provided document_ids (enforced by RBAC in graph.py)
    - Contextual query reformulation for short follow-ups
    - Enforces source diversity (max N chunks per document)
    - Score threshold to suppress low-relevance noise
    """
    if not document_ids:
        logger.warning(f"No document_ids provided for search by user {user_id}")
        return []

    db = get_database()
    chunks_collection = db["document_chunks"]

    # Build filter based on provided document_ids
    mongo_filter: Dict[str, Any] = {"document_id": {"$in": document_ids}}

    cursor = chunks_collection.find(
        mongo_filter,
        {"document_id": 1, "filename": 1, "text": 1, "embedding": 1, "page": 1, "chunk_index": 1, "source_type": 1},
    )
    chunks = list(cursor)

    if not chunks:
        logger.warning(f"No chunks found for document_ids {document_ids}")
        return []

    # Enrich short follow-up queries with recent history context
    search_text = query
    if history and len(query.split()) <= 8:
        history_context = " ".join([h.get("content", "") for h in history[-3:] if h.get("role") == "user"])
        search_text = f"{query} {history_context}".strip()

    try:
        embedder = get_embedding_provider()
        query_vector = np.array(embedder.embed_query(search_text), dtype=np.float32)

        chunk_texts = [c.get("text", "") for c in chunks]
        chunk_embeddings = np.array([c["embedding"] for c in chunks], dtype=np.float32)

        # Normalize for cosine similarity
        norms = np.linalg.norm(chunk_embeddings, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        chunk_embeddings_norm = chunk_embeddings / norms

        qnorm = np.linalg.norm(query_vector)
        query_vector_norm = query_vector / (qnorm if qnorm > 0 else 1)

        scores = np.dot(chunk_embeddings_norm, query_vector_norm)

        # Sort all by score descending
        ranked_indices = np.argsort(scores)[::-1]

        # Min score threshold for general semantic filtering with BGE
        MIN_SCORE = 0.25

        # Enforce source diversity: at most ceil(top_k/num_docs) chunks per document
        # so we never drown out one doc with too many chunks from another
        unique_doc_ids = list({chunks[i]["document_id"] for i in ranked_indices})
        num_docs = max(len(unique_doc_ids), 1)
        max_per_doc = max(2, top_k // num_docs + 1)

        chosen: List[Citation] = []
        doc_counts: Dict[str, int] = {}

        for idx in ranked_indices:
            if len(chosen) >= top_k:
                break

            score = float(scores[idx])
            if score < MIN_SCORE:
                continue

            c = chunks[idx]
            doc_id = str(c["document_id"])
            doc_counts[doc_id] = doc_counts.get(doc_id, 0) + 1

            if doc_counts[doc_id] > max_per_doc:
                continue

            chosen.append(
                Citation(
                    documentId=doc_id,
                    filename=str(c.get("filename", "Document")),
                    page=c.get("page"),
                    chunkIndex=c.get("chunk_index"),
                    sourceType=c.get("source_type", "narrative"),
                    textSnippet=c.get("text", ""),
                    score=round(score, 4),
                )
            )

        # If user explicitly scoped specific document_ids but score threshold yielded nothing
        # (e.g., broad prompts like "summarize this document", "overview", "what is inside"),
        # provide the top ranked chunks of the requested documents.
        if not chosen and document_ids and len(ranked_indices) > 0:
            for idx in ranked_indices[:min(top_k, len(ranked_indices))]:
                c = chunks[idx]
                doc_id = str(c["document_id"])
                score = float(scores[idx])
                chosen.append(
                    Citation(
                        documentId=doc_id,
                        filename=str(c.get("filename", "Document")),
                        page=c.get("page"),
                        chunkIndex=c.get("chunk_index"),
                        sourceType=c.get("source_type", "narrative"),
                        textSnippet=c.get("text", ""),
                        score=round(score, 4),
                    )
                )

        return chosen

    except Exception as e:
        logger.warning(f"Vector search exception: {e}")
        return []
