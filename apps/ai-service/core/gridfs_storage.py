import gridfs
import tempfile
import os
import logging
from typing import Optional, Tuple
from core.database import get_database

logger = logging.getLogger(__name__)

def fetch_gridfs_bytes(storage_path: str) -> Optional[bytes]:
    """
    Fetch file binary content from MongoDB Atlas GridFS collection 'uploads'.
    """
    try:
        db = get_database()
        fs = gridfs.GridFS(db, collection="uploads")
        clean_path = storage_path.replace("\\\\", "/")
        
        grid_out = fs.find_one({"filename": clean_path})
        if not grid_out:
            grid_out = fs.find_one({"filename": os.path.basename(clean_path)})
            
        if grid_out:
            return grid_out.read()
    except Exception as e:
        logger.error(f"Error reading {storage_path} from GridFS: {e}")
    return None

def get_gridfs_temp_file(storage_path: str) -> Optional[Tuple[str, callable]]:
    """
    Download GridFS file to a temporary OS path, returning (temp_file_path, cleanup_func).
    """
    data = fetch_gridfs_bytes(storage_path)
    if data is None:
        return None
        
    ext = os.path.splitext(storage_path)[1]
    fd, temp_path = tempfile.mkstemp(suffix=ext, prefix="syntra_chat_ai_")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
        
    def cleanup():
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception as err:
            logger.warning(f"Failed to cleanup temp file {temp_path}: {err}")
            
    return temp_path, cleanup
