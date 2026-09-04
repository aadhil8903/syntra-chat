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
