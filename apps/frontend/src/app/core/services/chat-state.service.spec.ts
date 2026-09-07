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
});
