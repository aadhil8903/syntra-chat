export enum DatasetStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export enum SupportedDatasetFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
  XLS = 'xls',
}

export interface IDatasetColumn {
  name: string;
  dtype: string;
  nonNullCount: number;
  nullCount: number;
  sampleValues: (string | number | boolean | null)[];
}

export interface IDatasetSheet {
  sheetName: string;
  rowCount: number;
  columnCount: number;
  columns: IDatasetColumn[];
  previewRows: Record<string, any>[];
}

export interface IDataset {
  id: string;
  userId: string;
  filename: string;
  originalName: string;
  fileType: SupportedDatasetFormat;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  allowedDepartments: string[];
  hasAccess?: boolean;
  requestStatus?: 'pending' | 'approved' | 'rejected' | null;
  folder?: string;
  status: DatasetStatus;
  sheetNames: string[];
  sheets: IDatasetSheet[];
  totalRows: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
