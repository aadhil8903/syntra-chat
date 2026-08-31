from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


class DatasetColumnInfo(BaseModel):
    name: str
    dtype: str
    nonNullCount: int
    nullCount: int
    sampleValues: List[Any] = Field(default_factory=list)


class DatasetSheetInfo(BaseModel):
    sheetName: str
    rowCount: int
    columnCount: int
    columns: List[DatasetColumnInfo]
    previewRows: List[Dict[str, Any]] = Field(default_factory=list)


class DatasetInspectRequest(BaseModel):
    userId: str
    datasetId: str
    storagePath: str
    filename: str
    fileType: str


class DatasetInspectResponse(BaseModel):
    datasetId: str
    sheetNames: List[str]
    sheets: List[DatasetSheetInfo]
    totalRows: int
    status: str  # "ready" or "failed"
    errorMessage: Optional[str] = None

