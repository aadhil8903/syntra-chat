from fastapi import APIRouter
from core.config import get_settings

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    settings = get_settings()
    model_name = (
        settings.GEMINI_EMBEDDING_MODEL
        if (settings.EMBEDDING_PROVIDER or "").lower() == "gemini"
        else settings.BGE_MODEL
    )
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "llm_provider": settings.LLM_PROVIDER,
        "embedding_provider": settings.EMBEDDING_PROVIDER,
        "embedding_model": model_name,
        "bge_model": settings.BGE_MODEL,
    }


@router.get("/")
async def root_check():
    return {"status": "ok", "service": "ai-service"}


