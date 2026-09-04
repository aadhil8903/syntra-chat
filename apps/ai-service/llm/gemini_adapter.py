import os
import asyncio
import logging
from typing import List, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from llm.base import LLMProvider
from core.config import get_settings

logger = logging.getLogger(__name__)

# Official Google Gemini models with high speed and reliability
FALLBACK_MODELS = [
    "gemini-3.6-flash",
    "gemini-flash-latest",
]


_llm_call_count = 0

class GeminiAdapter(LLMProvider):
    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
        self.model_name = model_name or settings.GEMINI_MODEL or "gemini-3.6-flash"

    def get_chat_model(self, model_name: Optional[str] = None, temperature: float = 0.2) -> BaseChatModel:
        target_model = model_name or self.model_name
        return ChatGoogleGenerativeAI(
            model=target_model,
            google_api_key=self.api_key,
            temperature=temperature,
            max_retries=1,
        )

    async def generate_response(
        self,
        messages: List[BaseMessage],
        temperature: float = 0.2,
    ) -> str:
        global _llm_call_count
        _llm_call_count += 1
        call_num = _llm_call_count
        candidates = [self.model_name]
        for m in FALLBACK_MODELS:
            if m not in candidates:
                candidates.append(m)

        last_error = None

        for model_cand in candidates:
            try:
                msg_preview = (messages[-1].content if messages else "")[:80].replace("\n", " ")
                logger.info(f"[LLM CALL] call_number={call_num} model={model_cand} message_count={len(messages)} snippet='{msg_preview}'")
                model = self.get_chat_model(model_name=model_cand, temperature=temperature)
                result = await model.ainvoke(messages)

                content = result.content
                if isinstance(content, list):
                    parts = []
                    for item in content:
                        if isinstance(item, dict) and "text" in item:
                            parts.append(item["text"])
                        elif isinstance(item, str):
                            parts.append(item)
                        else:
                            parts.append(str(item))
                    return "".join(parts).strip()
                return str(content).strip()

            except Exception as e:
                err_str = str(e).lower()
                last_error = e
                logger.warning(f"Model '{model_cand}' failed ({str(e)[:100]})")

                # If quota/rate limit error (429), fail immediately without wasting API calls cascading
                if "resource_exhausted" in err_str or "429" in err_str or "quota" in err_str:
                    raise RuntimeError("Gemini is temporarily unavailable because the AI quota has been reached. Please wait a moment or check your API key credits.") from e

                if "api_key" in err_str or "invalid" in err_str:
                    raise RuntimeError("Invalid Gemini API key provided. Please verify your API key in settings.") from e

                continue

        raise last_error or RuntimeError("All Gemini models in fallback cascade failed.")

    async def generate_stream(
        self,
        messages: List[BaseMessage],
        temperature: float = 0.2,
    ):
        candidates = [self.model_name]
        for m in FALLBACK_MODELS:
            if m not in candidates:
                candidates.append(m)

        last_error = None

        for model_cand in candidates:
            try:
                model = self.get_chat_model(model_name=model_cand, temperature=temperature)
                async for chunk in model.astream(messages):
                    content = chunk.content
                    if isinstance(content, list):
                        for item in content:
                            if isinstance(item, dict) and "text" in item:
                                yield item["text"]
                            elif isinstance(item, str):
                                yield item
                    elif isinstance(content, str) and content:
                        yield content
                return
            except Exception as e:
                err_str = str(e).lower()
                last_error = e
                logger.warning(f"Model '{model_cand}' stream failed ({str(e)[:100]})")
                if "resource_exhausted" in err_str or "429" in err_str or "quota" in err_str:
                    raise RuntimeError("Gemini is temporarily unavailable because the AI quota has been reached. Please wait a moment or check your API key credits.") from e
                if "api_key" in err_str or "invalid" in err_str:
                    raise RuntimeError("Invalid Gemini API key provided. Please verify your API key in settings.") from e
                continue

        raise last_error or RuntimeError("All Gemini models in streaming cascade failed.")
