from fastapi import APIRouter, HTTPException
from schemas.dataset import DatasetInspectRequest, DatasetInspectResponse
from data_analysis.dataset_loader import load_dataset_metadata

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post("/inspect", response_model=DatasetInspectResponse)
async def inspect_dataset_endpoint(request: DatasetInspectRequest):
    import os
    from core.gridfs_storage import get_gridfs_temp_file
    
    temp_cleanup = None
    try:
        path_to_use = request.storagePath
        if not os.path.exists(path_to_use):
            temp_info = get_gridfs_temp_file(request.storagePath)
            if temp_info:
                path_to_use, temp_cleanup = temp_info

        response = load_dataset_metadata(
            file_path=path_to_use,
            dataset_id=request.datasetId,
            filename=request.filename,
            file_type=request.fileType,
        )
        return response
    except Exception as e:
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

