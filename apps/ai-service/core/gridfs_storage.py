import gridfs
import tempfile
import os
import re
import logging
from typing import Optional, Tuple
from bson import ObjectId
from core.database import get_database

logger = logging.getLogger(__name__)

def fetch_gridfs_bytes(storage_path: str) -> Optional[bytes]:
    """
    Fetch file binary content from MongoDB Atlas GridFS collection 'uploads'.
    Handles forward/backward slash normalization, basenames, ObjectIds, and regex matching.
    """
    if not storage_path:
        return None

    try:
        db = get_database()
        fs = gridfs.GridFS(db, collection="uploads")
        forward_path = storage_path.replace("\\\\", "/").replace("\\", "/")
        back_path = forward_path.replace("/", "\\")
        base_name = os.path.basename(forward_path)

        # 1. Try exact candidates
        for candidate in [forward_path, back_path, base_name, forward_path.lstrip("/"), back_path.lstrip("\\")]:
            if candidate:
                grid_out = fs.find_one({"filename": candidate})
                if grid_out:
                    return grid_out.read()

        # 2. Try by ObjectId if valid
        if ObjectId.is_valid(storage_path):
            grid_out = fs.find_one({"_id": ObjectId(storage_path)})
            if grid_out:
                return grid_out.read()

        # 3. Try regex matching end of filename
        if base_name:
            grid_out = fs.find_one({"filename": {"$regex": re.escape(base_name) + "$", "$options": "i"}})
            if grid_out:
                return grid_out.read()

        # 4. Fallback: check if storage_path or base_name is registered in documents/datasets collections
        doc = db["documents"].find_one({
            "$or": [
                {"storagePath": forward_path},
                {"storagePath": back_path},
                {"filename": base_name},
                {"originalName": base_name},
                {"_id": ObjectId(storage_path)} if ObjectId.is_valid(storage_path) else {"_id": None},
            ]
        }) or db["datasets"].find_one({
            "$or": [
                {"storagePath": forward_path},
                {"storagePath": back_path},
                {"filename": base_name},
                {"originalName": base_name},
                {"_id": ObjectId(storage_path)} if ObjectId.is_valid(storage_path) else {"_id": None},
            ]
        })

        if doc:
            doc_sp = doc.get("storagePath") or doc.get("filename")
            if doc_sp and doc_sp != storage_path:
                return fetch_gridfs_bytes(doc_sp)

    except Exception as e:
        logger.error(f"Error reading {storage_path} from GridFS: {e}")
    return None

def get_gridfs_temp_file(storage_path: str, filename_hint: Optional[str] = None) -> Optional[Tuple[str, callable]]:
    """
    Download GridFS file to an ephemeral temporary OS path inside the AI service,
    returning (temp_file_path, cleanup_func).
    """
    data = fetch_gridfs_bytes(storage_path)
    if data is None and filename_hint:
        data = fetch_gridfs_bytes(filename_hint)

    if data is None:
        return None

    # Determine extension
    ext = os.path.splitext(filename_hint or storage_path)[1]
    if not ext and storage_path:
        ext = os.path.splitext(storage_path)[1]

    fd, temp_path = tempfile.mkstemp(suffix=ext, prefix="syntra_chat_ai_")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
    except Exception as e:
        logger.error(f"Failed to write temp file {temp_path}: {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return None

    def cleanup():
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception as err:
            logger.warning(f"Failed to cleanup temp file {temp_path}: {err}")

    return temp_path, cleanup

