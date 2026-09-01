import pytest
import asyncio
from unittest.mock import MagicMock, patch
from bson import ObjectId
from agents.graph import (
    resolve_context_node,
    data_analysis_node,
    document_rag_node,
    chart_builder_node,
)
from schemas.chat import AgentIntent


def test_admin_resource_resolution_unrestricted():
    """Verify administrator resolves datasets and documents in unlisted folders without ACL denial."""
    async def _run():
        admin_user_id = str(ObjectId())
        dataset_id = str(ObjectId())
        doc_id = str(ObjectId())

        mock_user_doc = {
            "_id": ObjectId(admin_user_id),
            "email": "admin@syntrachat.internal",
            "role": "admin",
            "departments": ["IT"],
            "allowedFolders": ["PublicOnly"],
        }

        mock_dataset_doc = {
            "_id": ObjectId(dataset_id),
            "userId": ObjectId(),
            "originalName": "Secret_Executive_Salaries.csv",
            "folder": "StrictlyConfidential/Payroll",
            "allowedDepartments": ["Finance"],
            "fileType": "csv",
            "status": "ready",
        }

        mock_doc = {
            "_id": ObjectId(doc_id),
            "userId": ObjectId(),
            "originalName": "Acquisition_Strategy.pdf",
            "folder": "M&A/TopSecret",
            "allowedDepartments": ["Executive"],
            "fileType": "pdf",
            "status": "ready",
        }

        users_col = MagicMock()
        users_col.find_one.return_value = mock_user_doc
        
        accessrequests_col = MagicMock()
        accessrequests_col.find.return_value = []
        
        chunks_col = MagicMock()
        chunks_col.count_documents.return_value = 5

        docs_col = MagicMock()
        datasets_col = MagicMock()

        def mock_docs_find_one(query):
            q_id = query.get("_id")
            if q_id == ObjectId(doc_id) or str(q_id) == doc_id:
                return dict(mock_doc)
            return None

        def mock_datasets_find_one(query):
            q_id = query.get("_id")
            if q_id == ObjectId(dataset_id) or str(q_id) == dataset_id:
                return dict(mock_dataset_doc)
            return None

        docs_col.find_one.side_effect = mock_docs_find_one
        datasets_col.find_one.side_effect = mock_datasets_find_one

        cols = {
            "users": users_col,
            "documents": docs_col,
            "datasets": datasets_col,
            "accessrequests": accessrequests_col,
            "document_chunks": chunks_col,
        }
        mock_db = MagicMock()
        mock_db.__getitem__.side_effect = lambda k: cols.get(k, MagicMock())

        with patch("agents.graph.get_database", return_value=mock_db):
            state = {
                "user_id": admin_user_id,
                "resource_ids": [dataset_id, doc_id],
            }
            res = await resolve_context_node(state)

            assert res["is_admin"] is True
            assert len(res["resolved_datasets"]) == 1
            assert res["resolved_datasets"][0]["originalName"] == "Secret_Executive_Salaries.csv"
            assert len(res["resolved_documents"]) == 1
            assert res["resolved_documents"][0]["originalName"] == "Acquisition_Strategy.pdf"

    asyncio.run(_run())


def test_normal_user_acl_denies_unlisted_folder():
    """Verify normal user is denied access to datasets in folders not in allowedFolders."""
    async def _run():
        normal_user_id = str(ObjectId())
        dataset_id = str(ObjectId())

        mock_user_doc = {
            "_id": ObjectId(normal_user_id),
            "email": "normal@syntrachat.internal",
            "role": "user",
            "departments": ["Marketing"],
            "allowedFolders": ["PublicOnly"],
        }

        mock_dataset_doc = {
            "_id": ObjectId(dataset_id),
            "userId": ObjectId(),
            "originalName": "Restricted_Financials.csv",
            "folder": "StrictlyConfidential/Payroll",
            "allowedDepartments": ["Finance"],
            "fileType": "csv",
            "status": "ready",
        }

        users_col = MagicMock()
        users_col.find_one.return_value = mock_user_doc
        
        accessrequests_col = MagicMock()
        accessrequests_col.find.return_value = []

        docs_col = MagicMock()
        docs_col.find_one.return_value = None

        datasets_col = MagicMock()
        datasets_col.find_one.return_value = mock_dataset_doc

        cols = {
            "users": users_col,
            "documents": docs_col,
            "datasets": datasets_col,
            "accessrequests": accessrequests_col,
        }
        mock_db = MagicMock()
        mock_db.__getitem__.side_effect = lambda k: cols.get(k, MagicMock())

        with patch("agents.graph.get_database", return_value=mock_db):
            state = {
                "user_id": normal_user_id,
                "resource_ids": [dataset_id],
            }
            res = await resolve_context_node(state)

            assert res["is_admin"] is False
            assert len(res["resolved_datasets"]) == 0

    asyncio.run(_run())


def test_inaccessible_dataset_does_not_become_chart_data():
    """Verify access denial message is NEVER processed by chart builder as analytical data."""
    async def _run():
        state = {
            "message": "Show account dataset access distribution",
            "resolved_datasets": [],
            "is_admin": False,
            "intent": AgentIntent.CHART_REQUEST,
        }

        # 1. data_analysis_node returns denial message
        analysis_res = await data_analysis_node(state)
        assert "restricted for your account" in analysis_res["final_answer"].lower()
        assert analysis_res["analysis_table"] is None
        assert analysis_res["analysis_raw_result"] is None

        # 2. chart_builder_node with denial message in final_answer returns None
        combined_state = {
            **state,
            **analysis_res,
        }
        chart_res = await chart_builder_node(combined_state)
        assert chart_res["chart_spec"] is None
        assert chart_res["chart_specs"] == []
        assert "restricted for your account" in chart_res["final_answer"].lower()

    asyncio.run(_run())


def test_admin_empty_dataset_message_is_workspace_focused():
    """Verify admin with no datasets receives a workspace-appropriate message rather than 'contact an admin'."""
    async def _run():
        state = {
            "message": "Analyze revenue trends",
            "resolved_datasets": [],
            "is_admin": True,
            "intent": AgentIntent.DATA_ANALYSIS,
        }

        res = await data_analysis_node(state)
        assert "contact an administrator" not in res["final_answer"].lower()
        assert "no analytical datasets were found" in res["final_answer"].lower()

    asyncio.run(_run())


def test_document_rag_distinguishes_admin_vs_normal():
    """Verify document_rag_node informs normal users of restriction and admins of no matching documents."""
    async def _run():
        state_normal = {
            "message": "What is the policy?",
            "resolved_documents": [],
            "is_admin": False,
        }
        with patch("agents.graph.search_documents_vector", return_value=[]):
            res_normal = await document_rag_node(state_normal)
            assert "restricted for your account" in res_normal["final_answer"].lower()

        state_admin = {
            "message": "What is the policy?",
            "resolved_documents": [],
            "is_admin": True,
        }
        with patch("agents.graph.search_documents_vector", return_value=[]):
            res_admin = await document_rag_node(state_admin)
            assert "no relevant documents were found" in res_admin["final_answer"].lower()
            assert "contact an administrator" not in res_admin["final_answer"].lower()

    asyncio.run(_run())
