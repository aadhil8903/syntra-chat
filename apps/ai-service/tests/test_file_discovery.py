import pytest
import asyncio
from unittest.mock import MagicMock, patch
from schemas.chat import AgentIntent
from agents.graph import route_intent_node, file_request_node


def test_route_intent_file_request():
    test_messages = [
        "Give me the Q3 sales report PDF",
        "Can I download the employee handbook?",
        "Find the PDF for the 2025 financial report",
        "Download the onboarding guide",
        "Get me the PDF from the Sales folder",
        "download sales_report.pdf",
    ]
    for msg in test_messages:
        state = {"message": msg, "resolved_documents": [], "resolved_datasets": []}
        res = asyncio.run(route_intent_node(state))
        assert res.get("intent") == AgentIntent.FILE_REQUEST, f"Failed for query: {msg}"


def test_file_request_exact_allowed():
    mock_db = MagicMock()
    mock_folders_col = MagicMock()
    mock_folders_col.find.return_value = [{"name": "Sales", "downloadPolicy": "allowed"}]
    mock_db.__getitem__.side_effect = lambda key: mock_folders_col if key == "folders" else MagicMock()

    with patch("agents.graph.get_database", return_value=mock_db):
        state = {
            "user_id": "u1",
            "message": "Give me the Q3 sales report PDF",
            "resolved_documents": [
                {
                    "_id": "doc123",
                    "id": "doc123",
                    "originalName": "Q3 Sales Report.pdf",
                    "fileType": "pdf",
                    "fileSize": 1024,
                    "folder": "Sales",
                    "downloadPolicy": "inherit",
                }
            ],
        }
        res = asyncio.run(file_request_node(state))
        assert res.get("intent") == AgentIntent.FILE_REQUEST
        assert "Sure, I found the PDF." in res.get("final_answer", "")
        dl = res.get("downloadable_file")
        assert dl is not None
        assert dl["documentId"] == "doc123"
        assert dl["fileName"] == "Q3 Sales Report.pdf"


def test_file_request_exact_restricted():
    mock_db = MagicMock()
    mock_folders_col = MagicMock()
    mock_folders_col.find.return_value = [{"name": "Sales", "downloadPolicy": "restricted"}]
    mock_db.__getitem__.side_effect = lambda key: mock_folders_col if key == "folders" else MagicMock()

    with patch("agents.graph.get_database", return_value=mock_db):
        state = {
            "user_id": "u1",
            "message": "Give me the Q3 sales report PDF",
            "resolved_documents": [
                {
                    "_id": "doc123",
                    "id": "doc123",
                    "originalName": "Q3 Sales Report.pdf",
                    "fileType": "pdf",
                    "fileSize": 1024,
                    "folder": "Sales",
                    "downloadPolicy": "inherit",
                }
            ],
        }
        res = asyncio.run(file_request_node(state))
        assert res.get("intent") == AgentIntent.FILE_REQUEST
        assert "restricted from downloading" in res.get("final_answer", "")
        assert res.get("downloadable_file") is None


def test_file_request_explicit_override_allowed():
    mock_db = MagicMock()
    mock_folders_col = MagicMock()
    mock_folders_col.find.return_value = [{"name": "Sales", "downloadPolicy": "restricted"}]
    mock_db.__getitem__.side_effect = lambda key: mock_folders_col if key == "folders" else MagicMock()

    with patch("agents.graph.get_database", return_value=mock_db):
        state = {
            "user_id": "u1",
            "message": "Give me the Public Summary PDF",
            "resolved_documents": [
                {
                    "_id": "doc456",
                    "id": "doc456",
                    "originalName": "Public Summary.pdf",
                    "fileType": "pdf",
                    "fileSize": 2048,
                    "folder": "Sales",
                    "downloadPolicy": "allowed",
                }
            ],
        }
        res = asyncio.run(file_request_node(state))
        assert res.get("intent") == AgentIntent.FILE_REQUEST
        assert res.get("downloadable_file") is not None
        assert res.get("downloadable_file")["documentId"] == "doc456"


def test_file_request_not_found():
    mock_db = MagicMock()
    mock_folders_col = MagicMock()
    mock_folders_col.find.return_value = []
    mock_db.__getitem__.side_effect = lambda key: mock_folders_col if key == "folders" else MagicMock()

    with patch("agents.graph.get_database", return_value=mock_db):
        state = {
            "user_id": "u1",
            "message": "Find the PDF for the non-existent mystery file",
            "resolved_documents": [],
        }
        res = asyncio.run(file_request_node(state))
        assert res.get("intent") == AgentIntent.FILE_REQUEST
        assert "couldn't find" in res.get("final_answer", "").lower()
        assert res.get("downloadable_file") is None


def test_file_request_alternative_suggestion():
    mock_db = MagicMock()
    mock_folders_col = MagicMock()
    mock_folders_col.find.return_value = []
    mock_db.__getitem__.side_effect = lambda key: mock_folders_col if key == "folders" else MagicMock()

    with patch("agents.graph.get_database", return_value=mock_db):
        state = {
            "user_id": "u1",
            "message": "Give me the Q3 sales report PDF",
            "resolved_documents": [
                {
                    "_id": "doc789",
                    "id": "doc789",
                    "originalName": "Q3 Sales Report - Final.pdf",
                    "fileType": "pdf",
                    "fileSize": 1024,
                    "folder": "Sales",
                    "downloadPolicy": "allowed",
                }
            ],
        }
        res = asyncio.run(file_request_node(state))
        assert res.get("intent") == AgentIntent.FILE_REQUEST
        assert "Q3 Sales Report - Final.pdf" in res.get("final_answer", "")
        assert "Is that the file you're looking for?" in res.get("final_answer", "")
        assert res.get("downloadable_file") is None


def test_file_request_referential_history_give_me_that_file():
    mock_db = MagicMock()
    mock_folders_col = MagicMock()
    mock_folders_col.find.return_value = []
    mock_db.__getitem__.side_effect = lambda key: mock_folders_col if key == "folders" else MagicMock()

    with patch("agents.graph.get_database", return_value=mock_db):
        state = {
            "user_id": "u1",
            "message": "give me that file.. I wanna download",
            "resolved_documents": [
                {
                    "_id": "doc_annual_2025",
                    "id": "doc_annual_2025",
                    "originalName": "23_annual_report_fy2025.pdf",
                    "fileType": "pdf",
                    "fileSize": 4500000,
                    "folder": "Finance",
                    "downloadPolicy": "allowed",
                }
            ],
            "history": [
                {"role": "user", "content": "Tell me about @23_annual_report_fy2025.pdf"},
                {"role": "assistant", "content": "The 23_annual_report_fy2025.pdf covers our financial results."},
            ],
        }
        res = asyncio.run(file_request_node(state))
        assert res.get("intent") == AgentIntent.FILE_REQUEST
        assert res.get("final_answer") == "Here is the file."
        dl = res.get("downloadable_file")
        assert dl is not None
        assert dl["documentId"] == "doc_annual_2025"
        assert dl["fileName"] == "23_annual_report_fy2025.pdf"


def test_file_request_active_scope_download():
    mock_db = MagicMock()
    mock_folders_col = MagicMock()
    mock_folders_col.find.return_value = []
    mock_db.__getitem__.side_effect = lambda key: mock_folders_col if key == "folders" else MagicMock()

    with patch("agents.graph.get_database", return_value=mock_db):
        state = {
            "user_id": "u1",
            "message": "download this file",
            "active_scope": {
                "id": "doc_annual_2025",
                "name": "23_annual_report_fy2025.pdf",
                "type": "file",
            },
            "resolved_documents": [
                {
                    "_id": "doc_annual_2025",
                    "id": "doc_annual_2025",
                    "originalName": "23_annual_report_fy2025.pdf",
                    "fileType": "pdf",
                    "fileSize": 4500000,
                    "folder": "Finance",
                    "downloadPolicy": "allowed",
                }
            ],
        }
        res = asyncio.run(file_request_node(state))
        assert res.get("intent") == AgentIntent.FILE_REQUEST
        assert res.get("final_answer") == "Here is the file."
        assert res.get("downloadable_file") is not None
        assert res.get("downloadable_file")["documentId"] == "doc_annual_2025"


def test_file_request_referential_history_restricted():
    mock_db = MagicMock()
    mock_folders_col = MagicMock()
    mock_folders_col.find.return_value = []
    mock_db.__getitem__.side_effect = lambda key: mock_folders_col if key == "folders" else MagicMock()

    with patch("agents.graph.get_database", return_value=mock_db):
        state = {
            "user_id": "u1",
            "message": "give me that file.. I wanna download",
            "resolved_documents": [
                {
                    "_id": "doc_annual_2025",
                    "id": "doc_annual_2025",
                    "originalName": "23_annual_report_fy2025.pdf",
                    "fileType": "pdf",
                    "fileSize": 4500000,
                    "folder": "Finance",
                    "downloadPolicy": "restricted",
                }
            ],
            "history": [
                {"role": "user", "content": "Tell me about @23_annual_report_fy2025.pdf"},
                {"role": "assistant", "content": "The 23_annual_report_fy2025.pdf covers our financial results."},
            ],
        }
        res = asyncio.run(file_request_node(state))
        assert res.get("intent") == AgentIntent.FILE_REQUEST
        assert "restricted from downloading" in res.get("final_answer")
        assert res.get("downloadable_file") is None

