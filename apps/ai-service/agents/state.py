from typing import TypedDict, List, Dict, Any, Optional
from schemas.chat import Citation, ChartSpec, TableSpec, AgentIntent


class AgentState(TypedDict, total=False):
    # Inputs
    user_id: str
    conversation_id: str
    message: str
    resource_ids: List[str]
    active_scope: Optional[Dict[str, Any]]
    shared_memory: Optional[str]
    history: List[Dict[str, str]]

    # Resolved Resources (Defense-in-depth ownership verified)
    resolved_documents: List[Dict[str, Any]]
    resolved_datasets: List[Dict[str, Any]]

    # Routing & Execution
    intent: AgentIntent
    citations: List[Citation]
    analysis_table: Optional[TableSpec]
    analysis_raw_result: Optional[Any]
    chart_spec: Optional[ChartSpec]
    chart_specs: Optional[List[ChartSpec]]
    python_code: Optional[str]
    execution_output: Optional[str]

    # Final Result
    final_answer: str
    downloadable_file: Optional[Dict[str, Any]]

