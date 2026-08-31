from fastapi import APIRouter
from core.config import get_settings

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    settings = get_settings()
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "llm_provider": settings.LLM_PROVIDER,
        "embedding_provider": settings.EMBEDDING_PROVIDER,
        "bge_model": settings.BGE_MODEL,
    }

