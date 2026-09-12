import { ChatStateService } from './chat-state.service';
import { IMessage, MessageRole } from '@enter-chat/shared-types';
import { of } from 'rxjs';

describe('ChatStateService (Streaming & Responsiveness)', () => {
  let service: ChatStateService;
  let apiSpy: any;

  beforeEach(() => {
    apiSpy = {
      sendMessage: jest.fn(),
    };
    service = new ChatStateService(apiSpy);
  });

  it('should initialize with empty active generations', () => {
    expect(service.activeGenerationsCount()).toBe(0);
    expect(service.isGenerating('conv-1')).toBe(false);
  });

  it('should track generating state and active generations count accurately', () => {
    (service as any).setConversationStatus('conv-1', 'generating');
    expect(service.isGenerating('conv-1')).toBe(true);
    expect(service.activeGenerationsCount()).toBe(1);

    (service as any).setConversationStatus('conv-2', 'generating');
    expect(service.activeGenerationsCount()).toBe(2);

    (service as any).setConversationStatus('conv-1', 'done');
    expect(service.isGenerating('conv-1')).toBe(false);
    expect(service.activeGenerationsCount()).toBe(1);
  });

  it('should prevent initiating more than 2 concurrent generations', async () => {
    (service as any).setConversationStatus('conv-1', 'generating');
    (service as any).setConversationStatus('conv-2', 'generating');

    await expect(
      service.sendMessageStream('conv-3', 'test message')
    ).rejects.toThrow('You can have up to 2 active chat generations at once.');
  });

  it('should manage in-memory message caching across conversations', () => {
    const mockMessages: IMessage[] = [
      {
        id: 'msg-1',
        conversationId: 'conv-100',
        userId: 'user-1',
        role: MessageRole.USER,
        content: 'Hello AI',
        referencedResourceIds: [],
        createdAt: new Date().toISOString(),
      },
    ];

    service.setMessages('conv-100', mockMessages);
    expect(service.getCachedMessages('conv-100')).toEqual(mockMessages);
    expect(service.getCachedMessages('conv-999')).toBeNull();

    service.deleteConversationState('conv-100');
    expect(service.getCachedMessages('conv-100')).toBeNull();
  });

  it('should send temporary=true and valid payload to /messages/stream endpoint', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                'event: user_message\ndata: {"id":"u1"}\n\nevent: text_delta\ndata: {"delta":"Hello!"}\n\nevent: completed_message\ndata: {"assistantMessage":{"id":"a1","content":"Hello!"}}\n\n'
              ),
            })
            .mockResolvedValueOnce({ done: true }),
        }),
      },
    });
    (global as any).fetch = mockFetch;

    await service.sendMessageStream('temp-session-123', 'hey?', [], undefined, true);

    expect(mockFetch).toHaveBeenCalled();
    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
    expect(calledUrl).toContain('/messages/stream');
    expect(calledOptions.method).toBe('POST');
    const parsedBody = JSON.parse(calledOptions.body);
    expect(parsedBody.conversationId).toBe('temp-session-123');
    expect(parsedBody.content).toBe('hey?');
    expect(parsedBody.temporary).toBe(true);
  });

  it('should extract error message on non-ok HTTP response', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: jest.fn().mockResolvedValue({ message: 'Conversation not found' }),
    });
    (global as any).fetch = mockFetch;

    await expect(
      service.sendMessageStream('temp-session-456', 'hey?', [], undefined, true)
    ).rejects.toThrow('Conversation not found');

    expect(service.getError('temp-session-456')).toBe('Conversation not found');
  });

  it('should emit incomingMessage$ and reconcile optimistic messages on incoming realtime message', (done) => {
    service.setMessages('conv-realtime-1', [
      {
        id: 'temp-12345',
        conversationId: 'conv-realtime-1',
        userId: 'user-a',
        role: MessageRole.USER,
        content: 'Collaborative test message',
        createdAt: new Date().toISOString(),
      },
    ]);

    const realServerMsg: IMessage = {
      id: 'real-srv-msg-999',
      conversationId: 'conv-realtime-1',
      userId: 'user-a',
      role: MessageRole.USER,
      content: 'Collaborative test message',
      createdAt: new Date().toISOString(),
    };

    service.incomingMessage$.subscribe(({ message, conversationId }) => {
      expect(conversationId).toBe('conv-realtime-1');
      expect(message.id).toBe('real-srv-msg-999');

      // Check cache reconciliation
      const cached = service.getCachedMessages('conv-realtime-1')!;
      expect(cached.length).toBe(1);
      expect(cached[0].id).toBe('real-srv-msg-999');
      done();
    });

    (service as any).handleIncomingRealtimeMessage(realServerMsg, 'conv-realtime-1');
  });

  it('should update unreadCount and lastMessage for non-active direct conversations', () => {
    service.setActiveConversationId('conv-active');
    service.directConversations.set([
      {
        id: 'conv-dm-other',
        title: 'Jane Doe',
        userId: 'user-jane',
        unreadCount: 0,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    const incomingMsg: IMessage = {
      id: 'msg-incoming-1',
      conversationId: 'conv-dm-other',
      userId: 'user-jane',
      role: MessageRole.USER,
      content: 'Hey colleague!',
      author: {
        id: 'user-jane',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      },
      createdAt: new Date().toISOString(),
    };

    (service as any).handleIncomingRealtimeMessage(incomingMsg, 'conv-dm-other');

    const updatedList = service.directConversations();
    expect(updatedList[0].unreadCount).toBe(1);
    expect(updatedList[0].lastMessage?.content).toBe('Hey colleague!');
    expect(updatedList[0].lastMessage?.senderName).toBe('Jane Doe');
  });

  describe('Direct conversation read handling', () => {
    beforeEach(() => {
      apiSpy.markDirectConversationAsRead = jest.fn().mockReturnValue({
        subscribe: jest.fn(),
      });
      service.directConversations.set([
        {
          id: 'dm-101',
          title: 'Alice',
          userId: 'user-alice',
          unreadCount: 3,
          createdAt: '',
          updatedAt: '',
        },
      ]);
    });

    it('should NOT call api.markDirectConversationAsRead when selecting a non-direct / AI conversation', () => {
      service.setActiveConversationId('ai-conv-999');
      expect(service.getActiveConversationId()).toBe('ai-conv-999');
      expect(apiSpy.markDirectConversationAsRead).not.toHaveBeenCalled();
      expect(service.directConversations()[0].unreadCount).toBe(3);
    });

    it('should call api.markDirectConversationAsRead and reset unreadCount when selecting a direct conversation', () => {
      service.setActiveConversationId('dm-101');
      expect(service.getActiveConversationId()).toBe('dm-101');
      expect(apiSpy.markDirectConversationAsRead).toHaveBeenCalledWith('dm-101');
      expect(service.directConversations()[0].unreadCount).toBe(0);
    });

    it('should NOT make an HTTP request or update state when markDirectConversationRead is invoked with an unknown ID', () => {
      service.markDirectConversationRead('unknown-or-ai-id');
      expect(apiSpy.markDirectConversationAsRead).not.toHaveBeenCalled();
      expect(service.directConversations()[0].unreadCount).toBe(3);
    });
  });

  describe('AI Message Streaming & Realtime Reconciliation', () => {
    it('Case A: should keep exactly ONE assistant message when SSE new_message arrives BEFORE completed_message', () => {
      const convId = 'conv-race-a';
      const userMsg: IMessage = {
        id: 'user-msg-1',
        conversationId: convId,
        userId: 'u1',
        role: MessageRole.USER,
        content: 'Tell me a joke',
        createdAt: new Date().toISOString(),
      };
      const streamingPlaceholder: IMessage = {
        id: 'streaming-' + convId,
        conversationId: convId,
        userId: '',
        role: MessageRole.ASSISTANT,
        content: 'Why did the chicken...',
        createdAt: new Date().toISOString(),
      };
      service.setMessages(convId, [userMsg, streamingPlaceholder]);

      const finalAsstMsg: IMessage = {
        id: 'asst-mongo-id-1',
        conversationId: convId,
        userId: 'syntra-ai',
        role: MessageRole.ASSISTANT,
        content: 'Why did the chicken cross the road? To get to the other side!',
        createdAt: new Date().toISOString(),
      };

      // 1. SSE new_message arrives first
      (service as any).handleIncomingRealtimeMessage(finalAsstMsg, convId);

      const afterSse = service.getCachedMessages(convId)!;
      expect(afterSse.length).toBe(2);
      expect(afterSse[1].id).toBe('asst-mongo-id-1');
      expect(afterSse[1].content).toBe('Why did the chicken cross the road? To get to the other side!');

      // 2. HTTP stream completed_message arrives second
      const msgs = service.getCachedMessages(convId) || [];
      const existingIdx = msgs.findIndex((m) => m.id === finalAsstMsg.id);
      const placeholderIdx = msgs.findIndex((m) => m.id === 'streaming-' + convId);
      if (placeholderIdx !== -1) {
        msgs[placeholderIdx] = finalAsstMsg;
        const deduplicated = msgs.filter((m, idx) => idx === placeholderIdx || m.id !== finalAsstMsg.id);
        service.setMessages(convId, deduplicated);
      } else if (existingIdx !== -1) {
        msgs[existingIdx] = finalAsstMsg;
        service.setMessages(convId, [...msgs]);
      }

      const finalResult = service.getCachedMessages(convId)!;
      expect(finalResult.length).toBe(2);
      expect(finalResult.filter((m) => m.role === MessageRole.ASSISTANT).length).toBe(1);
      expect(finalResult[1].id).toBe('asst-mongo-id-1');
    });

    it('Case B: should keep exactly ONE assistant message when completed_message arrives BEFORE SSE new_message', () => {
      const convId = 'conv-race-b';
      const userMsg: IMessage = {
        id: 'user-msg-2',
        conversationId: convId,
        userId: 'u1',
        role: MessageRole.USER,
        content: 'Explain RAG',
        createdAt: new Date().toISOString(),
      };
      const streamingPlaceholder: IMessage = {
        id: 'streaming-' + convId,
        conversationId: convId,
        userId: '',
        role: MessageRole.ASSISTANT,
        content: 'RAG stands for...',
        createdAt: new Date().toISOString(),
      };
      service.setMessages(convId, [userMsg, streamingPlaceholder]);

      const finalAsstMsg: IMessage = {
        id: 'asst-mongo-id-2',
        conversationId: convId,
        userId: 'syntra-ai',
        role: MessageRole.ASSISTANT,
        content: 'RAG stands for Retrieval-Augmented Generation.',
        createdAt: new Date().toISOString(),
      };

      // 1. completed_message arrives first and swaps placeholder
      const msgs = service.getCachedMessages(convId) || [];
      const placeholderIdx = msgs.findIndex((m) => m.id === 'streaming-' + convId);
      if (placeholderIdx !== -1) {
        msgs[placeholderIdx] = finalAsstMsg;
        service.setMessages(convId, [...msgs]);
      }

      const afterCompleted = service.getCachedMessages(convId)!;
      expect(afterCompleted.length).toBe(2);
      expect(afterCompleted[1].id).toBe('asst-mongo-id-2');

      // 2. SSE new_message arrives second
      (service as any).handleIncomingRealtimeMessage(finalAsstMsg, convId);

      const finalResult = service.getCachedMessages(convId)!;
      expect(finalResult.length).toBe(2);
      expect(finalResult.filter((m) => m.role === MessageRole.ASSISTANT).length).toBe(1);
      expect(finalResult[1].id).toBe('asst-mongo-id-2');
    });

    it('Case C: should replace streaming placeholder when completed_message arrives without SSE', () => {
      const convId = 'conv-race-c';
      const streamingPlaceholder: IMessage = {
        id: 'streaming-' + convId,
        conversationId: convId,
        userId: '',
        role: MessageRole.ASSISTANT,
        content: 'Streaming chunk...',
        createdAt: new Date().toISOString(),
      };
      service.setMessages(convId, [streamingPlaceholder]);

      const finalAsstMsg: IMessage = {
        id: 'asst-mongo-id-3',
        conversationId: convId,
        userId: 'syntra-ai',
        role: MessageRole.ASSISTANT,
        content: 'Full complete chunk',
        createdAt: new Date().toISOString(),
      };

      const msgs = service.getCachedMessages(convId) || [];
      const placeholderIdx = msgs.findIndex((m) => m.id === 'streaming-' + convId);
      msgs[placeholderIdx] = finalAsstMsg;
      service.setMessages(convId, [...msgs]);

      const cached = service.getCachedMessages(convId)!;
      expect(cached.length).toBe(1);
      expect(cached[0].id).toBe('asst-mongo-id-3');
    });

    it('Case D: should reconcile streaming placeholder when SSE new_message arrives alone', () => {
      const convId = 'conv-race-d';
      const streamingPlaceholder: IMessage = {
        id: 'streaming-' + convId,
        conversationId: convId,
        userId: '',
        role: MessageRole.ASSISTANT,
        content: 'Partial live text...',
        createdAt: new Date().toISOString(),
      };
      service.setMessages(convId, [streamingPlaceholder]);

      const finalAsstMsg: IMessage = {
        id: 'asst-mongo-id-4',
        conversationId: convId,
        userId: 'syntra-ai',
        role: MessageRole.ASSISTANT,
        content: 'Partial live text completed',
        createdAt: new Date().toISOString(),
      };

      (service as any).handleIncomingRealtimeMessage(finalAsstMsg, convId);

      const cached = service.getCachedMessages(convId)!;
      expect(cached.length).toBe(1);
      expect(cached[0].id).toBe('asst-mongo-id-4');
      expect(cached[0].content).toBe('Partial live text completed');
    });

    it('Case E: should preserve BOTH legitimate assistant messages when they have IDENTICAL content', () => {
      const convId = 'conv-identical-content';
      const priorAsstMsg: IMessage = {
        id: 'asst-mongo-id-100',
        conversationId: convId,
        userId: 'syntra-ai',
        role: MessageRole.ASSISTANT,
        content: 'Yes, that is correct.',
        createdAt: new Date().toISOString(),
      };
      service.setMessages(convId, [priorAsstMsg]);

      const newAsstMsg: IMessage = {
        id: 'asst-mongo-id-101',
        conversationId: convId,
        userId: 'syntra-ai',
        role: MessageRole.ASSISTANT,
        content: 'Yes, that is correct.',
        createdAt: new Date().toISOString(),
      };

      // Incoming new assistant message with identical text but different ID (and no streaming placeholder)
      (service as any).handleIncomingRealtimeMessage(newAsstMsg, convId);

      const cached = service.getCachedMessages(convId)!;
      expect(cached.length).toBe(2);
      expect(cached[0].id).toBe('asst-mongo-id-100');
      expect(cached[1].id).toBe('asst-mongo-id-101');
    });

    it('Case F: should preserve BOTH legitimate assistant messages when they have different IDs and roles', () => {
      const convId = 'conv-different-ids';
      const firstMsg: IMessage = {
        id: 'asst-first-1',
        conversationId: convId,
        userId: 'syntra-ai',
        role: MessageRole.ASSISTANT,
        content: 'First answer',
        createdAt: new Date().toISOString(),
      };
      service.setMessages(convId, [firstMsg]);

      const secondMsg: IMessage = {
        id: 'asst-second-2',
        conversationId: convId,
        userId: 'syntra-ai',
        role: MessageRole.ASSISTANT,
        content: 'Second answer',
        createdAt: new Date().toISOString(),
      };

      (service as any).handleIncomingRealtimeMessage(secondMsg, convId);

      const cached = service.getCachedMessages(convId)!;
      expect(cached.length).toBe(2);
      expect(cached[0].id).toBe('asst-first-1');
      expect(cached[1].id).toBe('asst-second-2');
    });

    it('Case G: should correctly append direct realtime message from another user', () => {
      const convId = 'conv-peer-chat';
      const initialMsg: IMessage = {
        id: 'msg-local-1',
        conversationId: convId,
        userId: 'user-me',
        role: MessageRole.USER,
        content: 'Hi colleague',
        createdAt: new Date().toISOString(),
      };
      service.setMessages(convId, [initialMsg]);

      const peerMsg: IMessage = {
        id: 'msg-peer-2',
        conversationId: convId,
        userId: 'user-colleague',
        role: MessageRole.USER,
        content: 'Hello! I am reviewing the report now.',
        author: {
          id: 'user-colleague',
          firstName: 'Sarah',
          lastName: 'Connor',
          email: 'sarah@example.com',
        },
        createdAt: new Date().toISOString(),
      };

      (service as any).handleIncomingRealtimeMessage(peerMsg, convId);

      const cached = service.getCachedMessages(convId)!;
      expect(cached.length).toBe(2);
      expect(cached[1].id).toBe('msg-peer-2');
      expect(cached[1].content).toBe('Hello! I am reviewing the report now.');
    });

    it('Case H: should not duplicate assistant message in non-streaming sendMessage when already present', (done) => {
      const convId = 'conv-non-stream';
      const existingAsst: IMessage = {
        id: 'asst-non-stream-1',
        conversationId: convId,
        userId: 'syntra-ai',
        role: MessageRole.ASSISTANT,
        content: 'Non-streaming response',
        createdAt: new Date().toISOString(),
      };
      service.setMessages(convId, [existingAsst]);

      const mockResponse = {
        userMessage: {
          id: 'u-msg-1',
          conversationId: convId,
          userId: 'u1',
          role: MessageRole.USER,
          content: 'Hello',
          createdAt: new Date().toISOString(),
        },
        assistantMessage: existingAsst,
      };

      apiSpy.sendMessage = jest.fn().mockReturnValue(of(mockResponse));

      service.sendMessage(convId, 'Hello').subscribe(() => {
        const cached = service.getCachedMessages(convId)!;
        const asstCount = cached.filter((m) => m.id === 'asst-non-stream-1').length;
        expect(asstCount).toBe(1);
        done();
      });
    });
  });
});
