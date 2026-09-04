from enum import Enum
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


class AgentIntent(str, Enum):
    DOCUMENT_RAG = "document_rag"
    DATA_ANALYSIS = "data_analysis"
    CHART_REQUEST = "chart_request"
    CALCULATION = "calculation"
    COMBINED = "combined"
    GENERAL_CHAT = "general_chat"
    FILE_REQUEST = "file_request"
    CLARIFICATION = "clarification"


class ChartType(str, Enum):
    BAR = "bar"
    LINE = "line"
    PIE = "pie"
    SCATTER = "scatter"
    DOUGHNUT = "doughnut"
    AREA = "area"


class ChartSeries(BaseModel):
    name: str
    data: List[float]
    color: Optional[str] = None


class ChartSpec(BaseModel):
    chartType: ChartType
    title: str
    xAxisLabel: Optional[str] = None
    yAxisLabel: Optional[str] = None
    labels: List[str]
    series: List[ChartSeries]
    description: Optional[str] = None


class TableSpec(BaseModel):
    title: Optional[str] = None
    columns: List[str]
    rows: List[List[Any]]
    totalRows: Optional[int] = None


class Citation(BaseModel):
    documentId: str
    filename: str
    page: Optional[int] = None
    chunkIndex: Optional[int] = None
    sheetName: Optional[str] = None
    sourceType: Optional[str] = "narrative"  # "narrative" or "tabular"
    textSnippet: str
    score: Optional[float] = None


class ChatMessageItem(BaseModel):
    role: str  # "user", "assistant", "system"
    content: str


class ActiveScopeItem(BaseModel):
    type: str  # "document", "folder", "dataset"
    id: str
    name: str


class ChatRequest(BaseModel):
    userId: str
    userRole: Optional[str] = None
    conversationId: str
    message: str
    resourceIds: List[str] = Field(default_factory=list)
    activeScope: Optional[ActiveScopeItem] = None
    sharedMemory: Optional[str] = None
    history: List[ChatMessageItem] = Field(default_factory=list)


class DownloadableFile(BaseModel):
    documentId: str
    fileName: str
    fileSize: int
    mimeType: str = "application/pdf"
    folder: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    intent: AgentIntent
    citations: Optional[List[Citation]] = None
    generatedChart: Optional[ChartSpec] = None
    generatedCharts: Optional[List[ChartSpec]] = None
    generatedTable: Optional[TableSpec] = None
    pythonCode: Optional[str] = None
    executionOutput: Optional[str] = None
    downloadableFile: Optional[DownloadableFile] = None
    tokensUsed: Optional[int] = 0

