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


@router.post("/reindex/{document_id}")
async def reindex_document_endpoint(document_id: str):
    """
    Re-embeds a single existing document with the currently active embedding provider
    by retrieving its original file from MongoDB Atlas GridFS.
    """
    from bson import ObjectId
    from core.database import get_database
    from embeddings.factory import get_embedding_provider

    db = get_database()
    embedder = get_embedding_provider()

    try:
        obj_id = ObjectId(document_id) if ObjectId.is_valid(document_id) else document_id
        doc = db["documents"].find_one({"_id": obj_id})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")

        storage_path = doc.get("storagePath")
        if not storage_path:
            raise HTTPException(status_code=400, detail="Document has no storagePath configured.")

        temp_info = get_gridfs_temp_file(storage_path, filename_hint=doc.get("originalName"))
        if not temp_info:
            raise HTTPException(status_code=404, detail="File could not be retrieved from GridFS.")

        tpath, cleanup_fn = temp_info
        try:
            chunk_count = process_and_ingest_document(
                user_id=str(doc.get("userId")),
                document_id=str(doc["_id"]),
                file_path=tpath,
                filename=doc.get("originalName", "doc"),
                file_type=doc.get("fileType", "pdf"),
            )
            db["documents"].update_one(
                {"_id": doc["_id"]},
                {"$set": {"chunkCount": chunk_count, "status": "ready"}},
            )
            return {
                "documentId": str(doc["_id"]),
                "chunkCount": chunk_count,
                "status": "ready",
                "embeddingProvider": embedder.provider_name,
                "embeddingModel": embedder.model_name,
            }
        finally:
            cleanup_fn()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reindex failed for document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reindex-all")
async def reindex_all_endpoint():
    """
    Re-embeds all existing narrative documents with the active embedding provider
    if they do not yet have chunks stored under the active provider.
    """
    from core.database import get_database
    from embeddings.factory import get_embedding_provider

    db = get_database()
    embedder = get_embedding_provider()
    provider_name = embedder.provider_name

    docs = list(db["documents"].find({"status": {"$ne": "archived"}}))
    reindexed_count = 0
    errors = []

    for doc in docs:
        if doc.get("sourceType") == "tabular" or doc.get("fileType") in ["csv", "xlsx", "xls"]:
            continue

        doc_id = str(doc["_id"])
        existing_chunks = db["document_chunks"].count_documents({
            "document_id": doc_id,
            "embedding_provider": provider_name,
        })

        if existing_chunks == 0 and doc.get("storagePath"):
            temp_info = get_gridfs_temp_file(doc["storagePath"], filename_hint=doc.get("originalName"))
            if temp_info:
                tpath, cleanup_fn = temp_info
                try:
                    count = process_and_ingest_document(
                        user_id=str(doc.get("userId")),
                        document_id=doc_id,
                        file_path=tpath,
                        filename=doc.get("originalName", "doc"),
                        file_type=doc.get("fileType", "pdf"),
                    )
                    db["documents"].update_one(
                        {"_id": doc["_id"]},
                        {"$set": {"chunkCount": count, "status": "ready"}},
                    )
                    reindexed_count += 1
                except Exception as e:
                    errors.append({"documentId": doc_id, "error": str(e)})
                finally:
                    cleanup_fn()

    return {
        "totalDocuments": len(docs),
        "reindexedCount": reindexed_count,
        "embeddingProvider": provider_name,
        "embeddingModel": embedder.model_name,
        "errors": errors,
    }


