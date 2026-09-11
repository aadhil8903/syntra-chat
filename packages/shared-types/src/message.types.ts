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

export interface IMessageAuthor {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  role?: string;
}

export interface IMention {
  type: 'user' | 'ai';
  id: string;
  name: string;
}

export interface IReplyToPreview {
  id: string;
  senderName: string;
  content: string;
  fileName?: string;
  isAi?: boolean;
}

export interface IMessage {
  id: string;
  conversationId: string;
  userId: string;
  author?: IMessageAuthor;
  role: MessageRole;
  content: string;
  mentions?: IMention[];
  referencedResourceIds: string[];
  citations?: ICitation[];
  generatedChart?: IChartSpec;
  generatedCharts?: IChartSpec[];
  generatedTable?: ITableSpec;
  pythonCode?: string;
  executionOutput?: string;
  downloadableFile?: IDownloadableFile;
  replyToMessageId?: string;
  replyTo?: IReplyToPreview;
  createdAt: string;
}

export interface ISendMessageDto {
  conversationId?: string;
  content: string;
  mentions?: IMention[];
  referencedResourceIds?: string[];
  temporary?: boolean;
  isDirect?: boolean;
  downloadableFile?: IDownloadableFile;
  replyToMessageId?: string;
  replyTo?: IReplyToPreview;
}

export interface ISendMessageResponse {
  userMessage: IMessage;
  assistantMessage?: IMessage;
  conversation?: IConversation;
}

export interface IMessageShare {
  id: string;
  messageId: string;
  conversationId: string;
  ownerId: string;
  sharedWithUserId: string;
  sharedWithUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  sharedByUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  message?: IMessage;
  createdAt: string;
}

export interface IShareMessageDto {
  userIds: string[];
}
