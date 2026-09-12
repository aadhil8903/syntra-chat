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
from tools.analyze_dataset import (
    generate_and_execute_analysis,
    try_format_deterministic_dataset_result,
)
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
   - When the user asks for charts, graphs, plots, or visual comparisons, discuss the figures and trends directly with confidence. The interactive chart component will render alongside your response.
10. File Downloads & Documents:
   - This chat UI natively renders inline downloadable file cards directly below your message when a user requests a file.
   - NEVER tell the user to "download it from the file viewer panel", "click the download icon in the file viewer", or look for an external download button.
   - When asked for a file or PDF, acknowledge the file naturally ("Here is the file.", "Sure, here is the file."). The system automatically attaches the inline download card.
11. Strict Grounding & Anti-Hallucination:
   - NEVER invent, assume, or fabricate a file reference or dataset reference.
   - If the user asks to compare, analyze, or summarize without providing or selecting specific files, always ask for clarification ("Which files would you like me to compare?").
   - NEVER silently select arbitrary files from the workspace and pretend the user requested them.
12. Direct Messages & Reply Invocations:
   - When invited into a direct team message with @Syntra or replying to a previous colleague message (e.g. `[Replying to message from User: "..."]`), address the quoted message directly and assist the team members seamlessly as a collaborative AI partner."""


# -------------------------------------------------------------
# Node 1: Resolve Context (Automatic Full Workspace Awareness)
# -------------------------------------------------------------
async def resolve_context_node(state: AgentState) -> Dict[str, Any]:
    user_id = state.get("user_id", "")
    resource_ids = list(state.get("resource_ids", []))
    active_scope = state.get("active_scope")
    if active_scope and active_scope.get("id") and active_scope.get("type") in ["document", "dataset", "file"]:
        scope_id = str(active_scope["id"])
        if scope_id not in [str(r) for r in resource_ids]:
            resource_ids.append(scope_id)

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
    
    user_query = [{"_id": user_obj_id}]
    if str(user_id) != str(user_obj_id):
        user_query.append({"_id": str(user_id)})
    user_doc = users_col.find_one({"$or": user_query}) if user_query else None
    if user_doc and user_doc.get("status") == "suspended":
        logger.warning(f"User {user_id} is suspended. Access denied.")
        return {"resolved_documents": [], "resolved_datasets": []}

    role_from_doc = str(user_doc.get("role", "")).lower().strip() if user_doc else ""
    roles_from_doc = [str(r).lower().strip() for r in (user_doc.get("roles") or [])] if user_doc else []
    payload_role = str(state.get("user_role", "")).lower().strip()

    is_admin = (
        role_from_doc in ["admin", "master_admin", "superadmin"]
        or payload_role in ["admin", "master_admin", "superadmin"]
        or any(r in ["admin", "master_admin", "superadmin"] for r in roles_from_doc)
    )
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
                doc = docs_col.find_one({"_id": obj_id}) or docs_col.find_one({"_id": str(r_id)})
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
                
                ds = datasets_col.find_one({"_id": obj_id}) or datasets_col.find_one({"_id": str(r_id)})
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
        # Check if the user message explicitly mentions any filenames or document titles
        raw_msg = state.get("message", "")
        raw_msg_lower = raw_msg.lower()
        try:
            all_accessible_docs = list(docs_col.find(rbac_filter))
            all_accessible_datasets = list(datasets_col.find(rbac_filter))

            for d in all_accessible_docs:
                d["id"] = str(d["_id"])
                orig = str(d.get("originalName", "")).lower()
                name_no_ext = re.sub(r"\.[a-zA-Z0-9]+$", "", orig)
                if orig and (orig in raw_msg_lower or (len(name_no_ext) >= 4 and name_no_ext in raw_msg_lower)):
                    if not any(rd["id"] == d["id"] for rd in resolved_docs):
                        resolved_docs.append(d)

            for ds in all_accessible_datasets:
                ds["id"] = str(ds["_id"])
                orig = str(ds.get("originalName", "")).lower()
                name_no_ext = re.sub(r"\.[a-zA-Z0-9]+$", "", orig)
                if orig and (orig in raw_msg_lower or (len(name_no_ext) >= 4 and name_no_ext in raw_msg_lower)):
                    if not any(rds["id"] == ds["id"] for rds in resolved_datasets):
                        resolved_datasets.append(ds)

            # If explicit filenames were matched in the text, mark as scoped
            if resolved_docs or resolved_datasets:
                is_scoped = True
            else:
                # Load docs if the user is requesting inventory overview or natural language file search/discovery
                is_inventory_query = bool(re.search(
                    r"\b(what files|list files|show files|available files|what documents|what data do you have|what files do you have|what is in my files|what is in my library|all files|all documents)\b",
                    raw_msg_lower
                ))
                file_keywords = ["pdf", "file", "document", "handbook", "guide", "report", "policy", "agreement", "manual", "spreadsheet", "dataset"]
                file_request_verbs = [
                    "give me", "can i get", "can i have", "can i download", "i wanna download", "i want to download",
                    "download", "find", "get me", "where is", "send me", "show me", "fetch", "locate", "i need"
                ]
                has_file_kw = any(k in raw_msg_lower for k in file_keywords) or ".pdf" in raw_msg_lower or "@" in raw_msg_lower
                has_verb = any(v in raw_msg_lower for v in file_request_verbs)
                is_resource_query = (has_file_kw and has_verb) or bool(re.match(r"^(download|get)\s+", raw_msg_lower)) or "i wanna download" in raw_msg_lower or "can i download" in raw_msg_lower

                if is_inventory_query or is_resource_query:
                    for d in all_accessible_docs:
                        d["id"] = str(d["_id"])
                        if not any(rd["id"] == d["id"] for rd in resolved_docs):
                            resolved_docs.append(d)
                    for ds in all_accessible_datasets:
                        ds["id"] = str(ds["_id"])
                        if not any(rds["id"] == ds["id"] for rds in resolved_datasets):
                            resolved_datasets.append(ds)
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
        "is_admin": is_admin,
        "is_scoped": is_scoped,
    }


def detect_ungrounded_operation(
    message: str,
    resolved_docs: List[Dict[str, Any]],
    resolved_datasets: List[Dict[str, Any]],
    active_scope: Optional[Dict[str, Any]],
    resource_ids: List[str],
) -> Optional[Dict[str, Any]]:
    clean_msg = message.lower().strip()

    # Calculate count of explicit user-provided / resolvable target files
    target_ids = set(resource_ids or [])
    if active_scope and active_scope.get("id"):
        target_ids.add(str(active_scope.get("id")))

    # Check for filenames extracted in message
    for d in resolved_docs:
        orig = str(d.get("originalName", "")).lower()
        name_no_ext = re.sub(r"\.[a-zA-Z0-9]+$", "", orig)
        if orig and (orig in clean_msg or (len(name_no_ext) >= 4 and name_no_ext in clean_msg)):
            target_ids.add(str(d.get("id") or d.get("_id")))

    for ds in resolved_datasets:
        orig = str(ds.get("originalName", "")).lower()
        name_no_ext = re.sub(r"\.[a-zA-Z0-9]+$", "", orig)
        if orig and (orig in clean_msg or (len(name_no_ext) >= 4 and name_no_ext in clean_msg)):
            target_ids.add(str(ds.get("id") or ds.get("_id")))

    target_count = len(target_ids)

    # 1. Comparison Intent Detection
    comp_patterns = [
        r"\bcompare\b",
        r"\bcomparing\b",
        r"\bcomparison\b",
        r"\bdiffer(?:ence|ences)?\s+between\b",
        r"\bcontrast\s+between\b",
        r"\bhow\s+do\s+(?:these|the\s+following|the\s+two)\s+(?:files|documents|datasets|spreadsheets)?\s*differ\b",
        r"\bwhat\s+(?:is|are)\s+the\s+differences?\s+between\s+(?:these|the\s+following|the\s+two)\b",
    ]
    is_comparison = any(re.search(p, clean_msg) for p in comp_patterns)

    if is_comparison:
        if target_count < 2:
            if target_count == 1:
                single_name = (
                    (active_scope.get("name") if active_scope else None)
                    or (resolved_docs[0].get("originalName") if resolved_docs else None)
                    or (resolved_datasets[0].get("originalName") if resolved_datasets else None)
                )
                if single_name:
                    return {
                        "intent": AgentIntent.CLARIFICATION,
                        "final_answer": f"Which file would you like to compare with '{single_name}'?",
                    }
            return {
                "intent": AgentIntent.CLARIFICATION,
                "final_answer": "Which files would you like me to compare?",
            }

    # 2. Non-specific plural operation check (summarize / analyze / extract without targets)
    plural_ops = [
        (r"\b(?:summarize|summarise)\s+(?:the\s+following|these|the)\s+(?:files|documents|spreadsheets|datasets)\b", "Which files would you like me to summarize?"),
        (r"\b(?:analyze|analyse)\s+(?:the\s+following|these|the)\s+(?:files|documents|spreadsheets|datasets)\b", "Which files would you like me to analyze?"),
        (r"\bextract\s+(?:data|information)\s+from\s+(?:the\s+following|these|the)\s+(?:files|documents|spreadsheets|datasets)\b", "Which files would you like me to extract data from?"),
    ]
    for pattern, clarification_prompt in plural_ops:
        if re.search(pattern, clean_msg) and target_count == 0:
            return {
                "intent": AgentIntent.CLARIFICATION,
                "final_answer": clarification_prompt,
            }

    return None


def format_workspace_manifest(
    docs: List[Dict[str, Any]],
    datasets: List[Dict[str, Any]],
    active_scope: Optional[Dict[str, Any]] = None,
    is_scoped: bool = False,
) -> str:
    parts = []
    if active_scope and active_scope.get("name"):
        parts.append(f"### Active Conversation Focus / Scope:\n- **{active_scope.get('name')}** [{str(active_scope.get('type', 'file')).upper()}]\n")

    if is_scoped:
        parts.append("### User-Selected Target Resources (CRITICAL: Focus strictly on these):")
        for d in docs:
            folder_str = f" (Folder: {d.get('folder')})" if d.get('folder') else ""
            status_str = f"Status: {d.get('status')}, Chunks: {d.get('chunkCount', 0)}"
            parts.append(f"- **{d.get('originalName')}** [{d.get('fileType', '').upper()}]{folder_str} — {status_str}")
        for ds in datasets:
            folder_str = f" (Folder: {ds.get('folder')})" if ds.get('folder') else ""
            cols = [c.get("name") for c in ds.get("sheets", [{}])[0].get("columns", [])] if ds.get("sheets") else []
            cols_preview = f", Columns: {', '.join(cols[:8])}" if cols else ""
            parts.append(f"- **{ds.get('originalName')}** [{ds.get('fileType', '').upper()}]{folder_str} — {ds.get('totalRows', 0)} rows{cols_preview}")
        parts.append("\n[CRITICAL DIRECTIVE: The user explicitly selected these specific resources. Answer strictly using only these resources. Do not list, suggest, or dump other files.]")
    else:
        if docs:
            parts.append("### Available Knowledge Documents:")
            for d in docs:
                folder_str = f" (Folder: {d.get('folder')})" if d.get('folder') else ""
                status_str = f"Status: {d.get('status')}, Chunks: {d.get('chunkCount', 0)}"
                parts.append(f"- **{d.get('originalName')}** [{d.get('fileType', '').upper()}]{folder_str} — {status_str}")

        if datasets:
            parts.append("\n### Available Analytical Datasets & Spreadsheets:")
            for ds in datasets:
                folder_str = f" (Folder: {ds.get('folder')})" if ds.get('folder') else ""
                cols = [c.get("name") for c in ds.get("sheets", [{}])[0].get("columns", [])] if ds.get("sheets") else []
                cols_preview = f", Columns: {', '.join(cols[:8])}" if cols else ""
                parts.append(f"- **{ds.get('originalName')}** [{ds.get('fileType', '').upper()}]{folder_str} — {ds.get('totalRows', 0)} rows{cols_preview}")

    return "\n".join(parts) if parts else "No specific documents or datasets selected for this turn."


# -------------------------------------------------------------
# Node 2: Route Intent
# -------------------------------------------------------------
async def route_intent_node(state: AgentState) -> Dict[str, Any]:
    message = state.get("message", "").lower().strip()
    history = state.get("history", [])
    resolved_docs = state.get("resolved_documents", [])
    resolved_datasets = state.get("resolved_datasets", [])
    active_scope = state.get("active_scope")
    resource_ids = state.get("resource_ids", [])
    is_scoped = state.get("is_scoped", False) or len(resource_ids) > 0
    shared_memory = state.get("shared_memory")

    # 0. File / PDF Discovery and Download Requests -> Priority 0
    file_keywords = ["pdf", "file", "document", "handbook", "guide", "report", "policy", "agreement", "manual"]
    file_request_verbs = [
        "give me", "can i get", "can i have", "can i download", "i wanna download", "i want to download",
        "download", "find", "get me", "where is", "send me", "show me", "fetch", "locate", "i need"
    ]
    has_file_kw = (
        any(k in message for k in file_keywords)
        or ".pdf" in message
        or "@" in message
        or "the file" in message
        or "this file" in message
        or (is_scoped and any(w in message.split() for w in ["this", "it", "these", "that"]))
        or (active_scope and any(w in message.split() for w in ["this", "it", "these", "that"]))
    )
    has_verb = any(v in message for v in file_request_verbs)
    is_file_request = (has_file_kw and has_verb) or bool(re.match(r"^(download|get)\s+", message)) or "i wanna download" in message or "can i download" in message
    if is_file_request:
        return {"intent": AgentIntent.FILE_REQUEST}

    # 1. Deterministic Grounding & Target Clarification Check -> Priority 1
    ungrounded_check = detect_ungrounded_operation(
        message=state.get("message", ""),
        resolved_docs=resolved_docs,
        resolved_datasets=resolved_datasets,
        active_scope=active_scope,
        resource_ids=resource_ids,
    )
    if ungrounded_check:
        return ungrounded_check

    # 2. Chart / Graph / Visualization Requests -> Priority 2 (Action-oriented, never refuse)
    message_without_filenames = re.sub(r'@[a-zA-Z0-9_\-\./]+|\b[a-zA-Z0-9_\-]+\.(?:xlsx|xls|csv|pdf|docx|txt|json)\b', '', message)
    chart_explicit_keywords = [
        "plot", "chart", "charts", "graph", "graphs", "visualize", "visualization", "visualizations",
        "histogram", "bar chart", "line chart", "pie chart", "scatter plot", "doughnut chart", "donut",
        "trend", "trends", "create graph", "create graphs", "make a graph", "generate graph", "generate chart",
        "render graph", "can't create graph", "cannot create graph", "no graph", "show graph", "make graph",
        "display graph", "create a chart", "make a chart", "render it"
    ]
    if any(re.search(r'\b' + re.escape(k) + r'\b', message_without_filenames) for k in chart_explicit_keywords):
        return {"intent": AgentIntent.CHART_REQUEST}

    # 3. Explicit Scoped Follow-Up / Deictic Reference Resolution ("this and this", "compare these", "what does this say")
    deictic_patterns = [
        r"\bthis\s+and\s+this\b",
        r"\bthis\s*&\s*this\b",
        r"\bthese\b",
        r"\bthose\b",
        r"\bboth\b",
        r"\bboth\s+of\s+(?:them|these)\b",
        r"\bcompare\s+(?:them|these|both)\b",
        r"\bwhat\s+(?:does\s+this\s+say|is\s+this|is\s+in\s+this)\b",
    ]
    is_deictic = any(re.search(p, message) for p in deictic_patterns)
    last_assistant_was_clarification = False
    if history:
        for h in reversed(history[-4:]):
            if h.get("role") == "assistant":
                c = h.get("content", "").lower()
                if "which files would you like" in c or "which file would you like" in c:
                    last_assistant_was_clarification = True
                break

    if is_scoped and (is_deictic or last_assistant_was_clarification or len(resolved_docs) + len(resolved_datasets) > 0):
        if len(resolved_datasets) > 0:
            return {"intent": AgentIntent.DATA_ANALYSIS}
        if len(resolved_docs) > 0:
            return {"intent": AgentIntent.DOCUMENT_RAG}

    # 4. Meta / Overview / Greetings / Capabilities / Collection Queries -> GENERAL_CHAT
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


def format_trimmed_history_messages(
    history: List[Dict[str, Any]],
    max_turns: int = 10,
) -> List[Any]:
    """
    Safely converts conversation history into LangChain messages.
    Trims redundant nested [Replying to message from ...] headers in older turns (where the original message
    is already in history), preserving 100% of the conversation dialogue and full context.
    """
    if not history:
        return []

    sliced_history = history[-max_turns:]
    result_messages = []

    for idx, h in enumerate(sliced_history):
        role = h.get("role")
        content = str(h.get("content", ""))
        if not content:
            continue

        is_older_turn = (idx < len(sliced_history) - 1)

        # For older history turns, strip redundant [Replying to message from ...:\n"..."] prefixes
        # because the original message is already present in the prior turn sequence.
        # Keep it intact on the most recent turn in history.
        if is_older_turn and role == "user":
            content_cleaned = re.sub(
                r"^\[Replying to message from [^\]]+:\s*\"[^\"]*\"\]\s*\n*",
                "",
                content,
                flags=re.DOTALL,
            ).strip()
            if content_cleaned:
                content = content_cleaned

        if role == "user":
            result_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            result_messages.append(AIMessage(content=content))

    return result_messages


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
        is_admin = state.get("is_admin", False)
        if is_admin:
            denial_msg = "No relevant documents were found in the workspace matching your query."
        else:
            denial_msg = "Access to the requested document or folder is restricted for your account. Please contact an administrator to request access."
        return {
            "citations": [],
            "final_answer": denial_msg,
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
    active_scope = state.get("active_scope")
    sources_text = ""
    if active_scope and active_scope.get("name"):
        sources_text += f"--- Active Conversation Knowledge Scope ---\nActive Focus: {active_scope.get('name')} [{str(active_scope.get('type', 'file')).upper()}]\n\n"

    if shared_memory:
        sources_text += f"--- Source [Collection Shared Context & Sibling Chat Facts] ---\n{shared_memory}\n\n"

    if context_str:
        sources_text += f"--- Sources [Retrieved Files & Spreadsheets] ---\n{context_str}\n\n"

    is_scoped = state.get("is_scoped", False) or len(state.get("resource_ids", [])) > 0
    scoped_instruction = ""
    if is_scoped and resolved_docs:
        doc_names = [d.get("originalName", "Document") for d in resolved_docs]
        if len(resolved_docs) >= 2:
            scoped_instruction = f"""
TARGET FOCUS:
The user explicitly selected and is comparing these resources: {', '.join(doc_names)}.
- Immediately compare these selected resources directly (e.g., "Comparing {doc_names[0]} and {doc_names[1]}...").
- Highlight the key differences, scope, purpose, and operational details in clean, structured sections.
- Do NOT ask the user to choose or select files again.
- Do NOT list or suggest any other workspace files.
"""
        else:
            scoped_instruction = f"""
TARGET FOCUS:
The user explicitly selected and is focusing on: {doc_names[0]}.
- Answer directly using information from this file.
- Do NOT ask the user to choose files again.
"""

    system_prompt = f"""{ENTERPRISE_AI_PERSONA}
{scoped_instruction}
AVAILABLE KNOWLEDGE SOURCES:
{sources_text if sources_text else "No knowledge files or collection notes available."}

INSTRUCTIONS:
- Answer the user's question directly using the AVAILABLE KNOWLEDGE SOURCES above (including facts established in Collection Shared Context).
- If comparing files, provide a clear, concise comparison structured with headings and bullet points.
- If the answer is in the Collection Shared Context or Retrieved Files, state the fact directly without boilerplate disclaimer.
- Only state that information is missing if it is truly absent from all provided knowledge sources above.
- Speak plainly, directly, and do not use emojis."""

    messages = [SystemMessage(content=system_prompt)]
    messages.extend(format_trimmed_history_messages(history, max_turns=10))
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
    active_scope = state.get("active_scope")
    history = state.get("history", [])

    if not resolved_datasets:
        is_admin = state.get("is_admin", False)
        if is_admin:
            denial_msg = "No analytical datasets were found in the workspace. Please upload or attach a CSV or Excel dataset to perform data analysis."
        else:
            denial_msg = "Access to the requested analytical dataset or folder is restricted for your account. Please contact an administrator to request access."
        return {
            "analysis_table": None,
            "analysis_raw_result": None,
            "python_code": None,
            "execution_output": None,
            "final_answer": denial_msg,
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

    # Fast-Path: If the calculation result is clearly deterministic (e.g. row count, sum, scalar),
    # format directly without issuing a 2nd Gemini LLM call.
    primary_ds_name = resolved_datasets[0].get("originalName", "the dataset") if resolved_datasets else "the dataset"
    fast_path_answer = try_format_deterministic_dataset_result(
        question=message,
        raw_result=raw_result,
        stdout=stdout,
        dataset_name=primary_ds_name,
    )
    if fast_path_answer:
        return {
            "analysis_table": table_spec,
            "analysis_raw_result": raw_result,
            "python_code": code,
            "execution_output": stdout,
            "final_answer": fast_path_answer,
        }

    llm = get_llm_provider()
    is_scoped = state.get("is_scoped", False) or len(state.get("resource_ids", [])) > 0
    workspace_manifest = format_workspace_manifest(resolved_docs, resolved_datasets, active_scope=active_scope, is_scoped=is_scoped)

    dataset_names = [ds.get("originalName", "Dataset") for ds in resolved_datasets]
    target_focus_str = ""
    if is_scoped and len(dataset_names) >= 2:
        target_focus_str = f"""
TARGET COMPARISON DIRECTIVE:
The user explicitly selected and is comparing: {', '.join(dataset_names)}.
- Immediately compare these selected datasets/spreadsheets directly (e.g. "Comparing {dataset_names[0]} and {dataset_names[1]}...").
- Highlight key metric differences, scope, rows, and findings clearly.
- NEVER ask the user to choose or select files again.
- NEVER list unrelated files.
"""
    elif is_scoped and len(dataset_names) == 1:
        target_focus_str = f"""
TARGET FOCUS DIRECTIVE:
The user explicitly selected: {dataset_names[0]}.
- Answer directly using the computed data from this dataset.
- NEVER ask the user to choose files again.
"""

    analysis_system_prompt = f"""{ENTERPRISE_AI_PERSONA}
{target_focus_str}
WORKSPACE SCOPE:
{workspace_manifest}

COMPUTED ANALYSIS DATA:
{str(raw_result)[:2500]}

CALCULATION DETAILS:
{stdout}

INSTRUCTIONS:
- Answer the user's question directly, concisely, and factually based strictly on the computed data above.
- Do NOT output raw JSON blocks. State the figures, top leaders, percentages, and comparison findings directly in clean prose or bullet points.
- Do NOT use emojis.
- Do NOT use meta-commentary or filler phrases."""

    messages = [
        SystemMessage(content=analysis_system_prompt),
    ]
    messages.extend(format_trimmed_history_messages(history, max_turns=10))
    messages.append(HumanMessage(content=message))

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
        final_answer_lower = final_answer.lower()
        if "restricted" in final_answer_lower or "contact an administrator" in final_answer_lower or "no analytical datasets" in final_answer_lower:
            return {
                "chart_spec": None,
                "chart_specs": [],
                "final_answer": final_answer,
            }
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
    active_scope = state.get("active_scope")
    is_scoped = state.get("is_scoped", False) or len(state.get("resource_ids", [])) > 0
    shared_memory = state.get("shared_memory")
    llm = get_llm_provider()

    clean_msg = message.lower().strip()
    inventory_keywords = [
        "what file", "what document", "what dataset", "what spreadsheet", "list file", "list document",
        "show file", "show document", "what do you have", "what info do you have", "what data do you have",
        "what is in my files", "what is in my library", "available files", "available documents",
        "available datasets", "which files", "which documents", "which datasets", "inventory", "library",
        "workspace files", "my files", "my documents", "my datasets"
    ]
    needs_manifest = is_scoped or bool(shared_memory) or any(k in clean_msg for k in inventory_keywords)

    if needs_manifest:
        workspace_manifest = format_workspace_manifest(resolved_docs, resolved_datasets, active_scope=active_scope, is_scoped=is_scoped)
        shared_mem_str = f"\nCOLLECTION SHARED MEMORY (Established facts & decisions from related chats in this collection):\n{shared_memory}\n" if shared_memory else ""
        system_prompt = f"""{ENTERPRISE_AI_PERSONA}
{shared_mem_str}
WORKSPACE SCOPE & INVENTORY:
{workspace_manifest}

CRITICAL ACCESS CONTROL & GROUNDING RULES (HIGHEST PRIORITY):
1. You only have access to the items explicitly listed under WORKSPACE SCOPE & INVENTORY above.
2. If the user asks about, asks to access, or requests data/details from any folder, dataset, or file that is NOT in the authorized inventory above:
   - State clearly that you do not have access to that resource because access is restricted for their account.
   - Never claim access to restricted items or quote figures from restricted resources.
3. NEVER dump a list of available files unless the user explicitly asks you what files exist in the workspace.
4. Answer all authorized topics plainly, helpfully, and without emojis."""
    else:
        system_prompt = f"""{ENTERPRISE_AI_PERSONA}

CRITICAL ACCESS CONTROL & GROUNDING RULES:
1. Speak plainly, directly, and helpfully without using emojis.
2. If the user asks for specific company documents, data analysis, or file comparisons, assist them appropriately with the authorized resources."""

    messages = [SystemMessage(content=system_prompt)]
    messages.extend(format_trimmed_history_messages(history, max_turns=10))
    messages.append(HumanMessage(content=message))

    answer = await llm.generate_response(messages, temperature=0.15)
    return {"final_answer": answer}


# -------------------------------------------------------------
# Node: Secure File & PDF Discovery
# -------------------------------------------------------------
async def file_request_node(state: AgentState) -> Dict[str, Any]:
    user_id = state.get("user_id", "")
    message = state.get("message", "")
    active_scope = state.get("active_scope")
    resolved_docs = state.get("resolved_documents", [])
    resolved_datasets = state.get("resolved_datasets", [])
    history = state.get("history", [])

    db = get_database()
    folders_col = db["folders"]
    folder_policies: Dict[str, str] = {}
    for f in folders_col.find():
        folder_policies[f.get("name", "")] = f.get("downloadPolicy", "allowed")

    def get_effective_policy(doc: Dict[str, Any]) -> str:
        policy = doc.get("downloadPolicy", "inherit")
        if policy == "allowed":
            return "allowed"
        if policy == "restricted":
            return "restricted"
        folder_name = (doc.get("folder") or "").strip()
        if folder_name in folder_policies:
            return folder_policies[folder_name]
        return "allowed"

    def get_mime_type(file_name: str, file_type: str) -> str:
        ext = (file_name.split(".")[-1] if "." in file_name else file_type).lower()
        if ext == "pdf":
            return "application/pdf"
        elif ext in ["xlsx", "xls"]:
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif ext == "csv":
            return "text/csv"
        elif ext in ["docx", "doc"]:
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif ext == "txt":
            return "text/plain"
        return "application/octet-stream"

    # Gather all accessible files
    accessible_files = []
    for d in (resolved_docs + resolved_datasets):
        d_id = str(d.get("_id") or d.get("id", ""))
        if not any(str(f.get("_id") or f.get("id", "")) == d_id for f in accessible_files):
            accessible_files.append(d)

    lower_message = message.lower().strip()
    is_scoped = state.get("is_scoped", False) or len(state.get("resource_ids", [])) > 0

    # 0. Direct Scoped / Active Scope File resolution
    if active_scope and active_scope.get("type") in ["document", "dataset", "file"]:
        scope_id = str(active_scope.get("id", ""))
        scope_name = str(active_scope.get("name", "")).lower().strip()
        matched_scoped_doc = None
        for d in accessible_files:
            d_id = str(d.get("_id") or d.get("id", ""))
            orig = str(d.get("originalName", "")).lower()
            if (scope_id and d_id == scope_id) or (scope_name and (orig == scope_name or scope_name in orig)):
                matched_scoped_doc = d
                break
        if not matched_scoped_doc and (scope_id or scope_name):
            try:
                obj_id = ObjectId(scope_id) if ObjectId.is_valid(scope_id) else scope_id
                db_doc = db["documents"].find_one({"$or": [{"_id": obj_id}, {"_id": str(scope_id)}, {"originalName": active_scope.get("name")}]})
                if not db_doc:
                    db_doc = db["datasets"].find_one({"$or": [{"_id": obj_id}, {"_id": str(scope_id)}, {"originalName": active_scope.get("name")}]})
                if db_doc:
                    matched_scoped_doc = db_doc
            except Exception as e:
                logger.warning(f"Error checking db for active scope doc: {e}")

        if matched_scoped_doc:
            eff = get_effective_policy(matched_scoped_doc)
            doc_id = str(matched_scoped_doc.get("_id") or matched_scoped_doc.get("id", ""))
            mime = get_mime_type(matched_scoped_doc.get("originalName", ""), matched_scoped_doc.get("fileType", ""))
            if eff == "allowed":
                return {
                    "final_answer": "Here is the file.",
                    "downloadable_file": {
                        "documentId": doc_id,
                        "fileName": matched_scoped_doc.get("originalName"),
                        "fileSize": matched_scoped_doc.get("fileSize", 0),
                        "mimeType": mime,
                        "folder": matched_scoped_doc.get("folder"),
                    },
                    "intent": AgentIntent.FILE_REQUEST,
                }
            else:
                return {
                    "final_answer": f"{matched_scoped_doc.get('originalName')} is available, but this file is restricted from downloading. This file can't be downloaded.",
                    "downloadable_file": None,
                    "intent": AgentIntent.FILE_REQUEST,
                }

    if is_scoped and len(accessible_files) == 1:
        d = accessible_files[0]
        eff = get_effective_policy(d)
        doc_id = str(d.get("_id") or d.get("id", ""))
        mime = get_mime_type(d.get("originalName", ""), d.get("fileType", ""))
        if eff == "allowed":
            return {
                "final_answer": "Here is the file.",
                "downloadable_file": {
                    "documentId": doc_id,
                    "fileName": d.get("originalName"),
                    "fileSize": d.get("fileSize", 0),
                    "mimeType": mime,
                    "folder": d.get("folder"),
                },
                "intent": AgentIntent.FILE_REQUEST,
            }
        else:
            return {
                "final_answer": f"{d.get('originalName')} is available, but this file is restricted from downloading. This file can't be downloaded.",
                "downloadable_file": None,
                "intent": AgentIntent.FILE_REQUEST,
            }

    # 1. Direct @mention extraction
    mention_match = re.search(r"@([a-zA-Z0-9_\-\.\s]+?\.(?:pdf|docx|xlsx|csv|txt)|[a-zA-Z0-9_\-]+)", message, re.IGNORECASE)
    if mention_match:
        clean_mention = mention_match.group(1).strip().lower()
        clean_mention_no_ext = re.sub(r"\.[a-zA-Z0-9]+$", "", clean_mention)
        for d in accessible_files:
            orig = str(d.get("originalName", "")).lower()
            no_ext = re.sub(r"\.[a-zA-Z0-9]+$", "", orig)
            doc_id = str(d.get("_id") or d.get("id", ""))
            if (
                orig == clean_mention
                or no_ext == clean_mention
                or no_ext == clean_mention_no_ext
                or clean_mention in orig
                or doc_id == clean_mention
            ):
                eff = get_effective_policy(d)
                mime = get_mime_type(d.get("originalName", ""), d.get("fileType", ""))
                if eff == "allowed":
                    return {
                        "final_answer": "Here is the file.",
                        "downloadable_file": {
                            "documentId": doc_id,
                            "fileName": d.get("originalName"),
                            "fileSize": d.get("fileSize", 0),
                            "mimeType": mime,
                            "folder": d.get("folder"),
                        },
                        "intent": AgentIntent.FILE_REQUEST,
                    }
                else:
                    return {
                        "final_answer": f"{d.get('originalName')} is available, but this file is restricted from downloading. This file can't be downloaded.",
                        "downloadable_file": None,
                        "intent": AgentIntent.FILE_REQUEST,
                    }

    # 2. Contextual reference ("that file", "the file", "the pdf", "download it", "give me that", etc.) from conversation history
    is_referential = bool(re.search(r"\b(that file|that pdf|that document|that dataset|the file|the pdf|the document|the dataset|this file|this pdf|this document|this dataset|download it|download this|download that|get it|get this|get that|give me that|give me this|give me the file|give me that file|i wanna download|i want to download|can i download)\b", lower_message))
    if is_referential and history:
        for msg in reversed(history):
            content_str = str(msg.get("content", "")).lower() if isinstance(msg, dict) else str(getattr(msg, "content", "")).lower()
            for d in accessible_files:
                orig = str(d.get("originalName", "")).lower()
                no_ext = re.sub(r"\.[a-zA-Z0-9]+$", "", orig)
                if orig in content_str or (len(no_ext) >= 4 and no_ext in content_str):
                    eff = get_effective_policy(d)
                    doc_id = str(d.get("_id") or d.get("id", ""))
                    mime = get_mime_type(d.get("originalName", ""), d.get("fileType", ""))
                    if eff == "allowed":
                        return {
                            "final_answer": "Here is the file.",
                            "downloadable_file": {
                                "documentId": doc_id,
                                "fileName": d.get("originalName"),
                                "fileSize": d.get("fileSize", 0),
                                "mimeType": mime,
                                "folder": d.get("folder"),
                            },
                            "intent": AgentIntent.FILE_REQUEST,
                        }
                    else:
                        return {
                            "final_answer": f"{d.get('originalName')} is available, but this file is restricted from downloading. This file can't be downloaded.",
                            "downloadable_file": None,
                            "intent": AgentIntent.FILE_REQUEST,
                        }

    # 3. Clean query for matching
    clean_query = re.sub(r"@[a-zA-Z0-9_\-\.]+", "", lower_message)
    clean_query = re.sub(
        r"^(give me that file|give me the file|give me that|give me this|give me the|give me|can i get the|can i get|can i download the|can i download that|can i download this|can i download|download that file|download the file|download that|download the|download|find the pdf for the|find the pdf for|find the pdf|find the file|find the|find|get me the pdf from the|get me the pdf from|get me the pdf|get me the file|get me the|get me|where is the|please send me the|show me the pdf for|show me the pdf|show me the|fetch the|open the|i need the|i need|send me the|send me|locate the)\s*",
        "",
        clean_query,
        flags=re.IGNORECASE,
    )
    clean_query = re.sub(r"\s+(?:from|in)\s+(?:the\s+)?([a-zA-Z0-9_\-\s]+?)\s+folder$", "", clean_query, flags=re.IGNORECASE)
    clean_query = re.sub(r"\s*(i wanna download this|i wanna download that|i wanna download|i want to download this|i want to download that|i want to download|can i download|download this|download that|please download|for me)\s*$", "", clean_query, flags=re.IGNORECASE)
    clean_query = re.sub(r"\s+(pdf|file|document)$", "", clean_query, flags=re.IGNORECASE)
    clean_query = re.sub(r"^[.\s_\-]+|[.\s_\-]+$", "", clean_query).strip()
    clean_query = re.sub(r"\.[a-zA-Z0-9]+$", "", clean_query).strip()

    folder_hint = ""
    folder_match = re.search(r"(?:from|in)\s+(?:the\s+)?([a-zA-Z0-9_\-\s]+?)\s+folder", message, re.IGNORECASE)
    if folder_match:
        folder_hint = folder_match.group(1).strip().lower()
    elif active_scope and active_scope.get("type") == "folder":
        folder_hint = str(active_scope.get("name", "")).strip().lower()

    # 4. Exact match search
    exact_candidates = []
    for d in accessible_files:
        orig = d.get("originalName", "")
        name_no_ext = re.sub(r"\.[a-zA-Z0-9]+$", "", orig).strip().lower()
        full_name = orig.lower()
        name_no_sep = re.sub(r"[_\-\s]+", " ", name_no_ext)
        clean_no_sep = re.sub(r"[_\-\s]+", " ", clean_query)
        if clean_query and (name_no_ext == clean_query or full_name == clean_query or name_no_sep == clean_no_sep):
            if folder_hint:
                if (d.get("folder") or "").lower() == folder_hint:
                    exact_candidates.append(d)
            else:
                exact_candidates.append(d)

    if not exact_candidates and folder_hint and clean_query:
        for d in accessible_files:
            orig = d.get("originalName", "")
            name_no_ext = re.sub(r"\.[a-zA-Z0-9]+$", "", orig).strip().lower()
            full_name = orig.lower()
            name_no_sep = re.sub(r"[_\-\s]+", " ", name_no_ext)
            clean_no_sep = re.sub(r"[_\-\s]+", " ", clean_query)
            if name_no_ext == clean_query or full_name == clean_query or name_no_sep == clean_no_sep:
                exact_candidates.append(d)

    if len(exact_candidates) == 1:
        doc = exact_candidates[0]
        eff = get_effective_policy(doc)
        doc_id = str(doc.get("_id") or doc.get("id"))
        mime = get_mime_type(doc.get("originalName", ""), doc.get("fileType", ""))
        if eff == "allowed":
            return {
                "final_answer": "Sure, I found the PDF." if str(doc.get("originalName", "")).lower().endswith(".pdf") else "Sure, I found the file.",
                "downloadable_file": {
                    "documentId": doc_id,
                    "fileName": doc.get("originalName"),
                    "fileSize": doc.get("fileSize", 0),
                    "mimeType": mime,
                    "folder": doc.get("folder"),
                },
                "intent": AgentIntent.FILE_REQUEST,
            }
        else:
            return {
                "final_answer": f"{doc.get('originalName')} is available, but this file is restricted from downloading. This file can't be downloaded.",
                "downloadable_file": None,
                "intent": AgentIntent.FILE_REQUEST,
            }
    elif len(exact_candidates) > 1:
        cand_names = [f"- {d.get('originalName')}" + (f" ({d.get('folder')})" if d.get('folder') else "") for d in exact_candidates[:4]]
        return {
            "final_answer": f"I found a few matching files. Which one do you want?\n\n" + "\n".join(cand_names),
            "downloadable_file": None,
            "intent": AgentIntent.FILE_REQUEST,
        }

    # 5. Intelligent Multi-Attribute Scoring for Alternative / Ambiguous Suggestions
    query_tokens = [t for t in re.split(r"[\s_\-]+", clean_query) if len(t) > 2]
    scored: List[Tuple[int, Dict[str, Any]]] = []

    for d in accessible_files:
        doc_name = d.get("originalName", "").lower()
        doc_no_ext = re.sub(r"\.pdf$", "", doc_name, flags=re.IGNORECASE)
        doc_words = re.sub(r"[_\-]+", " ", doc_no_ext)
        doc_folder = (d.get("folder") or "").lower()
        doc_folder_words = re.sub(r"[_\-]+", " ", doc_folder)

        score = 0
        if len(clean_query) >= 3 and (clean_query in doc_words or clean_query in doc_name):
            score += 30
        if len(clean_query) >= 3 and doc_words in clean_query:
            score += 25
        if folder_hint and (doc_folder == folder_hint or folder_hint in doc_folder_words):
            score += 15
        elif doc_folder_words and doc_folder_words in clean_query:
            score += 15

        for t in query_tokens:
            if t in doc_words:
                score += 8
            elif t in doc_folder_words:
                score += 5

        if score >= 15:
            scored.append((score, d))

    scored.sort(key=lambda x: x[0], reverse=True)

    if scored:
        top_score = scored[0][0]
        close_cands = [d for s, d in scored if s >= top_score - 12 and s >= 18][:4]
        if len(close_cands) > 1:
            cand_names = [f"- {d.get('originalName')}" + (f" ({d.get('folder')})" if d.get('folder') else "") for d in close_cands]
            return {
                "final_answer": f"I found a few matching files. Which one do you want?\n\n" + "\n".join(cand_names),
                "downloadable_file": None,
                "intent": AgentIntent.FILE_REQUEST,
            }
        else:
            best_alt = scored[0][1]
            folder_part = f" in the {best_alt.get('folder')} folder" if best_alt.get('folder') else ""
            return {
                "final_answer": f"I couldn't find that exact PDF, but I found '{best_alt.get('originalName')}'{folder_part}. Is that the file you're looking for?",
                "downloadable_file": None,
                "intent": AgentIntent.FILE_REQUEST,
            }

    return {
        "final_answer": "Sorry, I couldn't find that file.",
        "downloadable_file": None,
        "intent": AgentIntent.FILE_REQUEST,
    }


async def clarification_node(state: AgentState) -> Dict[str, Any]:
    final_answer = state.get("final_answer") or "Which files would you like me to compare?"
    return {
        "final_answer": final_answer,
        "intent": AgentIntent.CLARIFICATION,
        "citations": [],
        "downloadable_file": None,
        "analysis_table": None,
        "chart_spec": None,
        "chart_specs": [],
    }


# -------------------------------------------------------------
# Router Condition
# -------------------------------------------------------------
def route_next_step(state: AgentState) -> Literal["file_request", "clarification", "document_rag", "data_analysis", "chart_request", "calculator", "general_chat"]:
    intent = state.get("intent", AgentIntent.GENERAL_CHAT)
    if intent == AgentIntent.FILE_REQUEST:
        return "file_request"
    elif intent == AgentIntent.CLARIFICATION:
        return "clarification"
    elif intent == AgentIntent.DOCUMENT_RAG:
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
    workflow.add_node("file_request", file_request_node)
    workflow.add_node("clarification", clarification_node)
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
            "file_request": "file_request",
            "clarification": "clarification",
            "document_rag": "document_rag",
            "data_analysis": "data_analysis",
            "chart_request": "data_analysis",
            "calculator": "calculator",
            "general_chat": "general_chat",
        },
    )

    workflow.add_edge("file_request", END)
    workflow.add_edge("clarification", END)

    # Build charts if intent is CHART_REQUEST or user message requests visualization
    def should_build_chart_from_analysis(state: AgentState) -> Literal["chart_builder", "__end__"]:
        final_answer = state.get("final_answer", "").lower()
        if "restricted" in final_answer or "contact an administrator" in final_answer or "no analytical datasets" in final_answer:
            return "__end__"
        if not state.get("resolved_datasets"):
            return "__end__"
        intent = state.get("intent")
        if intent == AgentIntent.CHART_REQUEST:
            return "chart_builder"
        msg = state.get("message", "").lower()
        chart_keywords = ["plot", "chart", "charts", "graph", "graphs", "visualize", "visualization", "histogram", "bar chart", "line chart", "pie chart", "scatter", "doughnut", "donut", "trend"]
        if any(k in msg for k in chart_keywords):
            return "chart_builder"
        return "__end__"

    def should_build_chart_from_doc(state: AgentState) -> Literal["chart_builder", "__end__"]:
        final_answer = state.get("final_answer", "").lower()
        if "restricted" in final_answer or "contact an administrator" in final_answer:
            return "__end__"
        if not state.get("resolved_documents") and not state.get("citations"):
            return "__end__"
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


def guard_output_grounding(answer: str, state: Dict[str, Any]) -> str:
    """
    Output Generation Guard:
    Validates that if the user's query was an ungrounded comparison or non-specific request without targets,
    the model has not hallucinated arbitrary file names into the final answer.
    """
    if not answer:
        return answer

    intent = state.get("intent")
    if intent == AgentIntent.CLARIFICATION:
        return answer

    message = str(state.get("message", "")).lower()
    is_comp = bool(re.search(r"\b(compare|comparison|differ between|differences between)\b", message))
    is_plural_sum = bool(re.search(r"\b(summarize|analyze)\s+(?:the\s+following|these|the)\s+(?:files|documents|datasets)\b", message))

    resource_ids = state.get("resource_ids", [])
    active_scope = state.get("active_scope")
    resolved_docs = state.get("resolved_documents", [])
    resolved_datasets = state.get("resolved_datasets", [])

    target_count = len(resource_ids)
    if active_scope and active_scope.get("id"):
        target_count += 1

    # Check for extracted filenames in message
    for d in resolved_docs:
        orig = str(d.get("originalName", "")).lower()
        name_no_ext = re.sub(r"\.[a-zA-Z0-9]+$", "", orig)
        if orig and (orig in message or (len(name_no_ext) >= 4 and name_no_ext in message)):
            target_count += 1

    for ds in resolved_datasets:
        orig = str(ds.get("originalName", "")).lower()
        name_no_ext = re.sub(r"\.[a-zA-Z0-9]+$", "", orig)
        if orig and (orig in message or (len(name_no_ext) >= 4 and name_no_ext in message)):
            target_count += 1

    if is_comp and target_count < 2:
        if target_count == 1:
            single_name = (active_scope.get("name") if active_scope else None) or (resolved_docs[0].get("originalName") if resolved_docs else None)
            return f"Which file would you like to compare with '{single_name}'?" if single_name else "Which files would you like me to compare?"
        return "Which files would you like me to compare?"

    if is_plural_sum and target_count == 0:
        return "Which files would you like me to summarize?" if "summarize" in message else "Which files would you like me to analyze?"

    return answer


agent_graph = build_agent_graph()
