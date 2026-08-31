import os
from fastapi import APIRouter, HTTPException
from schemas.ingest import DocumentIngestRequest, DocumentIngestResponse
from rag.ingestion import process_and_ingest_document
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rag", tags=["RAG"])

# The uploads directory is at project root (2 levels above apps/ai-service)
# Backend NestJS stores files at <project_root>/uploads/<storagePath>
_AI_SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # apps/ai-service
_PROJECT_ROOT = os.path.dirname(os.path.dirname(_AI_SERVICE_DIR))               # Enter-Chat root
_UPLOADS_ROOT = os.path.join(_PROJECT_ROOT, "uploads")


def resolve_file_path(storage_path: str) -> str:
    """
    Resolve the absolute path for a stored file.
    Try multiple candidate paths to be resilient regardless of working directory.
    """
    candidates = [
        storage_path,                                           # already absolute
        os.path.join(_UPLOADS_ROOT, storage_path),             # project_root/uploads/<path>
        os.path.join(_AI_SERVICE_DIR, "uploads", storage_path),  # ai-service/uploads/<path>
        os.path.join(os.getcwd(), "uploads", storage_path),    # cwd/uploads/<path>
        os.path.join(os.getcwd(), storage_path),               # cwd/<path>
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate

    # Log all tried paths for debugging
    logger.warning(f"File not found in any candidate location for storagePath='{storage_path}': {candidates}")
    return candidates[1]  # Best guess: project_root/uploads/<path>


@router.post("/ingest", response_model=DocumentIngestResponse)
async def ingest_document_endpoint(request: DocumentIngestRequest):
    from core.gridfs_storage import get_gridfs_temp_file
    
    temp_cleanup = None
    try:
        resolved_path = resolve_file_path(request.storagePath)
        if not os.path.exists(resolved_path):
            temp_info = get_gridfs_temp_file(request.storagePath)
            if temp_info:
                resolved_path, temp_cleanup = temp_info

        logger.info(f"Ingesting document '{request.filename}' from resolved path: {resolved_path}")

        chunk_count = process_and_ingest_document(
            user_id=request.userId,
            document_id=request.documentId,
            file_path=resolved_path,
            filename=request.filename,
            file_type=request.fileType,
        )
        return DocumentIngestResponse(
            documentId=request.documentId,
            chunkCount=chunk_count,
            status="ready",
        )
    except Exception as e:
        logger.error(f"Ingestion failed for document {request.documentId}: {e}")
        return DocumentIngestResponse(
            documentId=request.documentId,
            chunkCount=0,
            status="failed",
            errorMessage=str(e),
        )
    finally:
        if temp_cleanup:
            temp_cleanup()
