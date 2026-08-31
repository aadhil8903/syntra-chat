from functools import lru_cache
from llm.base import LLMProvider
from llm.gemini_adapter import GeminiAdapter
from llm.local_adapter import LocalLLMAdapter
from core.config import get_settings


@lru_cache()
def get_llm_provider() -> LLMProvider:
    settings = get_settings()
    provider_name = (settings.LLM_PROVIDER or "gemini").lower()

    if provider_name == "local":
        return LocalLLMAdapter()
    elif provider_name == "gemini":
        return GeminiAdapter()
    else:
        # Default fallback
        return GeminiAdapter()

