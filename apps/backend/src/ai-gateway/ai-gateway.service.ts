import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  IAiChatRequest,
  IAiChatResponse,
  IDocumentIngestRequest,
  IDocumentIngestResponse,
  IDatasetInspectRequest,
  IDatasetInspectResponse,
} from '@enter-chat/shared-types';

export const DEFAULT_AI_TIMEOUT_MS = 90_000;
export const CHAT_TIMEOUT_MS = 120_000;
export const RETRY_DELAY_MS = 2_000;
export const MAX_INGEST_RETRIES = 3;
export const MAX_CHAT_RETRIES = 6;

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly client: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production' ||
      process.env.NODE_ENV === 'production';
    const defaultAiUrl = isProduction
      ? 'https://syntra-chat-ai.onrender.com'
      : 'http://localhost:8000';
    const baseURL = (
      this.configService.get<string>('AI_SERVICE_URL') || defaultAiUrl
    ).trim().replace(/\/+$/, '');
    const timeout = Number(this.configService.get<number>('AI_SERVICE_TIMEOUT_MS', DEFAULT_AI_TIMEOUT_MS));

    this.client = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async ingestDocument(payload: IDocumentIngestRequest, _retryCount = 0): Promise<IDocumentIngestResponse> {
    try {
      const response = await this.client.post<IDocumentIngestResponse>('/rag/ingest', payload);
      return response.data;
    } catch (error: any) {
      const code: string = error.code || '';

      // Auto-retry on connection refused (AI service still booting)
      if ((code === 'ECONNREFUSED' || code === 'ECONNRESET') && _retryCount < MAX_INGEST_RETRIES) {
        const delayMs = (1 + _retryCount) * RETRY_DELAY_MS;
        this.logger.warn(`AI Service not reachable for ingest (attempt ${_retryCount + 1}/${MAX_INGEST_RETRIES}), retrying in ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
        return this.ingestDocument(payload, _retryCount + 1);
      }

      this.logger.error(
        `[AI_GATEWAY_ERROR] Endpoint=/rag/ingest documentId=${payload.documentId} attempt=${_retryCount + 1} status=${error.response?.status || 'network'} error=${error.response?.data?.detail || error.message} stack=${error.stack}`,
      );
      return {
        documentId: payload.documentId,
        chunkCount: 0,
        status: 'failed',
        errorMessage: error.response?.data?.detail || error.message || 'Failed to ingest document',
      };
    }
  }

  async inspectDataset(payload: IDatasetInspectRequest, _retryCount = 0): Promise<IDatasetInspectResponse> {
    try {
      const response = await this.client.post<IDatasetInspectResponse>('/datasets/inspect', payload);
      return response.data;
    } catch (error: any) {
      const code: string = error.code || '';

      // Auto-retry on connection refused (AI service still booting)
      if ((code === 'ECONNREFUSED' || code === 'ECONNRESET') && _retryCount < MAX_INGEST_RETRIES) {
        const delayMs = (1 + _retryCount) * RETRY_DELAY_MS;
        this.logger.warn(`AI Service not reachable for inspect (attempt ${_retryCount + 1}/${MAX_INGEST_RETRIES}), retrying in ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
        return this.inspectDataset(payload, _retryCount + 1);
      }

      this.logger.error(
        `[AI_GATEWAY_ERROR] Endpoint=/datasets/inspect datasetId=${payload.datasetId} attempt=${_retryCount + 1} status=${error.response?.status || 'network'} error=${error.response?.data?.detail || error.message} stack=${error.stack}`,
      );
      return {
        datasetId: payload.datasetId,
        totalRows: 0,
        sheetNames: [],
        sheets: [],
        status: 'failed',
        errorMessage: error.response?.data?.detail || error.message || 'Failed to inspect dataset',
      };
    }
  }

  async chat(payload: IAiChatRequest, _retryCount = 0): Promise<IAiChatResponse> {
    try {
      const response = await this.client.post<IAiChatResponse>('/chat', payload, {
        timeout: CHAT_TIMEOUT_MS,
      });
      return response.data;
    } catch (error: any) {
      const rawMessage: string = error.response?.data?.detail || error.message || '';
      const code: string = error.code || '';

      // Auto-retry on connection issues (service still booting)
      if ((code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ENOTFOUND') && _retryCount < MAX_CHAT_RETRIES) {
        const delayMs = (1 + _retryCount) * RETRY_DELAY_MS;
        this.logger.warn(`AI Service not reachable (attempt ${_retryCount + 1}/${MAX_CHAT_RETRIES}), retrying in ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
        return this.chat(payload, _retryCount + 1);
      }

      this.logger.error(
        `[AI_GATEWAY_ERROR] Endpoint=/chat conversationId=${payload.conversationId} userId=${payload.userId} attempt=${_retryCount + 1} status=${error.response?.status || 'network'} code=${code} rawMessage=${rawMessage} stack=${error.stack}`,
      );

      let userFacingError = '';
      const lower = rawMessage.toLowerCase();

      if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || lower.includes('econnrefused')) {
        userFacingError = 'Sorry, I\'m temporarily unavailable. Please try again in a moment.';
      } else if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota') || lower.includes('credit') || lower.includes('rate limit')) {
        userFacingError = 'I\'ve reached my usage limit for the moment. Please wait a minute and try again, or contact your administrator to check the API quota.';
      } else if (lower.includes('timeout') || lower.includes('econnaborted')) {
        userFacingError = 'That request took too long to process. Please try again — if this keeps happening, try a shorter or simpler question.';
      } else if (lower.includes('api_key') || lower.includes('invalid api key') || lower.includes('401') || lower.includes('403')) {
        userFacingError = 'There\'s an authentication issue on my end. Please contact your administrator to check the API configuration in Settings.';
      } else {
        userFacingError = 'Something went wrong while processing your request. Please try again.';
      }

      return {
        answer: userFacingError,
        intent: 'general_chat' as any,
        citations: [],
      };
    }
  }

  async streamChat(payload: IAiChatRequest): Promise<any> {
    const response = await this.client.post('/chat/stream', payload, {
      responseType: 'stream',
      timeout: CHAT_TIMEOUT_MS,
    });
    return response.data;
  }

    async generateTitle(message: string): Promise<string> {
      try {
        const response = await this.client.post<{ title: string }>('/chat/title', { message });
        if (response.data.title && response.data.title.toLowerCase() !== 'new conversation') {
          return response.data.title;
        }
      } catch (error: any) {
        this.logger.warn(`AI Service generate title error: ${error.message}`);
      }

      // Fallback clean title from message text
      const clean = message.replace(/@[a-zA-Z0-9_\-\./]+/g, '').trim();
      const words = clean.split(/\s+/).filter((w) => w.length > 0);
      if (words.length > 0) {
        const titleWords = words.slice(0, 5).join(' ');
        return titleWords.charAt(0).toUpperCase() + titleWords.slice(1);
      }
      return 'New Conversation';
    }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.client.get('/health');
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async transcribeAudio(file: Express.Multer.File): Promise<{ transcript: string }> {
    try {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', file.buffer, {
        filename: file.originalname || 'audio.webm',
        contentType: file.mimetype || 'audio/webm',
      });

      const response = await this.client.post<{ transcript: string }>('/chat/transcribe', form, {
        headers: form.getHeaders(),
      });
      return response.data || { transcript: '' };
    } catch (error: any) {
      this.logger.error(`AI Service audio transcription failed: ${error.message}`);
      return { transcript: '' };
    }
  }
}
