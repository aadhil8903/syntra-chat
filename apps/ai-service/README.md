# AI Service (FastAPI + LangChain + LangGraph)

This service provides:
- Pluggable LLM provider abstraction (Gemini API / Local LLM)
- Local BGE embedding model via `sentence-transformers`
- MongoDB vector search RAG ingestion and retrieval scoped to `user_id`
- Sandboxed Pandas data analysis execution
- Deterministic LangGraph StateGraph agent router

