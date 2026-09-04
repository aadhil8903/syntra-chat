import pytest
import asyncio
from unittest.mock import MagicMock, patch
from schemas.chat import AgentIntent
from agents.graph import route_intent_node, detect_ungrounded_operation, guard_output_grounding


def test_unresolved_comparison_without_files_asks_clarification():
    queries = [
        "Compare the following files and highlight key differences.",
        "Compare these files",
        "Compare the documents",
        "Compare the two files",
        "What is the difference between these files",
        "highlight key differences between the following files",
    ]
    for q in queries:
        state = {
            "message": q,
            "resolved_documents": [],
            "resolved_datasets": [],
            "resource_ids": [],
            "active_scope": None,
        }
        res = asyncio.run(route_intent_node(state))
        assert res.get("intent") == AgentIntent.CLARIFICATION, f"Failed for query: {q}"
        assert res.get("final_answer") == "Which files would you like me to compare?", f"Failed answer for: {q}"


def test_unresolved_comparison_single_file_active_scope_asks_targeted_clarification():
    state = {
        "message": "Compare the following files and highlight differences",
        "resolved_documents": [],
        "resolved_datasets": [],
        "resource_ids": [],
        "active_scope": {"id": "ds_10", "name": "10_employee_directory.xlsx", "type": "dataset"},
    }
    res = asyncio.run(route_intent_node(state))
    assert res.get("intent") == AgentIntent.CLARIFICATION
    assert res.get("final_answer") == "Which file would you like to compare with '10_employee_directory.xlsx'?"


def test_unresolved_plural_summarize_without_files_asks_clarification():
    queries = [
        "Summarize the following files",
        "Summarize these files",
        "Summarize the documents",
    ]
    for q in queries:
        state = {
            "message": q,
            "resolved_documents": [],
            "resolved_datasets": [],
            "resource_ids": [],
            "active_scope": None,
        }
        res = asyncio.run(route_intent_node(state))
        assert res.get("intent") == AgentIntent.CLARIFICATION
        assert res.get("final_answer") == "Which files would you like me to summarize?"


def test_unresolved_plural_analyze_without_files_asks_clarification():
    queries = [
        "Analyze the following files",
        "Analyze these spreadsheets",
        "Analyze the following datasets",
    ]
    for q in queries:
        state = {
            "message": q,
            "resolved_documents": [],
            "resolved_datasets": [],
            "resource_ids": [],
            "active_scope": None,
        }
        res = asyncio.run(route_intent_node(state))
        assert res.get("intent") == AgentIntent.CLARIFICATION
        assert res.get("final_answer") == "Which files would you like me to analyze?"


def test_explicit_two_files_comparison_proceeds():
    state = {
        "message": "Compare 25_org_chart.xlsx and 10_employee_directory.xlsx",
        "resolved_documents": [],
        "resolved_datasets": [
            {"id": "d1", "originalName": "25_org_chart.xlsx", "totalRows": 25, "sheets": []},
            {"id": "d2", "originalName": "10_employee_directory.xlsx", "totalRows": 10, "sheets": []},
        ],
        "resource_ids": ["d1", "d2"],
        "active_scope": None,
    }
    res = asyncio.run(route_intent_node(state))
    # Should proceed to DATA_ANALYSIS since 2 explicit files are present
    assert res.get("intent") == AgentIntent.DATA_ANALYSIS


def test_output_guard_intercepts_hallucinated_comparison_response():
    state = {
        "message": "Compare the following files and highlight key differences.",
        "resolved_documents": [],
        "resolved_datasets": [],
        "resource_ids": [],
        "active_scope": None,
    }
    raw_hallucinated_answer = (
        "Based on the company records, here is a comparison of the two primary personnel files: "
        "the Leadership Org Chart (25_org_chart.xlsx) and the Employee Directory (10_employee_directory.xlsx)."
    )
    guarded = guard_output_grounding(raw_hallucinated_answer, state)
    assert guarded == "Which files would you like me to compare?"


def test_natural_language_discovery_continues_working():
    state = {
        "message": "Find the PDF for the travel reimbursement policy",
        "resolved_documents": [],
        "resolved_datasets": [],
        "resource_ids": [],
        "active_scope": None,
    }
    res = asyncio.run(route_intent_node(state))
    assert res.get("intent") == AgentIntent.FILE_REQUEST


def test_screenshot_regression_mentions_with_this_and_this_proceeds_to_compare():
    # Message 2 in the screenshot: User provided 2 mentions and typed "this and this"
    state = {
        "message": "this and this",
        "resolved_documents": [],
        "resolved_datasets": [
            {"id": "ds_cs", "originalName": "Customer_Support.xlsx", "totalRows": 150, "sheets": []},
            {"id": "ds_mkt", "originalName": "Marketing.xlsx", "totalRows": 200, "sheets": []},
        ],
        "resource_ids": ["ds_cs", "ds_mkt"],
        "is_scoped": True,
        "history": [
            {"role": "user", "content": "Compare the following files and highlight key differences."},
            {"role": "assistant", "content": "Which files would you like me to compare?"},
        ],
        "active_scope": None,
    }
    res = asyncio.run(route_intent_node(state))
    # Must NOT ask clarification again! Must proceed directly to data analysis / comparison
    assert res.get("intent") == AgentIntent.DATA_ANALYSIS
    assert res.get("intent") != AgentIntent.CLARIFICATION


def test_single_mention_what_does_this_say_routes_to_content():
    state = {
        "message": "what does this say?",
        "resolved_documents": [
            {"id": "doc_hr", "originalName": "HR_Policy.pdf", "fileType": "pdf", "status": "ready"},
        ],
        "resolved_datasets": [],
        "resource_ids": ["doc_hr"],
        "is_scoped": True,
        "active_scope": None,
    }
    res = asyncio.run(route_intent_node(state))
    assert res.get("intent") == AgentIntent.DOCUMENT_RAG


def test_single_mention_can_i_download_this_routes_to_file_request():
    state = {
        "message": "can I download this?",
        "resolved_documents": [
            {"id": "doc_hr", "originalName": "HR_Policy.pdf", "fileType": "pdf", "status": "ready"},
        ],
        "resolved_datasets": [],
        "resource_ids": ["doc_hr"],
        "is_scoped": True,
        "active_scope": None,
    }
    res = asyncio.run(route_intent_node(state))
    assert res.get("intent") == AgentIntent.FILE_REQUEST


def test_two_mentions_compare_these_routes_to_comparison():
    state = {
        "message": "compare these",
        "resolved_documents": [
            {"id": "doc_1", "originalName": "Policy_A.pdf", "fileType": "pdf", "status": "ready"},
            {"id": "doc_2", "originalName": "Policy_B.pdf", "fileType": "pdf", "status": "ready"},
        ],
        "resolved_datasets": [],
        "resource_ids": ["doc_1", "doc_2"],
        "is_scoped": True,
        "active_scope": None,
    }
    res = asyncio.run(route_intent_node(state))
    assert res.get("intent") == AgentIntent.DOCUMENT_RAG
    assert res.get("intent") != AgentIntent.CLARIFICATION


@pytest.mark.asyncio
async def test_normal_chat_general_chat_node_does_not_raise_nameerror():
    from agents.graph import general_chat_node
    from unittest.mock import AsyncMock

    state = {
        "message": "hey",
        "history": [],
        "user_id": "test_user",
        "resolved_documents": [],
        "resolved_datasets": [],
        "resource_ids": [],
        "active_scope": None,
    }

    with patch("agents.graph.get_llm_provider") as mock_get_llm:
        mock_llm = MagicMock()
        mock_llm.generate_response = AsyncMock(return_value="Hello! How can I assist you today?")
        mock_get_llm.return_value = mock_llm

        res = await general_chat_node(state)
        assert "final_answer" in res
        assert res["final_answer"] == "Hello! How can I assist you today?"


@pytest.mark.asyncio
async def test_normal_chat_graph_invocation_hey():
    from agents.graph import agent_graph
    from unittest.mock import AsyncMock

    initial_state = {
        "user_id": "test_user",
        "user_role": "member",
        "conversation_id": "conv_123",
        "message": "hey",
        "resource_ids": [],
        "active_scope": None,
        "shared_memory": None,
        "history": [],
    }

    with patch("agents.graph.get_llm_provider") as mock_get_llm, \
         patch("agents.graph.get_database") as mock_get_db:
        mock_db = MagicMock()
        mock_docs = MagicMock()
        mock_docs.find.return_value = []
        mock_datasets = MagicMock()
        mock_datasets.find.return_value = []
        mock_folders = MagicMock()
        mock_folders.find.return_value = []
        mock_users = MagicMock()
        mock_users.find_one.return_value = {"_id": "test_user", "role": "member"}

        mock_db.__getitem__.side_effect = lambda key: {
            "documents": mock_docs,
            "datasets": mock_datasets,
            "folders": mock_folders,
            "users": mock_users,
        }.get(key, MagicMock())
        mock_get_db.return_value = mock_db

        mock_llm = MagicMock()
        mock_llm.generate_response = AsyncMock(return_value="Hello! How can I help you today?")
        mock_get_llm.return_value = mock_llm

        final_state = await agent_graph.ainvoke(initial_state)
        assert "final_answer" in final_state
        assert final_state["final_answer"] == "Hello! How can I help you today?"
        assert final_state.get("intent") == AgentIntent.GENERAL_CHAT


@pytest.mark.asyncio
async def test_normal_chat_graph_invocation_what_can_you_help_me_with():
    from agents.graph import agent_graph
    from unittest.mock import AsyncMock

    initial_state = {
        "user_id": "test_user",
        "user_role": "member",
        "conversation_id": "conv_123",
        "message": "What can you help me with?",
        "resource_ids": [],
        "active_scope": None,
        "shared_memory": None,
        "history": [],
    }

    with patch("agents.graph.get_llm_provider") as mock_get_llm, \
         patch("agents.graph.get_database") as mock_get_db:
        mock_db = MagicMock()
        mock_docs = MagicMock()
        mock_docs.find.return_value = []
        mock_datasets = MagicMock()
        mock_datasets.find.return_value = []
        mock_folders = MagicMock()
        mock_folders.find.return_value = []
        mock_users = MagicMock()
        mock_users.find_one.return_value = {"_id": "test_user", "role": "member"}

        mock_db.__getitem__.side_effect = lambda key: {
            "documents": mock_docs,
            "datasets": mock_datasets,
            "folders": mock_folders,
            "users": mock_users,
        }.get(key, MagicMock())
        mock_get_db.return_value = mock_db

        mock_llm = MagicMock()
        mock_llm.generate_response = AsyncMock(return_value="I can help you search documents, analyze data, and create visualizations.")
        mock_get_llm.return_value = mock_llm

        final_state = await agent_graph.ainvoke(initial_state)
        assert "final_answer" in final_state
        assert "I can help you search documents" in final_state["final_answer"]
