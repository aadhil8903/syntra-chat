import os
import logging
from fastapi import APIRouter, HTTPException
from schemas.dataset import DatasetInspectRequest, DatasetInspectResponse
from data_analysis.dataset_loader import load_dataset_metadata
from core.gridfs_storage import get_gridfs_temp_file

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post("/inspect", response_model=DatasetInspectResponse)
async def inspect_dataset_endpoint(request: DatasetInspectRequest):
    temp_cleanup = None
    try:
        path_to_use = None

        if request.storagePath and os.path.exists(request.storagePath):
            path_to_use = request.storagePath
        else:
            temp_info = get_gridfs_temp_file(request.storagePath, filename_hint=request.filename)
            if temp_info:
                path_to_use, temp_cleanup = temp_info

        if not path_to_use or not os.path.exists(path_to_use):
            raise FileNotFoundError(
                f"Dataset file not found in MongoDB Atlas GridFS or local storage for storagePath='{request.storagePath}', filename='{request.filename}'"
            )

        response = load_dataset_metadata(
            file_path=path_to_use,
            dataset_id=request.datasetId,
            filename=request.filename,
            file_type=request.fileType,
        )
        return response
    except Exception as e:
        logger.error(f"Dataset inspection failed for {request.datasetId} ({request.filename}): {e}")
        return DatasetInspectResponse(
            datasetId=request.datasetId,
            sheetNames=[],
            sheets=[],
            totalRows=0,
            status="failed",
            errorMessage=str(e),
        )
    finally:
        if temp_cleanup:
            temp_cleanup()


