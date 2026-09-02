export enum DocumentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export enum SupportedDocumentFormat {
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt',
  MD = 'md',
  JSON = 'json',
  CSV = 'csv',
  XLSX = 'xlsx',
  XLS = 'xls',
}

export interface IDocument {
  id: string;
  userId: string;
  filename: string;
  originalName: string;
  fileType: SupportedDocumentFormat;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  allowedDepartments: string[];
  hasAccess?: boolean;
  requestStatus?: 'pending' | 'approved' | 'rejected' | null;
  folder?: string;
  status: DocumentStatus;
  chunkCount: number;
  sheetNames?: string[];
  sheets?: any[];
  totalRows?: number;
  sourceType?: 'narrative' | 'tabular';
  errorMessage?: string;
  uploadedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IDocumentChunk {
  id: string;
  documentId: string;
  userId: string;
  text: string;
  page?: number;
  chunkIndex: number;
  score?: number;
}
