import { ICitation } from './message.types';

export enum ChartType {
  BAR = 'bar',
  LINE = 'line',
  PIE = 'pie',
  SCATTER = 'scatter',
  DOUGHNUT = 'doughnut',
  AREA = 'area',
}

export interface IChartSeries {
  name: string;
  data: number[];
  color?: string;
}

export interface IChartSpec {
  chartType: ChartType;
  title: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  labels: string[];
  series: IChartSeries[];
  description?: string;
}

export interface ITableSpec {
  title?: string;
  columns: string[];
  rows: (string | number | boolean | null)[][];
  totalRows?: number;
}

export enum AgentIntent {
  DOCUMENT_RAG = 'document_rag',
  DATA_ANALYSIS = 'data_analysis',
  CHART_REQUEST = 'chart_request',
  CALCULATION = 'calculation',
  COMBINED = 'combined',
  GENERAL_CHAT = 'general_chat',
}

export interface IAiChatRequest {
  userId: string;
  conversationId: string;
  message: string;
  resourceIds: string[];
  sharedMemory?: string;
  history?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

export interface IAiChatResponse {
  answer: string;
  intent: AgentIntent;
  citations?: ICitation[];
  generatedChart?: IChartSpec;
  generatedTable?: ITableSpec;
  pythonCode?: string;
  executionOutput?: string;
  tokensUsed?: number;
}

export interface IDocumentIngestRequest {
  userId: string;
  documentId: string;
  storagePath: string;
  filename: string;
  fileType: string;
}

export interface IDocumentIngestResponse {
  documentId: string;
  chunkCount: number;
  status: 'ready' | 'failed';
  errorMessage?: string;
}

export interface IDatasetInspectRequest {
  userId: string;
  datasetId: string;
  storagePath: string;
  filename: string;
  fileType: string;
}

export interface IDatasetInspectResponse {
  datasetId: string;
  sheetNames: string[];
  sheets: Array<{
    sheetName: string;
    rowCount: number;
    columnCount: number;
    columns: Array<{
      name: string;
      dtype: string;
      nonNullCount: number;
      nullCount: number;
      sampleValues: (string | number | boolean | null)[];
    }>;
    previewRows: Record<string, any>[];
  }>;
  totalRows: number;
  status: 'ready' | 'failed';
  errorMessage?: string;
}

