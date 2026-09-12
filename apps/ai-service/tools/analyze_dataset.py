import re
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np
from langchain_core.messages import SystemMessage, HumanMessage
from llm.factory import get_llm_provider
from data_analysis.sandbox import execute_sandboxed_pandas, format_analysis_result_as_table
from schemas.chat import TableSpec


def extract_python_code(llm_output: str) -> str:
    """Extracts python code from markdown code blocks or plain text."""
    match = re.search(r"```(?:python|py)?\s*(.*?)\s*```", llm_output, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return llm_output.strip()


async def generate_and_execute_analysis(
    question: str,
    dataframes: Dict[str, pd.DataFrame],
    schema_descriptions: List[str],
) -> Tuple[Optional[TableSpec], Optional[Any], str, str, Optional[str]]:
    """
    Generates pandas code using LLM, runs in sandbox, returns:
    (table_spec, raw_result, python_code, stdout, error_message)
    """
    llm = get_llm_provider()

    schema_text = "\n\n".join(schema_descriptions)

    system_prompt = f"""You are an expert Python data analyst.
You write clean, precise pandas code to analyze datasets, compute metrics, and prepare data for visualizations.

Available datasets in execution scope:
{schema_text}

Rules:
1. All datasets are ALREADY pre-loaded into in-memory pandas DataFrame variables named `df` (or sheet names). NEVER call `pd.read_csv()`, `pd.read_excel()`, or `open()`.
2. Store the computed result (table, series, or summary DataFrame) in a variable called `result` (e.g. `result = df.head(15)` or `result = df.groupby('Category')['Revenue'].sum().reset_index()`).
3. Print key summary metrics and findings using `print()`.
4. If the question asks for a chart/graph/plot, extract the top items or grouped dimensions into `result` so the chart builder has rich structured data.
5. Only output executable Python code inside a ```python ``` block. No extra markdown explanation outside the code block.
6. Do NOT import os, sys, subprocess, requests.
7. When checking DataFrames or Series, NEVER do `if df:` or `if result:` or `if df[col]:` (which causes ValueError: The truth value of a DataFrame is ambiguous). Use `if not df.empty:` or `df.loc[...]`.
"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Question: {question}\n\nWrite python pandas code to answer this:"),
    ]

    llm_response = await llm.generate_response(messages, temperature=0.1)
    code = extract_python_code(llm_response)

    raw_result, stdout, error = execute_sandboxed_pandas(code, dataframes)

    # If code execution failed or returned None, use automatic dataframe sample fallback
    has_valid_result = raw_result is not None and (
        not isinstance(raw_result, (pd.DataFrame, pd.Series)) or not raw_result.empty
    )

    if (not has_valid_result or bool(error)) and len(dataframes) > 0:
        primary_df = dataframes.get("df")
        if primary_df is None and len(dataframes) > 0:
            primary_df = next(iter(dataframes.values()))
        if primary_df is not None and not primary_df.empty:
            raw_result = primary_df.head(20)
            stdout = f"Dataset Overview: {len(primary_df)} rows and {len(primary_df.columns)} columns ({', '.join(list(primary_df.columns)[:8])})."

    table_spec = format_analysis_result_as_table(raw_result)

    # Convert DataFrame/Series to clean JSON-serializable structures to prevent DataFrame truth-value ambiguity
    serializable_raw_result = raw_result
    if isinstance(raw_result, pd.DataFrame):
        serializable_raw_result = raw_result.head(100).to_dict(orient="records")
    elif isinstance(raw_result, pd.Series):
        serializable_raw_result = raw_result.head(100).to_dict()

    return table_spec, serializable_raw_result, code, stdout, error


def try_format_deterministic_dataset_result(
    question: str,
    raw_result: Any,
    stdout: str,
    dataset_name: str = "the dataset",
) -> Optional[str]:
    """
    Attempts to format a pure deterministic dataset result without calling Gemini a second time.
    Returns formatted natural language string if safe and deterministic, otherwise None (falling back to LLM).
    """
    if raw_result is None:
        return None

    clean_q = question.lower().strip()

    # 1. Guard against open-ended or interpretive queries
    interpretive_keywords = [
        "why", "explain", "reason", "pattern", "trend", "insight", "unusual",
        "risky", "risk", "difference", "diff", "compare", "breakdown", "distribution",
        "recommend", "cause", "anomaly", "sentiment", "overview", "summary",
        "summarize", "describe", "interpretation", "strategy", "meaning"
    ]
    if any(re.search(r'\b' + re.escape(k) + r'\b', clean_q) for k in interpretive_keywords):
        return None

    # 2. Row count / Record count fast-path
    row_count_patterns = [
        r"\bhow\s+many\s+(?:rows?|records?|entries|items|lines)\b",
        r"\b(?:row|record|entry|item|line)\s+count\b",
        r"\btotal\s+(?:rows?|records?|entries|items|lines)\b",
        r"\bnumber\s+of\s+(?:rows?|records?|entries|items|lines)\b",
        r"\bcount\s+of\s+(?:rows?|records?|entries|items|lines)\b",
    ]
    is_row_count_query = any(re.search(p, clean_q) for p in row_count_patterns)

    if is_row_count_query:
        count_val = None
        if isinstance(raw_result, (int, float, np.integer, np.floating)):
            count_val = int(raw_result)
        elif isinstance(raw_result, dict) and len(raw_result) == 1:
            val = next(iter(raw_result.values()))
            if isinstance(val, (int, float, np.integer, np.floating)):
                count_val = int(val)
        elif isinstance(raw_result, list) and len(raw_result) == 1 and isinstance(raw_result[0], dict) and len(raw_result[0]) == 1:
            val = next(iter(raw_result[0].values()))
            if isinstance(val, (int, float, np.integer, np.floating)):
                count_val = int(val)

        if count_val is not None:
            return f"The dataset '{dataset_name}' contains {count_val:,} rows."

    # 3. Single scalar metric calculations (e.g. sum, average, min, max)
    metric_patterns = [
        (r"\b(?:total|sum)\b", "total"),
        (r"\b(?:average|avg|mean)\b", "average"),
        (r"\b(?:maximum|max|highest)\b", "maximum"),
        (r"\b(?:minimum|min|lowest)\b", "minimum"),
        (r"\b(?:median)\b", "median"),
        (r"\b(?:std|standard\s+deviation)\b", "standard deviation"),
    ]
    matched_metric = None
    for p, metric_name in metric_patterns:
        if re.search(p, clean_q):
            matched_metric = metric_name
            break

    if matched_metric:
        scalar_val = None
        key_name = None
        if isinstance(raw_result, (int, float, np.integer, np.floating)):
            scalar_val = raw_result
        elif isinstance(raw_result, dict) and len(raw_result) == 1:
            k, v = next(iter(raw_result.items()))
            if isinstance(v, (int, float, np.integer, np.floating)):
                scalar_val = v
                key_name = k
        elif isinstance(raw_result, list) and len(raw_result) == 1 and isinstance(raw_result[0], dict) and len(raw_result[0]) == 1:
            k, v = next(iter(raw_result[0].items()))
            if isinstance(v, (int, float, np.integer, np.floating)):
                scalar_val = v
                key_name = k

        if scalar_val is not None:
            if isinstance(scalar_val, (int, np.integer)) or (isinstance(scalar_val, (float, np.floating)) and float(scalar_val).is_integer()):
                formatted_num = f"{int(scalar_val):,}"
            else:
                formatted_num = f"{float(scalar_val):,.2f}".rstrip("0").rstrip(".") if abs(float(scalar_val)) >= 0.01 else f"{float(scalar_val):.4f}"

            label = key_name if key_name else matched_metric
            clean_stdout = stdout.strip() if stdout else ""
            if clean_stdout and len(clean_stdout.splitlines()) == 1 and len(clean_stdout) < 120 and ("$" in clean_stdout or "%" in clean_stdout or ":" in clean_stdout):
                return clean_stdout

            return f"The calculated {label} for '{dataset_name}' is {formatted_num}."

    return None

