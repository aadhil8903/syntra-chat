import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { IMessage, ISendMessageResponse, IConversation } from '@enter-chat/shared-types';
import { getApiBaseUrl } from '../config/app-config';

export type ChatGenerationStatus = 'idle' | 'generating' | 'done' | 'error';

@Injectable({
  providedIn: 'root',
})
export class ChatStateService {
  constructor(private api: ApiService) {}

  // Per-conversation status: { [conversationId]: 'idle' | 'generating' | 'done' | 'error' }
  readonly generationStates = signal<Record<string, ChatGenerationStatus>>({});
  
  // Per-conversation errors: { [conversationId]: string }
  readonly conversationErrors = signal<Record<string, string>>({});

  // Per-conversation in-memory messages cache: { [conversationId]: IMessage[] }
  readonly messagesByConversation = signal<Record<string, IMessage[]>>({});

  // Active generation count computed signal
  readonly activeGenerations = computed(() =>
    Object.entries(this.generationStates())
      .filter(([_, status]) => status === 'generating')
      .map(([id]) => id),
  );

  readonly activeGenerationsCount = computed(() => this.activeGenerations().length);

  /**
   * Check if a specific conversation is currently generating
   */
  isGenerating(conversationId: string | null | undefined): boolean {
    if (!conversationId) return false;
    return this.generationStates()[conversationId] === 'generating';
  }

  /**
   * Get status for a specific conversation
   */
  getStatus(conversationId: string | null | undefined): ChatGenerationStatus {
    if (!conversationId) return 'idle';
    return this.generationStates()[conversationId] || 'idle';
  }

  /**
   * Get error for a specific conversation
   */
  getError(conversationId: string | null | undefined): string {
    if (!conversationId) return '';
    return this.conversationErrors()[conversationId] || '';
  }

  /**
   * Clear error for a specific conversation
   */
  clearError(conversationId: string): void {
    const errors = { ...this.conversationErrors() };
    delete errors[conversationId];
    this.conversationErrors.set(errors);
  }

  /**
   * Get cached messages for a conversation
   */
  getCachedMessages(conversationId: string): IMessage[] | null {
    return this.messagesByConversation()[conversationId] || null;
  }

  /**
   * Store messages for a conversation
   */
  setMessages(conversationId: string, messages: IMessage[]): void {
    const current = { ...this.messagesByConversation() };
    current[conversationId] = messages;
    this.messagesByConversation.set(current);
  }

  /**
   * Remove conversation from cache upon deletion
   */
  deleteConversationState(conversationId: string): void {
    const states = { ...this.generationStates() };
    delete states[conversationId];
    this.generationStates.set(states);

    const errors = { ...this.conversationErrors() };
    delete errors[conversationId];
    this.conversationErrors.set(errors);

    const msgs = { ...this.messagesByConversation() };
    delete msgs[conversationId];
    this.messagesByConversation.set(msgs);
  }

  /**
   * Dispatch a message generation request.
   * This executes at the singleton service level so background generations
   * continue uninterrupted even if the user switches chats or navigates away.
   */
  sendMessage(
    conversationId: string,
    content: string,
    referencedResourceIds: string[] = [],
    onConversationUpdated?: (conv: IConversation) => void,
  ): Observable<ISendMessageResponse> {
    // 1. Check if this conversation is already generating
    if (this.isGenerating(conversationId)) {
      return throwError(() => new Error('This chat is already generating a response.'));
    }

    // 2. Check max concurrent generation limit (Max 2)
    if (this.activeGenerationsCount() >= 2) {
      const limitError = 'You can have up to 2 active chat generations at once. Please wait for one to finish.';
      this.setConversationError(conversationId, limitError);
      return throwError(() => new Error(limitError));
    }

    // Clear previous error
    this.clearError(conversationId);

    // Set status to generating for this chat
    this.setConversationStatus(conversationId, 'generating');

    // Optimistic UI user message push
    const tempUserMsg: IMessage = {
      id: 'temp-' + Date.now(),
      conversationId,
      userId: '',
      role: 'user' as any,
      content,
      referencedResourceIds,
      createdAt: new Date().toISOString(),
    };

    const currentMsgs = this.getCachedMessages(conversationId) || [];
    this.setMessages(conversationId, [...currentMsgs, tempUserMsg]);

    return this.api
      .sendMessage({
        conversationId,
        content,
        referencedResourceIds,
      })
      .pipe(
        tap((res) => {
          // Success: Update messages cache for this conversation
          const msgs = this.getCachedMessages(conversationId) || [];
          const idx = msgs.findIndex((m) => m.id === tempUserMsg.id);
          const updatedMsgs = [...msgs];
          if (idx !== -1) {
            updatedMsgs[idx] = res.userMessage;
          } else {
            updatedMsgs.push(res.userMessage);
          }
          updatedMsgs.push(res.assistantMessage);
          this.setMessages(conversationId, updatedMsgs);

          // Update status to done
          this.setConversationStatus(conversationId, 'done');

          if (res.conversation && onConversationUpdated) {
            onConversationUpdated(res.conversation);
          }
        }),
        catchError((err) => {
          const errMsg =
            err.error?.message ||
            err.error?.error ||
            err.message ||
            'Failed to get response from AI. Please check server status.';
          this.setConversationError(conversationId, errMsg);
          this.setConversationStatus(conversationId, 'error');
          return throwError(() => err);
        }),
      );
  }

  /**
   * Dispatch a real-time streaming message request using Server-Sent Events.
   * Progressively renders tokens as they arrive while preserving full security and markdown rendering.
   */
  async sendMessageStream(
    conversationId: string,
    content: string,
    referencedResourceIds: string[] = [],
    onConversationUpdated?: (conv: IConversation) => void,
  ): Promise<void> {
    if (this.isGenerating(conversationId)) {
      throw new Error('This chat is already generating a response.');
    }

    if (this.activeGenerationsCount() >= 2) {
      const limitError = 'You can have up to 2 active chat generations at once. Please wait for one to finish.';
      this.setConversationError(conversationId, limitError);
      throw new Error(limitError);
    }

    this.clearError(conversationId);
    this.setConversationStatus(conversationId, 'generating');

    const tempUserMsg: IMessage = {
      id: 'temp-user-' + Date.now(),
      conversationId,
      userId: '',
      role: 'user' as any,
      content,
      referencedResourceIds,
      createdAt: new Date().toISOString(),
    };

    const tempAssistantMsg: IMessage = {
      id: 'temp-assistant-' + Date.now(),
      conversationId,
      userId: '',
      role: 'assistant' as any,
      content: '',
      referencedResourceIds,
      createdAt: new Date().toISOString(),
    };

    const currentMsgs = this.getCachedMessages(conversationId) || [];
    this.setMessages(conversationId, [...currentMsgs, tempUserMsg, tempAssistantMsg]);

    const token = localStorage.getItem('syntra_chat_access_token') || localStorage.getItem('enter_chat_access_token') || '';

    try {
      const response = await fetch(`${getApiBaseUrl()}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId,
          content,
          referencedResourceIds,
        }),
      });

      if (!response.ok) {
        let errorMsg = 'Failed to generate streaming response.';
        try {
          const errJson = await response.json();
          errorMsg = errJson.message || errJson.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream not supported by browser environment.');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          const eventMatch = block.match(/event:\s*(\w+)/);
          const dataMatch = block.match(/data:\s*(.+)/s);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1];
            try {
              const data = JSON.parse(dataMatch[1]);
              if (eventType === 'user_message' && data.id) {
                const msgs = this.getCachedMessages(conversationId) || [];
                const uIdx = msgs.findIndex((m) => m.id === tempUserMsg.id);
                if (uIdx !== -1) {
                  msgs[uIdx] = data;
                  this.setMessages(conversationId, [...msgs]);
                }
              } else if (eventType === 'token' && data.token) {
                accumulatedContent += data.token;
                const msgs = this.getCachedMessages(conversationId) || [];
                const aIdx = msgs.findIndex((m) => m.id === tempAssistantMsg.id || m.id === 'streaming-' + conversationId);
                if (aIdx !== -1) {
                  msgs[aIdx] = {
                    ...msgs[aIdx],
                    id: 'streaming-' + conversationId,
                    content: accumulatedContent,
                  };
                  this.setMessages(conversationId, [...msgs]);
                }
              } else if (eventType === 'metadata') {
                const msgs = this.getCachedMessages(conversationId) || [];
                const aIdx = msgs.findIndex((m) => m.id === tempAssistantMsg.id || m.id === 'streaming-' + conversationId);
                if (aIdx !== -1) {
                  msgs[aIdx] = {
                    ...msgs[aIdx],
                    citations: data.citations || [],
                    generatedChart: data.generatedChart,
                    generatedCharts: data.generatedCharts || (data.generatedChart ? [data.generatedChart] : undefined),
                    generatedTable: data.generatedTable,
                    pythonCode: data.pythonCode,
                    executionOutput: data.executionOutput,
                    downloadableFile: data.downloadableFile,
                  };
                  this.setMessages(conversationId, [...msgs]);
                }
              } else if (eventType === 'completed_message') {
                if (data.assistantMessage) {
                  const msgs = this.getCachedMessages(conversationId) || [];
                  const aIdx = msgs.findIndex((m) => m.id === tempAssistantMsg.id || m.id === 'streaming-' + conversationId);
                  if (aIdx !== -1) {
                    msgs[aIdx] = data.assistantMessage;
                  } else {
                    msgs.push(data.assistantMessage);
                  }
                  this.setMessages(conversationId, [...msgs]);
                }
                if (data.conversation && onConversationUpdated) {
                  onConversationUpdated(data.conversation);
                }
              } else if (eventType === 'error') {
                throw new Error(data.error || 'Streaming error');
              }
            } catch (err: any) {
              if (err.message && !err.message.includes('JSON')) {
                throw err;
              }
            }
          }
        }
      }

      this.setConversationStatus(conversationId, 'done');
    } catch (err: any) {
      const errMsg = err.message || 'Streaming failed. Please check backend connection.';
      this.setConversationError(conversationId, errMsg);
      this.setConversationStatus(conversationId, 'error');
      throw err;
    }
  }

  private setConversationStatus(conversationId: string, status: ChatGenerationStatus): void {
    const states = { ...this.generationStates() };
    states[conversationId] = status;
    this.generationStates.set(states);
  }

  private setConversationError(conversationId: string, error: string): void {
    const errors = { ...this.conversationErrors() };
    errors[conversationId] = error;
    this.conversationErrors.set(errors);
  }
}
