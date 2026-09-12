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


def test_normal_chat_general_chat_node_does_not_raise_nameerror():
    async def _run():
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
    asyncio.run(_run())


def test_normal_chat_graph_invocation_hey():
    async def _run():
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
    asyncio.run(_run())


def test_normal_chat_graph_invocation_what_can_you_help_me_with():
    async def _run():
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
    asyncio.run(_run())


def test_general_chat_token_optimization_greeting_omits_manifest():
    async def _run():
        from agents.graph import general_chat_node
        from unittest.mock import AsyncMock

        state = {
            "message": "hey",
            "history": [{"role": "user", "content": f"msg {i}"} for i in range(25)],
            "resolved_documents": [{"originalName": "secret_doc.pdf", "folderName": "Confidential"}],
            "resolved_datasets": [{"originalName": "sales_q3.xlsx", "totalRows": 500}],
            "active_scope": None,
            "is_scoped": False,
            "resource_ids": [],
            "shared_memory": None,
        }

        with patch("agents.graph.get_llm_provider") as mock_get_llm:
            mock_llm = MagicMock()
            captured_messages = []
            async def mock_generate(messages, temperature=0.15):
                nonlocal captured_messages
                captured_messages = messages
                return "Hey there! How can I assist you today?"
            mock_llm.generate_response = AsyncMock(side_effect=mock_generate)
            mock_get_llm.return_value = mock_llm

            res = await general_chat_node(state)
            assert res.get("final_answer") == "Hey there! How can I assist you today?"
            
            # 1. Verify system prompt does not contain full workspace manifest
            system_msg = captured_messages[0].content
            assert "WORKSPACE SCOPE & INVENTORY:" not in system_msg
            assert "secret_doc.pdf" not in system_msg
            assert "sales_q3.xlsx" not in system_msg

            # 2. Verify history is sliced to the last 10 items + system msg + current msg = 12 total messages
            assert len(captured_messages) == 12  # 1 system + 10 history + 1 current message
            assert captured_messages[1].content == "msg 15"
            assert captured_messages[-1].content == "hey"

            # 3. Verify no duplicated [System Instruction: ...] appended to the user message
            assert "[System Instruction:" not in captured_messages[-1].content
    asyncio.run(_run())


def test_general_chat_inventory_query_includes_manifest():
    async def _run():
        from agents.graph import general_chat_node
        from unittest.mock import AsyncMock

        state = {
            "message": "What files do I have access to?",
            "history": [],
            "resolved_documents": [{"originalName": "handbook.pdf", "folderName": "HR"}],
            "resolved_datasets": [{"originalName": "q1_metrics.xlsx", "totalRows": 100}],
            "active_scope": None,
            "is_scoped": False,
            "resource_ids": [],
            "shared_memory": None,
        }

        with patch("agents.graph.get_llm_provider") as mock_get_llm:
            mock_llm = MagicMock()
            captured_messages = []
            async def mock_generate(messages, temperature=0.15):
                nonlocal captured_messages
                captured_messages = messages
                return "You have access to handbook.pdf and q1_metrics.xlsx."
            mock_llm.generate_response = AsyncMock(side_effect=mock_generate)
            mock_get_llm.return_value = mock_llm

            res = await general_chat_node(state)
            assert res.get("final_answer") == "You have access to handbook.pdf and q1_metrics.xlsx."
            
            # Verify manifest is included for inventory queries
            system_msg = captured_messages[0].content
            assert "WORKSPACE SCOPE & INVENTORY:" in system_msg
            assert "handbook.pdf" in system_msg
            assert "q1_metrics.xlsx" in system_msg
    asyncio.run(_run())


def test_general_chat_scoped_includes_manifest():
    async def _run():
        from agents.graph import general_chat_node
        from unittest.mock import AsyncMock

        state = {
            "message": "Tell me about this document",
            "history": [],
            "resolved_documents": [{"originalName": "q4_roadmap.pdf", "folderName": "Product"}],
            "resolved_datasets": [],
            "active_scope": {"id": "doc_123", "name": "q4_roadmap.pdf", "type": "document"},
            "is_scoped": True,
            "resource_ids": ["doc_123"],
            "shared_memory": None,
        }

        with patch("agents.graph.get_llm_provider") as mock_get_llm:
            mock_llm = MagicMock()
            captured_messages = []
            async def mock_generate(messages, temperature=0.15):
                nonlocal captured_messages
                captured_messages = messages
                return "Here is what the roadmap covers..."
            mock_llm.generate_response = AsyncMock(side_effect=mock_generate)
            mock_get_llm.return_value = mock_llm

            res = await general_chat_node(state)
            
            # Verify manifest is included when scoped
            system_msg = captured_messages[0].content
            assert "WORKSPACE SCOPE & INVENTORY:" in system_msg
            assert "q4_roadmap.pdf" in system_msg
    asyncio.run(_run())


def test_active_scope_preserves_document_rag_routing_and_context():
    async def _run():
        from agents.graph import agent_graph
        from unittest.mock import AsyncMock

        initial_state = {
            "user_id": "u123",
            "user_role": "member",
            "conversation_id": "conv_1",
            "message": "what does this say?",
            "resource_ids": [],
            "active_scope": {"id": "doc_hr", "name": "HR_Policy.pdf", "type": "document"},
            "shared_memory": None,
            "history": [],
        }

        with patch("agents.graph.get_database") as mock_get_db, \
             patch("agents.graph.search_documents_vector") as mock_search, \
             patch("agents.graph.get_llm_provider") as mock_get_llm:
            
            mock_db = MagicMock()
            mock_docs = MagicMock()
            mock_docs.find_one.return_value = {
                "_id": "doc_hr",
                "id": "doc_hr",
                "originalName": "HR_Policy.pdf",
                "fileType": "pdf",
                "userId": "u123",
                "status": "ready",
                "chunkCount": 5,
            }
            mock_datasets = MagicMock()
            mock_datasets.find_one.return_value = None
            mock_users = MagicMock()
            mock_users.find_one.return_value = {"_id": "u123", "role": "member"}
            mock_requests = MagicMock()
            mock_requests.find.return_value = []

            mock_db.__getitem__.side_effect = lambda k: {
                "documents": mock_docs,
                "datasets": mock_datasets,
                "users": mock_users,
                "accessrequests": mock_requests,
            }.get(k, MagicMock())
            mock_get_db.return_value = mock_db

            from schemas.chat import Citation
            mock_search.return_value = [
                Citation(
                    documentId="doc_hr",
                    filename="HR_Policy.pdf",
                    page=1,
                    chunkIndex=0,
                    textSnippet="Employees are entitled to 20 days of annual leave.",
                )
            ]

            captured_messages = []
            async def mock_generate(messages, temperature=0.1):
                nonlocal captured_messages
                captured_messages = messages
                return "The HR policy states that employees get 20 days of annual leave."
            mock_llm = MagicMock()
            mock_llm.generate_response = AsyncMock(side_effect=mock_generate)
            mock_get_llm.return_value = mock_llm

            res = await agent_graph.ainvoke(initial_state)
            assert res.get("intent") == AgentIntent.DOCUMENT_RAG
            assert "20 days of annual leave" in res.get("final_answer")
            assert len(res.get("citations")) == 1

            # Verify active scope focus is in prompt
            system_content = captured_messages[0].content
            assert "Active Focus: HR_Policy.pdf" in system_content
            assert "Employees are entitled to 20 days of annual leave" in system_content
    asyncio.run(_run())


def test_file_discovery_via_full_graph_without_llm():
    async def _run():
        from agents.graph import agent_graph

        initial_state = {
            "user_id": "u123",
            "user_role": "member",
            "conversation_id": "conv_2",
            "message": "find the HR policy PDF",
            "resource_ids": [],
            "active_scope": None,
            "shared_memory": None,
            "history": [],
        }

        with patch("agents.graph.get_database") as mock_get_db:
            mock_db = MagicMock()
            mock_docs = MagicMock()
            mock_docs.find.return_value = [
                {
                    "_id": "doc_hr",
                    "id": "doc_hr",
                    "originalName": "HR_Policy.pdf",
                    "fileType": "pdf",
                    "fileSize": 1024,
                    "userId": "u123",
                    "folder": "HR",
                    "downloadPolicy": "allowed",
                }
            ]
            mock_datasets = MagicMock()
            mock_datasets.find.return_value = []
            mock_folders = MagicMock()
            mock_folders.find.return_value = [{"name": "HR", "downloadPolicy": "allowed"}]
            mock_users = MagicMock()
            mock_users.find_one.return_value = {"_id": "u123", "role": "member"}
            mock_requests = MagicMock()
            mock_requests.find.return_value = []

            mock_db.__getitem__.side_effect = lambda k: {
                "documents": mock_docs,
                "datasets": mock_datasets,
                "folders": mock_folders,
                "users": mock_users,
                "accessrequests": mock_requests,
            }.get(k, MagicMock())
            mock_get_db.return_value = mock_db

            res = await agent_graph.ainvoke(initial_state)
            assert res.get("intent") == AgentIntent.FILE_REQUEST
            assert res.get("downloadable_file") is not None
            assert res.get("downloadable_file")["fileName"] == "HR_Policy.pdf"
    asyncio.run(_run())


def test_active_scope_unauthorized_denies_access():
    async def _run():
        from agents.graph import agent_graph
        from unittest.mock import AsyncMock

        initial_state = {
            "user_id": "unauth_user",
            "user_role": "member",
            "conversation_id": "conv_3",
            "message": "summarize this",
            "resource_ids": [],
            "active_scope": {"id": "secret_doc_id", "name": "Confidential_Exec_Review.pdf", "type": "document"},
            "shared_memory": None,
            "history": [],
        }

        with patch("agents.graph.get_database") as mock_get_db, \
             patch("agents.graph.search_documents_vector", return_value=[]), \
             patch("agents.graph.get_llm_provider") as mock_get_llm:
            
            mock_db = MagicMock()
            mock_docs = MagicMock()
            # Document owned by someone else in a restricted folder
            mock_docs.find_one.return_value = {
                "_id": "secret_doc_id",
                "id": "secret_doc_id",
                "originalName": "Confidential_Exec_Review.pdf",
                "fileType": "pdf",
                "userId": "other_owner",
                "folder": "Executive",
            }
            mock_datasets = MagicMock()
            mock_datasets.find_one.return_value = None
            mock_users = MagicMock()
            mock_users.find_one.return_value = {"_id": "unauth_user", "role": "member", "allowedFolders": ["Public"]}
            mock_requests = MagicMock()
            mock_requests.find.return_value = []

            mock_db.__getitem__.side_effect = lambda k: {
                "documents": mock_docs,
                "datasets": mock_datasets,
                "users": mock_users,
                "accessrequests": mock_requests,
            }.get(k, MagicMock())
            mock_get_db.return_value = mock_db

            mock_llm = MagicMock()
            mock_llm.generate_response = AsyncMock(return_value="General fallback")
            mock_get_llm.return_value = mock_llm

            res = await agent_graph.ainvoke(initial_state)
            # Should NOT have resolved the secret doc, should be denied or general fallback without document content
            assert "resolved_documents" in res
            assert len(res["resolved_documents"]) == 0
    asyncio.run(_run())


def test_format_trimmed_history_messages_strips_older_reply_headers():
    from agents.graph import format_trimmed_history_messages
    from langchain_core.messages import HumanMessage, AIMessage

    history = [
        {"role": "user", "content": "What is the policy?"},
        {"role": "assistant", "content": "The policy is 25 days annual leave."},
        {
            "role": "user",
            "content": '[Replying to message from Syntra AI: "The policy is 25 days annual leave."]\nCan I roll over unused days?',
        },
        {"role": "assistant", "content": "Yes, up to 5 days can be rolled over."},
        {
            "role": "user",
            "content": '[Replying to message from Syntra AI: "Yes, up to 5 days can be rolled over."]\nWhat is the deadline for rollover?',
        },
    ]

    messages = format_trimmed_history_messages(history, max_turns=10)
    assert len(messages) == 5

    # Turn 1: Clean user message
    assert messages[0].content == "What is the policy?"
    # Turn 2: Clean assistant response
    assert messages[1].content == "The policy is 25 days annual leave."
    # Turn 3 (older user turn): Redundant quote header stripped, keeping the actual query
    assert messages[2].content == "Can I roll over unused days?"
    # Turn 4: Assistant message
    assert messages[3].content == "Yes, up to 5 days can be rolled over."
    # Turn 5 (most recent user turn in history): Preserves the immediate quote metadata
    assert '[Replying to message from Syntra AI: "Yes, up to 5 days can be rolled over."]' in messages[4].content
    assert "What is the deadline for rollover?" in messages[4].content



