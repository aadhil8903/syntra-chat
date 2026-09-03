import { IConversation } from './conversation.types';
import { IChartSpec, ITableSpec } from './ai.types';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export interface ICitation {
  documentId: string;
  filename: string;
  page?: number;
  chunkIndex?: number;
  sheetName?: string;
  sourceType?: 'narrative' | 'tabular' | string;
  textSnippet: string;
  score?: number;
}

export interface IDownloadableFile {
  documentId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  folder?: string;
}

export interface IMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  content: string;
  referencedResourceIds: string[];
  citations?: ICitation[];
  generatedChart?: IChartSpec;
  generatedCharts?: IChartSpec[];
  generatedTable?: ITableSpec;
  pythonCode?: string;
  executionOutput?: string;
  downloadableFile?: IDownloadableFile;
  createdAt: string;
}

export interface ISendMessageDto {
  conversationId: string;
  content: string;
  referencedResourceIds?: string[];
}

export interface ISendMessageResponse {
  userMessage: IMessage;
  assistantMessage: IMessage;
  conversation?: IConversation;
}
