import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, Subject, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { SoundService } from './sound.service';
import { PresenceService } from './presence.service';
import {
  IMessage,
  ISendMessageResponse,
  IConversation,
  ISharedConversationItem,
  IDirectConversationItem,
  IMention,
  IReplyToPreview,
} from '@enter-chat/shared-types';
import { getApiBaseUrl } from '../config/app-config';

export type ChatGenerationStatus = 'idle' | 'generating' | 'done' | 'error';

@Injectable({
  providedIn: 'root',
})
export class ChatStateService {
  private readonly soundService: any;
  private readonly presenceService: any;
  private eventSource: any = null;
  private currentActiveConversationId: string | null = null;

  constructor(
    private api: ApiService,
    soundService?: SoundService,
    presenceService?: PresenceService,
  ) {
    if (soundService) {
      this.soundService = soundService;
    } else {
      try {
        this.soundService = inject(SoundService, { optional: true }) || {
          playSendSound: () => {},
          playReceiveSound: () => {},
        };
      } catch {
        this.soundService = {
          playSendSound: () => {},
          playReceiveSound: () => {},
        };
      }
    }

    if (presenceService) {
      this.presenceService = presenceService;
    } else {
      try {
        this.presenceService = inject(PresenceService, { optional: true });
      } catch {
        this.presenceService = null;
      }
    }

    this.initRealtimeEvents();
  }

  // Shared conversations list signal
  readonly sharedConversations = signal<ISharedConversationItem[]>([]);

  // Direct conversations list signal
  readonly directConversations = signal<IDirectConversationItem[]>([]);

  // Per-conversation status: { [conversationId]: 'idle' | 'generating' | 'done' | 'error' }
  readonly generationStates = signal<Record<string, ChatGenerationStatus>>({});
  
  // Per-conversation errors: { [conversationId]: string }
  readonly conversationErrors = signal<Record<string, string>>({});

  // Realtime incoming message Subject for live chat subscribers
  readonly incomingMessage$ = new Subject<{ message: IMessage; conversationId: string }>();

  // Per-conversation in-memory messages cache: { [conversationId]: IMessage[] }
  readonly messagesByConversation = signal<Record<string, IMessage[]>>({});

  // Active generation count computed signal
  readonly activeGenerations = computed(() =>
    Object.entries(this.generationStates())
      .filter(([_, status]) => status === 'generating')
      .map(([id]) => id),
  );

  readonly activeGenerationsCount = computed(() => this.activeGenerations().length);

  setActiveConversationId(id: string | null): void {
    this.currentActiveConversationId = id;
    if (id) {
      this.markDirectConversationRead(id);
    }
  }

  getActiveConversationId(): string | null {
    return this.currentActiveConversationId;
  }

  /**
   * Initializes SSE Real-Time event stream connection with the backend.
   * Auto-reconnects on disconnection to ensure zero message loss.
   */
  initRealtimeEvents(): void {
    const token = localStorage.getItem('syntra_chat_access_token') || localStorage.getItem('enter_chat_access_token');
    if (!token) return;

    // Connect via fetch readable stream with Bearer header
    this.startSseStream(token);
  }

  private async startSseStream(token: string): Promise<void> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/messages/events`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
      });

      if (!response.ok) {
        setTimeout(() => this.initRealtimeEvents(), 5000);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

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
              if (eventType === 'new_message' && data.message) {
                this.handleIncomingRealtimeMessage(data.message, data.conversationId);
              } else if (eventType === 'conversation_updated') {
                this.loadDirectConversations();
                this.loadSharedConversations();
              } else if (eventType === 'presence_update' && data.userId) {
                this.handlePresenceUpdate(data.userId, data.isOnline, data.lastSeenAt);
              }
            } catch {}
          }
        }
      }

      // Reconnect if stream closes
      setTimeout(() => this.initRealtimeEvents(), 3000);
    } catch {
      setTimeout(() => this.initRealtimeEvents(), 5000);
    }
  }

  private handlePresenceUpdate(userId: string, isOnline: boolean, lastSeenAt?: string): void {
    if (this.presenceService && typeof this.presenceService.updateUserPresence === 'function') {
      this.presenceService.updateUserPresence(userId, isOnline, lastSeenAt);
    }

    // Immediately update partner in direct conversations signal
    const directList = this.directConversations().map((item) => {
      if (item.partner && (item.partner.id === userId || (item.partner as any)._id === userId)) {
        return {
          ...item,
          partner: {
            ...item.partner,
            presence: {
              ...item.partner.presence,
              userId,
              isOnline,
              lastSeenAt: lastSeenAt || item.partner.presence?.lastSeenAt,
              lastSeenRelative: isOnline ? 'Active now' : 'Just now',
            },
          },
        };
      }
      return item;
    });
    this.directConversations.set(directList);

    // Immediately update owner in shared conversations signal
    const sharedList = this.sharedConversations().map((item) => {
      if (item.owner && (item.owner.id === userId || (item.owner as any)._id === userId)) {
        return {
          ...item,
          owner: {
            ...item.owner,
            presence: {
              ...item.owner.presence,
              userId,
              isOnline,
              lastSeenAt: lastSeenAt || item.owner.presence?.lastSeenAt,
              lastSeenRelative: isOnline ? 'Active now' : 'Just now',
            },
          },
        };
      }
      return item;
    });
    this.sharedConversations.set(sharedList);
  }

  private handleIncomingRealtimeMessage(msg: IMessage, convId: string): void {
    const rawUser = localStorage.getItem('syntra_chat_user') || localStorage.getItem('enter_chat_user');
    let currentUserId = '';
    try {
      if (rawUser) {
        const u = JSON.parse(rawUser);
        currentUserId = u.id || u._id;
      }
    } catch {}

    const isOwn = msg.userId === currentUserId || msg.author?.id === currentUserId;

    // 1. Update messages list in cache
    const currentMsgs = this.getCachedMessages(convId) || [];
    const exists = currentMsgs.some(
      (m) => m.id === msg.id || (m.id.startsWith('temp-') && m.role === msg.role && m.content === msg.content)
    );

    if (!exists) {
      this.setMessages(convId, [...currentMsgs, msg]);
    } else {
      // Reconcile optimistic temp message
      const reconciled = currentMsgs.map((m) =>
        m.id.startsWith('temp-') && m.role === msg.role && m.content === msg.content ? msg : m
      );
      this.setMessages(convId, reconciled);
    }

    // 2. Emit to incomingMessage$ Subject for active chat view component to handle auto-scrolling / unread pill
    this.incomingMessage$.next({ message: msg, conversationId: convId });

    // 3. Play sound & update unread counts and previews
    const senderName = msg.role === 'assistant'
      ? 'Syntra AI'
      : (msg.author ? `${msg.author.firstName || ''} ${msg.author.lastName || ''}`.trim() : 'Colleague');

    if (!isOwn) {
      this.soundService.playReceiveSound();

      // If this is NOT the currently active open conversation, increment unread count in direct list
      if (this.currentActiveConversationId !== convId) {
        const directList = this.directConversations().map((item) => {
          if (item.id === convId) {
            return {
              ...item,
              unreadCount: (item.unreadCount || 0) + 1,
              lastMessage: {
                content: msg.content,
                senderId: msg.userId,
                senderName,
                createdAt: msg.createdAt,
                role: msg.role,
                isAi: msg.role === 'assistant',
              },
            };
          }
          return item;
        });
        this.directConversations.set(directList);
      } else {
        // Active conversation, mark read
        this.markDirectConversationRead(convId);
      }
    } else {
      // Own message updated
      const directList = this.directConversations().map((item) => {
        if (item.id === convId) {
          return {
            ...item,
            lastMessage: {
              content: msg.content,
              senderId: msg.userId,
              senderName,
              createdAt: msg.createdAt,
              role: msg.role,
              isAi: msg.role === 'assistant',
            },
          };
        }
        return item;
      });
      this.directConversations.set(directList);
    }

    // Also update shared conversations lastMessage if this is a shared conversation
    const sharedList = this.sharedConversations().map((item) => {
      if (item.id === convId) {
        return {
          ...item,
          lastMessage: {
            content: msg.content,
            senderId: msg.userId,
            senderName,
            createdAt: msg.createdAt,
            role: msg.role,
            isAi: msg.role === 'assistant',
          },
        };
      }
      return item;
    });
    this.sharedConversations.set(sharedList);
  }

  /**
   * Load shared conversations from backend
   */
  loadSharedConversations(): void {
    if (typeof this.api.getSharedConversations !== 'function') return;
    this.api.getSharedConversations().subscribe({
      next: (list) => {
        this.sharedConversations.set(list);
      },
      error: () => {},
    });
  }

  /**
   * Load direct conversations from backend
   */
  loadDirectConversations(): void {
    if (typeof this.api.getDirectConversations !== 'function') return;
    this.api.getDirectConversations().subscribe({
      next: (list) => {
        this.directConversations.set(list);
      },
      error: () => {},
    });
  }

  /**
   * Mark direct conversation as read in state and backend
   */
  markDirectConversationRead(conversationId: string): void {
    const list = this.directConversations().map((item) => {
      if (item.id === conversationId) {
        return { ...item, unreadCount: 0 };
      }
      return item;
    });
    this.directConversations.set(list);

    if (typeof this.api.markDirectConversationAsRead === 'function') {
      this.api.markDirectConversationAsRead(conversationId).subscribe({
        error: () => {},
      });
    }
  }

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
   * Send a Direct Human-to-Human Message.
   * Optimistically renders the message on the sender's right side,
   * plays the subtle send sound, and persists without any AI processing loading flags.
   */
  sendDirectMessage(
    conversationId: string,
    content: string,
    mentions: IMention[] = [],
    currentUser?: any,
    downloadableFile?: any,
    replyTo?: IReplyToPreview,
    replyToMessageId?: string,
  ): Observable<ISendMessageResponse> {
    const tempId = 'temp-dm-' + Date.now();
    const tempUserMsg: IMessage = {
      id: tempId,
      conversationId,
      userId: currentUser?.id || currentUser?._id || '',
      author: currentUser ? {
        id: currentUser.id || currentUser._id,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        email: currentUser.email,
        role: currentUser.role,
      } : undefined,
      role: 'user' as any,
      content,
      mentions,
      referencedResourceIds: [],
      downloadableFile,
      replyToMessageId,
      replyTo,
      createdAt: new Date().toISOString(),
    };

    // Push optimistic message
    const currentMsgs = this.getCachedMessages(conversationId) || [];
    this.setMessages(conversationId, [...currentMsgs, tempUserMsg]);

    // Play subtle send sound
    this.soundService.playSendSound();

    return this.api
      .sendMessage({
        conversationId,
        content,
        mentions,
        isDirect: true,
        downloadableFile,
        replyTo,
        replyToMessageId,
      })
      .pipe(
        tap((res) => {
          const msgs = this.getCachedMessages(conversationId) || [];
          const idx = msgs.findIndex((m) => m.id === tempId);
          const updated = [...msgs];
          if (res.userMessage) {
            if (idx !== -1) {
              updated[idx] = res.userMessage;
            } else if (!updated.some((m) => m.id === res.userMessage.id)) {
              updated.push(res.userMessage);
            }
          }
          if (res.assistantMessage && !updated.some((m) => m.id === res.assistantMessage!.id)) {
            updated.push(res.assistantMessage);
          }
          this.setMessages(conversationId, updated);
          this.loadDirectConversations();
        }),
        catchError((err) => {
          // Remove temp message if failed
          const msgs = (this.getCachedMessages(conversationId) || []).filter((m) => m.id !== tempId);
          this.setMessages(conversationId, msgs);
          return throwError(() => err);
        }),
      );
  }

  /**
   * Dispatch an AI message generation request (e.g. general chat or @AI invocation).
   */
  sendMessage(
    conversationId: string,
    content: string,
    referencedResourceIds: string[] = [],
    onConversationUpdated?: (conv: IConversation) => void,
    temporary: boolean = false,
  ): Observable<ISendMessageResponse> {
    if (this.isGenerating(conversationId)) {
      return throwError(() => new Error('This chat is already generating a response.'));
    }

    if (this.activeGenerationsCount() >= 2) {
      const limitError = 'You can have up to 2 active chat generations at once. Please wait for one to finish.';
      this.setConversationError(conversationId, limitError);
      return throwError(() => new Error(limitError));
    }

    this.clearError(conversationId);
    this.setConversationStatus(conversationId, 'generating');

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
    this.soundService.playSendSound();

    return this.api
      .sendMessage({
        conversationId,
        content,
        referencedResourceIds,
        temporary,
      })
      .pipe(
        tap((res) => {
          const msgs = this.getCachedMessages(conversationId) || [];
          const idx = msgs.findIndex((m) => m.id === tempUserMsg.id);
          const updatedMsgs = [...msgs];
          if (res.userMessage) {
            if (idx !== -1) {
              updatedMsgs[idx] = res.userMessage;
            } else {
              updatedMsgs.push(res.userMessage);
            }
          }
          if (res.assistantMessage) {
            updatedMsgs.push(res.assistantMessage);
            this.soundService.playReceiveSound();
          }
          this.setMessages(conversationId, updatedMsgs);
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
   */
  async sendMessageStream(
    conversationId: string,
    content: string,
    referencedResourceIds: string[] = [],
    onConversationUpdated?: (conv: IConversation) => void,
    temporary: boolean = false,
    replyTo?: IReplyToPreview,
    replyToMessageId?: string,
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
      replyToMessageId,
      replyTo,
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
    this.soundService.playSendSound();

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
          temporary,
          replyTo,
          replyToMessageId,
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
                  this.soundService.playReceiveSound();
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

      const finalMsgs = (this.getCachedMessages(conversationId) || []).filter(
        (m) => m.id !== tempAssistantMsg.id || (m.content && m.content.length > 0)
      );
      this.setMessages(conversationId, finalMsgs);
      this.loadDirectConversations();

      this.setConversationStatus(conversationId, 'done');
    } catch (err: any) {
      const finalMsgs = (this.getCachedMessages(conversationId) || []).filter(
        (m) => m.id !== tempAssistantMsg.id || (m.content && m.content.length > 0)
      );
      this.setMessages(conversationId, finalMsgs);

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
