import { ChatStateService } from './chat-state.service';
import { IMessage, MessageRole } from '@enter-chat/shared-types';

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
});
