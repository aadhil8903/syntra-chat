from typing import List, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage
from llm.base import LLMProvider
from core.config import get_settings


class LocalLLMAdapter(LLMProvider):
    def __init__(self, base_url: Optional[str] = None, model_name: Optional[str] = None):
        settings = get_settings()
        self.base_url = base_url or settings.LOCAL_LLM_BASE_URL
        self.model_name = model_name or settings.LOCAL_LLM_MODEL

    def get_chat_model(self, temperature: float = 0.2) -> BaseChatModel:
        try:
            from langchain_ollama import ChatOllama
            return ChatOllama(
                base_url=self.base_url,
                model=self.model_name,
                temperature=temperature,
            )
        except ImportError:
            try:
                from langchain_community.chat_models.ollama import ChatOllama
                return ChatOllama(
                    base_url=self.base_url,
                    model=self.model_name,
                    temperature=temperature,
                )
            except ImportError:
                raise ImportError(
                    "Local LLM requires langchain-ollama or langchain-community. Please install langchain-ollama."
                )

    async def generate_response(
        self,
        messages: List[BaseMessage],
        temperature: float = 0.2,
    ) -> str:
        model = self.get_chat_model(temperature=temperature)
        result = await model.ainvoke(messages)
        return str(result.content)

    async def generate_stream(
        self,
        messages: List[BaseMessage],
        temperature: float = 0.2,
    ):
        model = self.get_chat_model(temperature=temperature)
        async for chunk in model.astream(messages):
            yield str(chunk.content)

