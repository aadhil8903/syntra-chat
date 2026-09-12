import json
import re
from typing import Any, Optional, Dict, List
from langchain_core.messages import SystemMessage, HumanMessage
from llm.factory import get_llm_provider
from schemas.chat import ChartSpec, ChartType, ChartSeries


def try_construct_deterministic_chart(
    user_request: str,
    data_context: Any,
) -> Optional[ChartSpec]:
    """
    Attempts to deterministically construct a ChartSpec from structured 2-column or key-value data.
    Returns ChartSpec if structure is unambiguous, otherwise None (falling back to Gemini LLM).
    """
    if data_context is None:
        return None

    clean_req = user_request.lower()

    # Determine chart type from request
    chart_type = ChartType.BAR
    if any(k in clean_req for k in ["line", "trend", "over time", "timeline", "monthly", "yearly", "quarterly", "daily"]):
        chart_type = ChartType.LINE
    elif "pie" in clean_req:
        chart_type = ChartType.PIE
    elif any(k in clean_req for k in ["donut", "doughnut"]):
        chart_type = ChartType.DOUGHNUT
    elif "area" in clean_req:
        chart_type = ChartType.AREA
    elif "scatter" in clean_req:
        chart_type = ChartType.SCATTER

    labels: List[str] = []
    values: List[float] = []
    x_label = "Category"
    y_label = "Value"
    title_metric = "Metrics"

    def parse_num(val: Any) -> Optional[float]:
        if val is None:
            return None
        if isinstance(val, (int, float)):
            return float(val)
        val_str = str(val).replace("$", "").replace(",", "").replace("%", "").strip()
        try:
            return float(val_str)
        except ValueError:
            return None

    # Case 1: List of dict records (e.g. [{'Region': 'North', 'Revenue': 100}, ...])
    if isinstance(data_context, list) and len(data_context) >= 2 and isinstance(data_context[0], dict):
        first_item = data_context[0]
        keys = list(first_item.keys())
        if len(keys) == 2:
            cat_key, num_key = None, None
            # Find which key is numeric and which is categorical
            for k in keys:
                test_val = parse_num(first_item[k])
                if test_val is not None:
                    num_key = k
                else:
                    cat_key = k

            if cat_key is not None and num_key is not None:
                parsed_labels = []
                parsed_values = []
                for row in data_context[:25]:
                    if isinstance(row, dict) and cat_key in row and num_key in row:
                        n = parse_num(row[num_key])
                        if n is not None:
                            parsed_labels.append(str(row[cat_key]))
                            parsed_values.append(n)
                if len(parsed_labels) >= 2 and len(parsed_labels) == len(parsed_values):
                    labels = parsed_labels
                    values = parsed_values
                    x_label = str(cat_key)
                    y_label = str(num_key)
                    title_metric = str(num_key)

    # Case 2: Dict of {category: numeric_value} (e.g. {'North': 500, 'South': 800})
    elif isinstance(data_context, dict) and len(data_context) >= 2:
        parsed_labels = []
        parsed_values = []
        for k, v in list(data_context.items())[:25]:
            n = parse_num(v)
            if n is not None:
                parsed_labels.append(str(k))
                parsed_values.append(n)
            else:
                break
        if len(parsed_labels) >= 2 and len(parsed_labels) == min(len(data_context), 25):
            labels = parsed_labels
            values = parsed_values
            x_label = "Category"
            y_label = "Value"
            title_metric = "Data Distribution"

    # Case 3: TableSpec object or dict with 'columns' and 'rows'
    elif hasattr(data_context, "columns") and hasattr(data_context, "rows"):
        cols = getattr(data_context, "columns", [])
        rows = getattr(data_context, "rows", [])
        if len(cols) == 2 and len(rows) >= 2:
            parsed_labels = []
            parsed_values = []
            for r in rows[:25]:
                if len(r) >= 2:
                    n = parse_num(r[1])
                    if n is not None:
                        parsed_labels.append(str(r[0]))
                        parsed_values.append(n)
            if len(parsed_labels) >= 2 and len(parsed_labels) == len(parsed_values):
                labels = parsed_labels
                values = parsed_values
                x_label = str(cols[0])
                y_label = str(cols[1])
                title_metric = str(cols[1])

    if labels and values and len(labels) == len(values):
        title = f"{title_metric} by {x_label}" if x_label != "Category" else f"{title_metric} Overview"
        series = [
            ChartSeries(
                name=y_label if y_label != "Value" else "Value",
                data=values,
                color="#3b82f6",
            )
        ]
        return ChartSpec(
            chartType=chart_type,
            title=title,
            xAxisLabel=x_label,
            yAxisLabel=y_label,
            labels=labels,
            series=series,
            description=f"Visualization showing {y_label.lower()} across {x_label.lower()}.",
        )

    return None


async def generate_chart_specs(
    user_request: str,
    data_context: Any,
) -> List[ChartSpec]:
    """
    Constructs one or more structured ChartSpecs matching user request.
    Uses deterministic construction when data structure is unambiguous, falling back to LLM.
    """
    # 1. Fast-Path: Deterministic Chart Generation
    deterministic_chart = try_construct_deterministic_chart(user_request, data_context)
    if deterministic_chart is not None:
        return [deterministic_chart]

    # 2. LLM Fallback for complex/ambiguous data
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
