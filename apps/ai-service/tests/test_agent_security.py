import pytest
from agents.state import AgentState

def test_agent_state_initialization():
    state = AgentState(
        messages=[{"role": "user", "content": "What is the policy?"}],
        user_id="user_123",
        referenced_resource_ids=["doc_1"],
        resolved_documents=[],
        resolved_datasets=[],
        intent="DOCUMENT_RAG",
        citations=[],
        generated_charts=[],
        final_answer=""
    )
    assert state["user_id"] == "user_123"
    assert state["intent"] == "DOCUMENT_RAG"
