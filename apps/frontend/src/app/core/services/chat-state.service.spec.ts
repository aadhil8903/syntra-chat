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
});
