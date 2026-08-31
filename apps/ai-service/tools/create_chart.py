import json
import re
from typing import Any, Optional, Dict, List
from langchain_core.messages import SystemMessage, HumanMessage
from llm.factory import get_llm_provider
from schemas.chat import ChartSpec, ChartType, ChartSeries


async def generate_chart_specs(
    user_request: str,
    data_context: Any,
) -> List[ChartSpec]:
    """Uses LLM to construct one or more structured ChartSpecs from data matching user request."""
    llm = get_llm_provider()

    system_prompt = """You are a senior data visualization architect.
Your job is to generate flat, clean, production-grade JSON chart specifications from the provided data matching the user request.

Chart Guidelines:
- Construct an informative, accurate chart from the data provided.
- If the user asks to see a chart, plot, graph, or asks whether a graph can be rendered, ALWAYS generate the chart specification using the available dataset fields.
- Choose the best chart type: "bar", "line", "pie", "doughnut", "scatter", or "area".
- Colors must be flat and distinct (e.g., #3b82f6, #10b981, #f59e0b, #8b5cf6, #ec4899, #06b6d4). No glows or gradients.
- NO EMOJIS in titles, labels, or descriptions.

Output Schema MUST be a JSON array of chart objects:
[
  {
    "chartType": "bar" | "line" | "pie" | "scatter" | "doughnut" | "area",
    "title": "Descriptive title without emojis",
    "xAxisLabel": "Label for X-axis",
    "yAxisLabel": "Label for Y-axis",
    "labels": ["Category A", "Category B", "Category C"],
    "series": [
      {
        "name": "Metric Name",
        "data": [120.5, 340.0, 210.2],
        "color": "#3b82f6"
      }
    ],
    "description": "Clear explanation of the chart"
  }
]

Ensure all numerical series arrays are formatted as valid numbers (not strings).
Output ONLY the JSON array inside a ```json ``` block."""

    context_str = str(data_context) if data_context is not None else ""
    if len(context_str) > 3500:
        context_str = context_str[:3500]

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"User Request: {user_request}\n\nData Context:\n{context_str}\n\nGenerate JSON Chart Array:"),
    ]

    response = await llm.generate_response(messages, temperature=0.1)

    # Extract JSON block
    match_arr = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", response, re.DOTALL)
    match_obj = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", response, re.DOTALL)

    charts: List[ChartSpec] = []

    if match_arr:
        json_str = match_arr.group(1)
        try:
            items = json.loads(json_str)
            for item in items:
                charts.append(ChartSpec(**item))
            return charts
        except Exception:
            pass

    if match_obj:
        json_str = match_obj.group(1)
        try:
            item = json.loads(json_str)
            return [ChartSpec(**item)]
        except Exception:
            pass

    # Fallback to loose extraction
    try:
        if "[" in response and "]" in response:
            sub = response[response.find("["):response.rfind("]") + 1]
            items = json.loads(sub)
            for item in items:
                charts.append(ChartSpec(**item))
            return charts
        elif "{" in response and "}" in response:
            sub = response[response.find("{"):response.rfind("}") + 1]
            item = json.loads(sub)
            return [ChartSpec(**item)]
    except Exception:
        pass

    return []


async def generate_chart_spec(
    user_request: str,
    data_context: Any,
) -> Optional[ChartSpec]:
    specs = await generate_chart_specs(user_request, data_context)
    return specs[0] if specs else None
