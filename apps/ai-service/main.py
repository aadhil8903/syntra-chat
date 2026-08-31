import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import get_settings
from routers import chat, ingest, datasets, health

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ai_service")

settings = get_settings()

app = FastAPI(
    title="Syntra Chat AI Orchestration Service",
    description="Microservice providing LangChain & LangGraph agents, RAG vector retrieval with BGE embeddings, and sandboxed Pandas data analytics.",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(health.router)
app.include_router(chat.router)
app.include_router(ingest.router)
app.include_router(datasets.router)

@app.on_event("startup")
async def on_startup():
    logger.info(f"Starting {settings.SERVICE_NAME} on port {settings.PORT}")
    logger.info(f"LLM Provider: {settings.LLM_PROVIDER}")
    logger.info(f"Embedding Provider: {settings.EMBEDDING_PROVIDER} ({settings.BGE_MODEL})")

if __name__ == "__main__":
    import uvicorn
    port = int(settings.PORT) if int(settings.PORT) != 3000 else 8000
    uvicorn.run("main:app", host=settings.HOST, port=port, reload=settings.DEBUG)

