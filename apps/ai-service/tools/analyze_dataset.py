import re
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
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

