import os
import logging
from fastapi import APIRouter, HTTPException
from schemas.ingest import DocumentIngestRequest, DocumentIngestResponse
from rag.ingestion import process_and_ingest_document
from core.gridfs_storage import get_gridfs_temp_file

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rag", tags=["RAG"])


@router.post("/ingest", response_model=DocumentIngestResponse)
async def ingest_document_endpoint(request: DocumentIngestRequest):
    temp_cleanup = None
    try:
        resolved_path = None

        # 1. If physical file exists locally on AI service (e.g. tests or local dev)
        if request.storagePath and os.path.exists(request.storagePath):
            resolved_path = request.storagePath
        else:
            # 2. Retrieve file bytes directly from MongoDB Atlas GridFS into ephemeral temp file
            temp_info = get_gridfs_temp_file(request.storagePath, filename_hint=request.filename)
            if temp_info:
                resolved_path, temp_cleanup = temp_info

        if not resolved_path or not os.path.exists(resolved_path):
            raise FileNotFoundError(
                f"Document file not found in MongoDB Atlas GridFS or local storage for storagePath='{request.storagePath}', filename='{request.filename}'"
            )

        logger.info(f"Ingesting document '{request.filename}' (ID: {request.documentId}) from path: {resolved_path}")

        chunk_count = process_and_ingest_document(
            user_id=request.userId,
            document_id=request.documentId,
            file_path=resolved_path,
            filename=request.filename,
            file_type=request.fileType,
        )

        if chunk_count == 0:
            raise ValueError(f"No text extracted or chunks generated for document '{request.filename}'")

        return DocumentIngestResponse(
            documentId=request.documentId,
            chunkCount=chunk_count,
            status="ready",
        )
    except Exception as e:
        logger.error(f"Ingestion failed for document {request.documentId} ({request.filename}): {e}")
        return DocumentIngestResponse(
            documentId=request.documentId,
            chunkCount=0,
            status="failed",
            errorMessage=str(e),
        )
    finally:
        if temp_cleanup:
            temp_cleanup()

