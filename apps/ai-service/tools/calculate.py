import math
from langchain_core.messages import SystemMessage, HumanMessage
from llm.factory import get_llm_provider


async def calculate_expression(question: str) -> str:
    """Calculates mathematical expressions or numeric reasoning."""
    llm = get_llm_provider()

    system_prompt = """You are a precise calculation assistant.
Solve the calculation step by step and provide the final numeric result clearly highlighted."""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=question),
    ]

    return await llm.generate_response(messages, temperature=0.0)

