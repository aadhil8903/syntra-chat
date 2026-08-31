from pydantic import BaseModel
from typing import Optional


class DocumentIngestRequest(BaseModel):
    userId: str
    documentId: str
    storagePath: str
    filename: str
    fileType: str


class DocumentIngestResponse(BaseModel):
    documentId: str
    chunkCount: int
    status: str  # "ready" or "failed"
    errorMessage: Optional[str] = None

