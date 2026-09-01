import os
import json
import logging
import re
from typing import Dict, Any, List, Literal, Optional
from bson import ObjectId
from langgraph.graph import StateGraph, END
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from agents.state import AgentState
from schemas.chat import AgentIntent, Citation, ChartSpec, TableSpec
from llm.factory import get_llm_provider
from core.database import get_database
from rag.retrieval import search_documents_vector
from data_analysis.dataset_loader import (
    load_dataframes_for_analysis,
    load_dataframe,
    load_dataframe_sync,
)
from tools.analyze_dataset import generate_and_execute_analysis
from tools.create_chart import generate_chart_specs
from tools.calculate import calculate_expression

logger = logging.getLogger(__name__)

ENTERPRISE_AI_PERSONA = """You are Syntra Chat, a direct, helpful, and knowledgeable colleague.
You work with employees to answer questions about company documents, technical research, financial data, and operational spreadsheets.

Communication Rules:
1. Speak plainly, directly, and naturally, like a thoughtful colleague explaining a concept at a desk.
2. NO EMOJIS: Do not include any emojis in your responses under any circumstances.
3. No Corporate Jargon or Stiff Phrasing: Avoid buzzwords and marketing language (such as "groundbreaking enterprise synergy", "unparalleled insights", "seamless paradigm"). State facts directly.
4. Never use robotic meta-commentary like "Based on the provided context", "According to the uploaded files", or "In the database chunks". Speak directly about the topic.
5. Present math and numbers cleanly. Avoid raw LaTeX symbols like $\\mathbf{...}$ or \\text{...}.
6. Structure answers clearly with concise paragraphs, straightforward bullet points, and clear headers.
7. Maintain active memory of the conversation thread and build seamlessly on previous questions.
8. Collection Shared Memory:
   - When chats are organized into a Collection, you have access to "COLLECTION SHARED MEMORY" containing established facts, decisions, and outcomes from other chats within this same collection.
   - You CAN and SHOULD reference and build upon these shared collection facts when answering, and acknowledge that you have access to the collection's shared context when asked.
9. Interactive Charts & Visualizations:
   - This enterprise chat UI natively renders interactive visual charts (bar, line, pie, donut, area), data tables, and PDF reports.
   - NEVER state that you "cannot generate visual graphs directly", "cannot display images/charts in this interface", or any similar disclaimers.
   - When the user asks for charts, graphs, plots, or visual comparisons, discuss the figures and trends directly with confidence. The interactive chart component will render alongside your response."""


# -------------------------------------------------------------
# Node 1: Resolve Context (Automatic Full Workspace Awareness)
# -------------------------------------------------------------
async def resolve_context_node(state: AgentState) -> Dict[str, Any]:
    user_id = state.get("user_id", "")
    resource_ids = state.get("resource_ids", [])

    resolved_docs: List[Dict[str, Any]] = []
    resolved_datasets: List[Dict[str, Any]] = []

    if not user_id:
        return {"resolved_documents": [], "resolved_datasets": []}

    db = get_database()
    docs_col = db["documents"]
    datasets_col = db["datasets"]
    user_obj_id = ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id

    # Fetch user to check role, status, departments, and allowedFolders
    users_col = db["users"]
    access_req_col = db["accessrequests"]
    
    user_doc = users_col.find_one({"_id": user_obj_id})
    if user_doc and user_doc.get("status") == "suspended":
        logger.warning(f"User {user_id} is suspended. Access denied.")
        return {"resolved_documents": [], "resolved_datasets": []}

    is_admin = bool(user_doc and user_doc.get("role") == "admin")
    user_deps = user_doc.get("departments", []) if user_doc else []
    allowed_folders = user_doc.get("allowedFolders", []) if user_doc else []
    
    approved_reqs = list(access_req_col.find({"userId": user_obj_id, "status": "approved"}))
    approved_ids = [str(r.get("resourceId")) for r in approved_reqs if r.get("resourceId")]

    def user_has_resource_access(doc: Dict[str, Any]) -> bool:
        if is_admin:
            return True
        doc_id_str = str(doc.get("_id", ""))
        owner_id = doc.get("userId")
        if str(owner_id) == str(user_obj_id) or str(owner_id) == str(user_id):
            return True
        if doc_id_str in approved_ids:
            return True

        # Department ACL
        allowed_deps = doc.get("allowedDepartments") or []
        if allowed_deps and len(allowed_deps) > 0:
            if not any(d in user_deps for d in allowed_deps):
                return False

        # Strict Folder ACL: exact folder matching only
        folder = doc.get("folder")
        if folder and folder.strip():
            folder_clean = folder.strip()
            return folder_clean in allowed_folders

        return True

    # Build RBAC filter
    if is_admin:
        rbac_filter = {}
    else:
        conditions = [
            {"userId": user_obj_id},
            {"userId": user_id},
        ]
        if approved_ids:
            obj_approved_ids = [ObjectId(i) for i in approved_ids if ObjectId.is_valid(i)]
            str_approved_ids = [i for i in approved_ids if not ObjectId.is_valid(i)]
            if obj_approved_ids:
                conditions.append({"_id": {"$in": obj_approved_ids}})
            if str_approved_ids:
                conditions.append({"_id": {"$in": str_approved_ids}})

        if allowed_folders:
            conditions.append({"folder": {"$in": allowed_folders}})

        conditions.append({"$or": [{"folder": {"$exists": False}}, {"folder": None}, {"folder": ""}]})
        rbac_filter = {"$or": conditions}

    is_scoped = len(resource_ids) > 0

    if is_scoped:
        for r_id in resource_ids:
            try:
                obj_id = ObjectId(r_id) if ObjectId.is_valid(r_id) else r_id
                doc = docs_col.find_one({"_id": obj_id})
                if doc:
                    if user_has_resource_access(doc):
                        doc["id"] = str(doc["_id"])
                        # If document is narrative and has 0 chunks in document_chunks for the active provider, auto-heal from GridFS
                        if doc.get("sourceType") != "tabular" and doc.get("fileType") not in ["csv", "xlsx", "xls"]:
                            from embeddings.factory import get_embedding_provider
                            active_embedder = get_embedding_provider()
                            if active_embedder.provider_name == "bge_local":
                                prov_filter = {"$or": [{"embedding_provider": "bge_local"}, {"embedding_provider": {"$exists": False}}]}
                            else:
                                prov_filter = {"embedding_provider": active_embedder.provider_name}

                            chunks_count = db["document_chunks"].count_documents({"document_id": doc["id"], **prov_filter})
                            if chunks_count == 0 and doc.get("storagePath"):
                                try:
                                    from core.gridfs_storage import get_gridfs_temp_file
                                    from rag.ingestion import process_and_ingest_document
                                    temp_info = get_gridfs_temp_file(doc.get("storagePath"), filename_hint=doc.get("originalName"))
                                    if temp_info:
                                        tpath, cleanup_fn = temp_info
                                        try:
                                            new_count = process_and_ingest_document(
                                                user_id=str(doc.get("userId")),
                                                document_id=doc["id"],
                                                file_path=tpath,
                                                filename=doc.get("originalName", "doc"),
                                                file_type=doc.get("fileType", "pdf"),
                                            )
                                            if new_count > 0:
                                                docs_col.update_one({"_id": doc["_id"]}, {"$set": {"chunkCount": new_count, "status": "ready"}})
                                                doc["chunkCount"] = new_count
                                                doc["status"] = "ready"
                                        finally:
                                            cleanup_fn()
                                except Exception as e:
                                    logger.warning(f"Auto-heal ingestion failed for document {doc['id']}: {e}")

                        if not any(rd["id"] == doc["id"] for rd in resolved_docs):
                            resolved_docs.append(doc)
                    else:
                        logger.info(f"User {user_id} denied access to document {r_id} due to folder ACL")
                    continue
                
                ds = datasets_col.find_one({"_id": obj_id})
                if ds:
                    if user_has_resource_access(ds):
                        ds["id"] = str(ds["_id"])
                        if not any(rds["id"] == ds["id"] for rds in resolved_datasets):
                            resolved_datasets.append(ds)
                    else:
                        logger.info(f"User {user_id} denied access to dataset {r_id} due to folder ACL")
            except Exception as e:
                logger.warning(f"Error resolving explicit resource {r_id}: {e}")
    else:
        try:
            user_docs = list(docs_col.find(rbac_filter))
            for d in user_docs:
                d["id"] = str(d["_id"])
                if not any(rd["id"] == d["id"] for rd in resolved_docs):
                    resolved_docs.append(d)

            user_datasets = list(datasets_col.find(rbac_filter))
            for ds in user_datasets:
                ds["id"] = str(ds["_id"])
                if not any(rds["id"] == ds["id"] for rds in resolved_datasets):
                    resolved_datasets.append(ds)

            # Unified files: add tabular documents to resolved_datasets
            for d in resolved_docs:
                if (d.get("sourceType") == "tabular" or d.get("fileType") in ["csv", "xlsx", "xls"]) and not any(rds["id"] == d["id"] for rds in resolved_datasets):
                    resolved_datasets.append(d)
        except Exception as e:
            logger.warning(f"Error loading user resources: {e}")

    # Also handle scoped items:
    for d in resolved_docs:
        if (d.get("sourceType") == "tabular" or d.get("fileType") in ["csv", "xlsx", "xls"]) and not any(rds["id"] == d["id"] for rds in resolved_datasets):
            resolved_datasets.append(d)

    logger.info(
        f"[DEBUG-4 AI Context Resolution] user_id={user_id}, is_scoped={is_scoped}, incoming_resource_ids={resource_ids}, "
        f"resolved_docs={[d.get('originalName') for d in resolved_docs]}, "
        f"resolved_datasets={[ds.get('originalName') for ds in resolved_datasets]}"
    )

    return {
        "resolved_documents": resolved_docs,
        "resolved_datasets": resolved_datasets,
    }


def format_workspace_manifest(docs: List[Dict[str, Any]], datasets: List[Dict[str, Any]]) -> str:
    parts = []
    if docs:
        parts.append("### Scoped / Available Knowledge Documents:")
        for d in docs:
            folder_str = f" (Folder: {d.get('folder')})" if d.get('folder') else ""
            status_str = f"Status: {d.get('status')}, Chunks: {d.get('chunkCount', 0)}"
            parts.append(f"- **{d.get('originalName')}** [{d.get('fileType', '').upper()}]{folder_str} — {status_str}")

    if datasets:
        parts.append("\n### Scoped / Available Analytical Datasets & Spreadsheets:")
        for ds in datasets:
            folder_str = f" (Folder: {ds.get('folder')})" if ds.get('folder') else ""
            cols = [c.get("name") for c in ds.get("sheets", [{}])[0].get("columns", [])] if ds.get("sheets") else []
            cols_preview = f", Columns: {', '.join(cols[:8])}" if cols else ""
            parts.append(f"- **{ds.get('originalName')}** [{ds.get('fileType', '').upper()}]{folder_str} — {ds.get('totalRows', 0)} rows{cols_preview}")

    return "\n".join(parts) if parts else "No documents or datasets selected in this scope."


# -------------------------------------------------------------
# Node 2: Route Intent
# -------------------------------------------------------------
async def route_intent_node(state: AgentState) -> Dict[str, Any]:
    message = state.get("message", "").lower().strip()
    history = state.get("history", [])
    resolved_docs = state.get("resolved_documents", [])
    resolved_datasets = state.get("resolved_datasets", [])
    shared_memory = state.get("shared_memory")

    # 1. Chart / Graph / Visualization Requests -> Priority 1 (Action-oriented, never refuse)
    chart_explicit_keywords = [
        "plot", "chart", "charts", "graph", "graphs", "visualize", "visualization", "visualizations",
        "histogram", "bar chart", "line chart", "pie chart", "scatter plot", "doughnut chart", "donut",
        "trend", "trends", "create graph", "create graphs", "make a graph", "generate graph", "generate chart",
        "render graph", "can't create graph", "cannot create graph", "no graph", "show graph", "make graph",
        "display graph", "create a chart", "make a chart", "render it"
    ]
    if any(k in message for k in chart_explicit_keywords):
        return {"intent": AgentIntent.CHART_REQUEST}

    # 2. Meta / Overview / Greetings / Capabilities / Collection Queries -> GENERAL_CHAT
    meta_queries = [
        "what are the information", "what information do you have", "what info do you have",
        "what do you have for now", "what is in my files", "what files do you have",
        "what data do you have", "what do you know", "what have we discussed",
        "summarize our chat", "what is in my library", "what documents",
        "collection", "collections", "other chats", "other chat", "shared memory", "shared context",
        "who are you", "what can you do", "help", "hello", "hi", "hey", "good morning", "good evening",
        "how are you", "thank you", "thanks", "ok", "okay", "sure", "cool"
    ]
    if any(re.search(r'\b' + re.escape(q) + r'\b', message) for q in meta_queries if len(q) <= 4) or any(q in message for q in meta_queries if len(q) > 4):
        # If user explicitly asked about data, calculation, or charts, do not trap under meta query
        has_action_intent = any(k in message for k in ["calculate", "average", "total", "sum", "weight", "highest", "lowest", "max", "min", "top", "sort", "chart", "graph", "plot"])
        if not has_action_intent:
            return {"intent": AgentIntent.GENERAL_CHAT}

    data_keywords = [
        "calculate", "average", "total", "sum", "rows", "top", "max", "min", "filter", "profit",
        "return", "cagr", "weight", "weightage", "breakdown", "analyze", "analytics", "statistics",
        "kpi", "compare", "comparison", "metrics", "distribution", "ranking", "difference"
    ]
    if len(resolved_datasets) > 0 and any(k in message for k in data_keywords):
        return {"intent": AgentIntent.DATA_ANALYSIS}

    if len(resolved_docs) > 0:
        return {"intent": AgentIntent.DOCUMENT_RAG}

    # If scoped datasets exist and user asked an analytical/factual question, route to data analysis
    if len(resolved_datasets) > 0:
        return {"intent": AgentIntent.DATA_ANALYSIS}

    # If the user did not ask a specific document question, default to general conversational response
    return {"intent": AgentIntent.GENERAL_CHAT}


# -------------------------------------------------------------
# Node 3: Unified Knowledge Retrieval & Cross-Document Synthesis
# -------------------------------------------------------------
async def document_rag_node(state: AgentState) -> Dict[str, Any]:
    user_id = state.get("user_id", "")
    message = state.get("message", "")
    resolved_docs = state.get("resolved_documents", [])
    history = state.get("history", [])
    shared_memory = state.get("shared_memory")

    doc_ids = [d["id"] for d in resolved_docs] if resolved_docs else None

    # Retrieve vector citations
    citations: List[Citation] = search_documents_vector(
        user_id=user_id,
        query=message,
        document_ids=doc_ids,
        history=history,
        top_k=8,
    )

    if not resolved_docs and not citations:
        return {
            "citations": [],
            "final_answer": "Access to the requested document or folder is restricted for your account. Please contact an administrator to request access.",
            "analysis_raw_result": "",
        }

    # If no semantic citations were found above the relevance threshold, do not force random arbitrary chunks
    llm = get_llm_provider()

    context_parts = []
    for idx, c in enumerate(citations):
        source_label = "Tabular Spreadsheet" if c.sourceType == "tabular" else "Narrative Document"
        page_str = f", Page {c.page}" if c.page else ""
        context_parts.append(
            f"--- Source [{source_label}: {c.filename}{page_str}] ---\n{c.textSnippet}"
        )
    context_str = "\n\n".join(context_parts)
    sources_text = ""
    if shared_memory:
        sources_text += f"--- Source [Collection Shared Context & Sibling Chat Facts] ---\n{shared_memory}\n\n"

    if context_str:
        sources_text += f"--- Sources [Retrieved Files & Spreadsheets] ---\n{context_str}\n\n"

    system_prompt = f"""{ENTERPRISE_AI_PERSONA}

AVAILABLE KNOWLEDGE SOURCES:
{sources_text if sources_text else "No knowledge files or collection notes available."}

INSTRUCTIONS:
- Answer the user's question directly using the AVAILABLE KNOWLEDGE SOURCES above (including facts established in Collection Shared Context).
- If the answer is in the Collection Shared Context or Retrieved Files, state the fact directly without boilerplate disclaimer.
- Only state that information is missing if it is truly absent from all provided knowledge sources above.
- Speak plainly, directly, and do not use emojis."""

    messages = [SystemMessage(content=system_prompt)]
    for h in history[-30:]:
        if h["role"] == "user":
            messages.append(HumanMessage(content=h["content"]))
        elif h["role"] == "assistant":
            messages.append(AIMessage(content=h["content"]))

    messages.append(HumanMessage(content=message))

    answer = await llm.generate_response(messages, temperature=0.1)

    return {
        "citations": citations,
        "final_answer": answer,
        "analysis_raw_result": context_str,
    }


# -------------------------------------------------------------
# Node 4: Data Analysis & Strategy Engine
# -------------------------------------------------------------
async def data_analysis_node(state: AgentState) -> Dict[str, Any]:
    message = state.get("message", "")
    resolved_docs = state.get("resolved_documents", [])
    resolved_datasets = state.get("resolved_datasets", [])
    history = state.get("history", [])

    if not resolved_datasets:
        return {
            "analysis_table": None,
            "analysis_raw_result": None,
            "python_code": None,
            "execution_output": None,
            "final_answer": "Access to the requested analytical dataset or folder is restricted for your account. Please contact an administrator to request access.",
        }

    all_dfs: Dict[str, Any] = {}
    schema_descriptions: List[str] = []

    if resolved_datasets:
        for ds in resolved_datasets:
            original_name = ds.get("originalName", "dataset")
            file_type = ds.get("fileType", "csv")

            _, dfs = load_dataframe_sync(ds)
            for k, v in dfs.items():
                all_dfs[k] = v

            columns = [c.get("name") for c in ds.get("sheets", [{}])[0].get("columns", [])] if ds.get("sheets") else []
            schema_descriptions.append(
                f"Dataset '{original_name}' (Type: {file_type}, Total rows: {ds.get('totalRows')})\nColumns: {', '.join(columns)}"
            )

    table_spec, raw_result, code, stdout, error = await generate_and_execute_analysis(
        question=message,
        dataframes=all_dfs,
        schema_descriptions=schema_descriptions,
    )

    llm = get_llm_provider()
    workspace_manifest = format_workspace_manifest(resolved_docs, resolved_datasets)

    summary_prompt = f"""You are Syntra Chat, an expert analytical colleague.
Answer the user's question directly, concisely, and factually based strictly on the computed data below.
Rules:
- DO NOT use emojis.
- DO NOT use meta-commentary or filler phrases.
- DO NOT state that you cannot create or display visual graphs/charts. (Interactive charts are rendered alongside your response).
- DO NOT output raw JSON blocks. State the figures, top leaders, percentages, and comparison findings directly in clean prose or bullet points.

Computed Analysis Data:
{str(raw_result)[:2500]}

Calculations details:
{stdout}
"""

    messages = [
        SystemMessage(content=f"{ENTERPRISE_AI_PERSONA}\n\nScoped Resources:\n{workspace_manifest}"),
    ]
    for h in history[-30:]:
        if h["role"] == "user":
            messages.append(HumanMessage(content=h["content"]))
        elif h["role"] == "assistant":
            messages.append(AIMessage(content=h["content"]))
    messages.append(HumanMessage(content=message + "\n\n" + summary_prompt))

    summary_answer = await llm.generate_response(messages, temperature=0.15)
    # Strip any accidental ```json ``` code blocks from the narrative
    summary_answer = re.sub(r'```(?:json)?\s*[\{\[].*?[\}\]]\s*```', '', summary_answer, flags=re.DOTALL).strip()

    return {
        "analysis_table": table_spec,
        "analysis_raw_result": raw_result,
        "python_code": code,
        "execution_output": stdout,
        "final_answer": summary_answer,
    }


# -------------------------------------------------------------
# Node 5: Chart Builder (Explicit Requests Only)
# -------------------------------------------------------------
async def chart_builder_node(state: AgentState) -> Dict[str, Any]:
    message = state.get("message", "")
    raw_result = state.get("analysis_raw_result")
    table_spec = state.get("analysis_table")
    final_answer = state.get("final_answer", "")
    history = state.get("history", [])

    full_chart_request = message
    if len(message.split()) <= 8 and history:
        prev_user_requests = " ".join([h.get("content", "") for h in history[-4:] if h.get("role") == "user"])
        full_chart_request = f"{message} (Context: {prev_user_requests})"

    resolved_datasets = state.get("resolved_datasets", [])
    
    if raw_result is not None:
        data_context = raw_result
    elif table_spec is not None:
        data_context = table_spec.model_dump() if hasattr(table_spec, 'model_dump') else table_spec
    else:
        data_context = final_answer

    # Fallback to load dataset preview directly if data_context is weak or missing
    if (raw_result is None and table_spec is None) and len(resolved_datasets) > 0:
        try:
            ds = resolved_datasets[0]
            df, _ = await load_dataframe(ds)
            if df is not None and not df.empty:
                data_context = f"Dataset: {ds.get('originalName')}\n" + str(df.head(40).to_dict(orient="records"))
        except Exception as e:
            logger.warning(f"Fallback dataset preview load error: {e}")

    chart_specs = await generate_chart_specs(full_chart_request, data_context)

    # Clean narrative of any JSON blocks
    cleaned_answer = final_answer
    if cleaned_answer:
        cleaned_answer = re.sub(r'```(?:json)?\s*[\{\[].*?[\}\]]\s*```', '', cleaned_answer, flags=re.DOTALL).strip()

    passive_phrases = ["cannot generate", "cannot display", "ready to display", "let me know if you would like", "cannot produce"]
    if not cleaned_answer or any(p in cleaned_answer.lower() for p in passive_phrases):
        if chart_specs:
            titles = ", ".join([f"'{c.title}'" for c in chart_specs])
            cleaned_answer = f"Generated interactive visualization ({titles}) based on the workspace data."

    return {
        "chart_spec": chart_specs[0] if chart_specs else None,
        "chart_specs": chart_specs,
        "final_answer": cleaned_answer if cleaned_answer else final_answer,
    }


# -------------------------------------------------------------
# Node 6: Calculator
# -------------------------------------------------------------
async def calculator_node(state: AgentState) -> Dict[str, Any]:
    message = state.get("message", "")
    result = await calculate_expression(message)
    return {"final_answer": result}


# -------------------------------------------------------------
# Node 7: General Chat
# -------------------------------------------------------------
async def general_chat_node(state: AgentState) -> Dict[str, Any]:
    message = state.get("message", "")
    history = state.get("history", [])
    resolved_docs = state.get("resolved_documents", [])
    resolved_datasets = state.get("resolved_datasets", [])
    llm = get_llm_provider()

    workspace_manifest = format_workspace_manifest(resolved_docs, resolved_datasets)
    shared_memory = state.get("shared_memory")
    shared_mem_str = f"\nCOLLECTION SHARED MEMORY (Established facts & decisions from related chats in this collection):\n{shared_memory}\n" if shared_memory else ""

    system_prompt = f"""{ENTERPRISE_AI_PERSONA}
{shared_mem_str}
CURRENT AUTHORIZED WORKSPACE INVENTORY:
{workspace_manifest}

CRITICAL ACCESS CONTROL & ANTI-DATA-LEAK RULES (HIGHEST PRIORITY):
1. You only have access to the items explicitly listed under CURRENT AUTHORIZED WORKSPACE INVENTORY above.
2. If the user asks about, asks to access, or requests data/details from any folder, dataset, or file that is NOT in the authorized inventory above:
   - State clearly that you do not have access to that resource because access is restricted for their account.
   - Never claim access to restricted items or quote figures from restricted resources.
3. Answer all authorized topics plainly, helpfully, and without emojis."""

    messages = [SystemMessage(content=system_prompt)]
    for h in history[-30:]:
        if h["role"] == "user":
            messages.append(HumanMessage(content=h["content"]))
        elif h["role"] == "assistant":
            messages.append(AIMessage(content=h["content"]))
    messages.append(HumanMessage(content=f"{message}\n\n[System Instruction: If the question relates to collection context, answer using COLLECTION SHARED MEMORY. Verify files against Current Authorized Workspace Inventory. If an unauthorized resource is requested, decline access. No emojis.]"))

    answer = await llm.generate_response(messages, temperature=0.15)
    return {"final_answer": answer}


# -------------------------------------------------------------
# Router Condition
# -------------------------------------------------------------
def route_next_step(state: AgentState) -> Literal["document_rag", "data_analysis", "chart_request", "calculator", "general_chat"]:
    intent = state.get("intent", AgentIntent.GENERAL_CHAT)
    if intent == AgentIntent.DOCUMENT_RAG:
        return "document_rag"
    elif intent in [AgentIntent.DATA_ANALYSIS, AgentIntent.COMBINED]:
        return "data_analysis"
    elif intent == AgentIntent.CHART_REQUEST:
        return "chart_request"
    elif intent == AgentIntent.CALCULATION:
        return "calculator"
    else:
        return "general_chat"


# -------------------------------------------------------------
# StateGraph Construction
# -------------------------------------------------------------
def build_agent_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("resolve_context", resolve_context_node)
    workflow.add_node("route_intent", route_intent_node)
    workflow.add_node("document_rag", document_rag_node)
    workflow.add_node("data_analysis", data_analysis_node)
    workflow.add_node("chart_builder", chart_builder_node)
    workflow.add_node("calculator", calculator_node)
    workflow.add_node("general_chat", general_chat_node)

    workflow.set_entry_point("resolve_context")
    workflow.add_edge("resolve_context", "route_intent")

    workflow.add_conditional_edges(
        "route_intent",
        route_next_step,
        {
            "document_rag": "document_rag",
            "data_analysis": "data_analysis",
            "chart_request": "data_analysis",
            "calculator": "calculator",
            "general_chat": "general_chat",
        },
    )

    # Build charts if intent is CHART_REQUEST or user message requests visualization
    def should_build_chart_from_analysis(state: AgentState) -> Literal["chart_builder", "__end__"]:
        intent = state.get("intent")
        if intent == AgentIntent.CHART_REQUEST:
            return "chart_builder"
        msg = state.get("message", "").lower()
        chart_keywords = ["plot", "chart", "charts", "graph", "graphs", "visualize", "visualization", "histogram", "bar chart", "line chart", "pie chart", "scatter", "doughnut", "donut", "trend"]
        if any(k in msg for k in chart_keywords):
            return "chart_builder"
        return "__end__"

    def should_build_chart_from_doc(state: AgentState) -> Literal["chart_builder", "__end__"]:
        intent = state.get("intent")
        if intent == AgentIntent.CHART_REQUEST:
            return "chart_builder"
        msg = state.get("message", "").lower()
        chart_keywords = ["plot", "chart", "charts", "graph", "graphs", "visualize", "visualization", "histogram", "bar chart", "line chart", "pie chart", "scatter", "doughnut", "donut", "trend"]
        if any(k in msg for k in chart_keywords):
            return "chart_builder"
        return "__end__"

    workflow.add_conditional_edges(
        "data_analysis",
        should_build_chart_from_analysis,
        {
            "chart_builder": "chart_builder",
            "__end__": END,
        },
    )

    workflow.add_conditional_edges(
        "document_rag",
        should_build_chart_from_doc,
        {
            "chart_builder": "chart_builder",
            "__end__": END,
        },
    )

    workflow.add_edge("chart_builder", END)
    workflow.add_edge("calculator", END)
    workflow.add_edge("general_chat", END)

    return workflow.compile()


agent_graph = build_agent_graph()
