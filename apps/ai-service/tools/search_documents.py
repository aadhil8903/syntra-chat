from typing import List, Optional
from schemas.chat import Citation
from rag.retrieval import search_documents_vector


def search_documents_tool(
    user_id: str,
    query: str,
    document_ids: Optional[List[str]] = None,
    top_k: int = 5,
) -> List[Citation]:
    """Retrieves top-k relevant document chunks for the user."""
    return search_documents_vector(
        user_id=user_id,
        query=query,
        document_ids=document_ids,
        top_k=top_k,
    )

