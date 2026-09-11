import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { MessagesService } from './messages/messages.service';
import { MessagesEventsService } from './messages/messages-events.service';
import { MessageEntity } from './messages/schemas/message.schema';
import { ConversationEntity } from './conversations/schemas/conversation.schema';
import { OwnershipService } from './permissions/services/ownership.service';
import { AiGatewayService } from './ai-gateway/ai-gateway.service';
import { MentionsService } from './mentions/mentions.service';
import { CollectionsService } from './collections/collections.service';
import { DocumentsService } from './documents/documents.service';
import { MessageShareEntity } from './messages/schemas/message-share.schema';
import { ConversationShareEntity } from './conversations/schemas/conversation-share.schema';
import { User } from './users/schemas/user.schema';
import { NotificationsService } from './notifications/notifications.service';
import { AuthThrottlerGuard } from './auth/guards/auth-throttler.guard';

describe('Load & Concurrency Benchmark Suite', () => {
  let messagesService: MessagesService;
  let authThrottler: AuthThrottlerGuard;
  let mockAiGateway: any;

  const mockUserId = new Types.ObjectId().toString();

  beforeEach(async () => {
    authThrottler = new AuthThrottlerGuard();

    const mockConversationModel = {
      findOne: jest.fn().mockImplementation((query) => {
        return Promise.resolve({
          _id: query._id,
          userId: new Types.ObjectId(mockUserId),
          title: 'Benchmark Conversation',
          attachedResourceIds: [],
          activeScope: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }),
      findById: jest.fn().mockImplementation((id) => {
        return Promise.resolve({
          _id: id,
          userId: new Types.ObjectId(mockUserId),
          title: 'Benchmark Conversation',
          attachedResourceIds: [],
          activeScope: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }),
      findByIdAndUpdate: jest.fn().mockImplementation((id, update) => {
        return Promise.resolve({
          _id: id,
          userId: new Types.ObjectId(mockUserId),
          title: 'Benchmark Conversation',
          attachedResourceIds: [],
          pinned: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...update.$set,
        });
      }),
    };

    const mockMessageModel: any = jest.fn().mockImplementation((dto) => ({
      ...dto,
      _id: new Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      save: jest.fn().mockResolvedValue({
        ...dto,
        _id: new Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    }));

    mockMessageModel.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      }),
    });

    const mockDocumentModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        exec: jest.fn().mockResolvedValue(null),
      }),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      }),
    };

    const mockDatasetModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        exec: jest.fn().mockResolvedValue(null),
      }),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      }),
    };

    const mockOwnershipService = {
      verifyOwnership: jest.fn().mockResolvedValue(true),
      validateUserResources: jest.fn().mockResolvedValue({ validDocumentIds: [], validDatasetIds: [] }),
    };

    mockAiGateway = {
      chat: jest.fn().mockImplementation(async () => {
        // Simulate realistic LLM gateway latency (20ms mock delay)
        await new Promise((r) => setTimeout(r, 20));
        return {
          answer: 'Benchmark synthetic response answer.',
          citations: [],
          metadata: { tokens: 80, model: 'gpt-4o', latencyMs: 20 },
        };
      }),
      generateTitle: jest.fn().mockResolvedValue('Benchmark Chat'),
    };

    const mockMentionsService = {
      searchMentions: jest.fn().mockResolvedValue({ results: [] }),
    };

    const mockCollectionsService = {
      getSharedMemory: jest.fn().mockResolvedValue(''),
      updateSharedMemory: jest.fn().mockResolvedValue(undefined),
    };

    const mockDocumentsService = {
      resolvePdfRequest: jest.fn().mockResolvedValue({ found: false }),
      canUserDownloadDocument: jest.fn().mockResolvedValue({ canDownload: false }),
    };

    const mockUserModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId(mockUserId),
            firstName: 'Benchmark',
            lastName: 'User',
            email: 'benchmark@example.com',
          }),
        }),
      }),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      }),
    };

    const mockMessageShareModel = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
        exec: jest.fn().mockResolvedValue([]),
      }),
      insertMany: jest.fn().mockResolvedValue([]),
    };

    const mockConversationShareModel = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    };

    const mockNotificationsService = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: getModelToken(MessageEntity.name), useValue: mockMessageModel },
        { provide: getModelToken(ConversationEntity.name), useValue: mockConversationModel },
        { provide: getModelToken(MessageShareEntity.name), useValue: mockMessageShareModel },
        { provide: getModelToken(ConversationShareEntity.name), useValue: mockConversationShareModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken('DocumentEntity'), useValue: mockDocumentModel },
        { provide: getModelToken('DatasetEntity'), useValue: mockDatasetModel },
        { provide: OwnershipService, useValue: mockOwnershipService },
        { provide: AiGatewayService, useValue: mockAiGateway },
        { provide: MentionsService, useValue: mockMentionsService },
        { provide: CollectionsService, useValue: mockCollectionsService },
        { provide: DocumentsService, useValue: mockDocumentsService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        {
          provide: MessagesEventsService,
          useValue: {
            broadcastNewMessage: jest.fn(),
            broadcastConversationUpdated: jest.fn(),
          },
        },
      ],
    }).compile();

    messagesService = module.get<MessagesService>(MessagesService);
  });

  describe('1. Concurrency Limits (Max 2 Active Chat Generations Per User)', () => {
    it('should allow up to 2 concurrent generations and reject the 3rd with 429 Too Many Requests', async () => {
      const convId1 = new Types.ObjectId().toString();
      const convId2 = new Types.ObjectId().toString();
      const convId3 = new Types.ObjectId().toString();

      // Delay AI Gateway response to keep requests concurrent
      let resolveChat1: any;
      let resolveChat2: any;
      mockAiGateway.chat
        .mockImplementationOnce(() => new Promise((res) => { resolveChat1 = res; }))
        .mockImplementationOnce(() => new Promise((res) => { resolveChat2 = res; }));

      // Launch 2 concurrent chat generations
      const p1 = messagesService.sendMessage(mockUserId, { conversationId: convId1, content: 'Chat 1' });
      const p2 = messagesService.sendMessage(mockUserId, { conversationId: convId2, content: 'Chat 2' });

      // Yield event loop to allow async findOne to register the sessions
      await new Promise((r) => setTimeout(r, 10));

      // Ensure active registry has 2 active chats
      expect(messagesService.getActiveGenerations(mockUserId)).toHaveLength(2);

      // Attempt 3rd concurrent chat generation for the same user
      await expect(
        messagesService.sendMessage(mockUserId, { conversationId: convId3, content: 'Chat 3' }),
      ).rejects.toThrow(HttpException);

      try {
        await messagesService.sendMessage(mockUserId, { conversationId: convId3, content: 'Chat 3' });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.message).toContain('maximum limit of 2 concurrent active chat generations');
      }

      // Finish pending chats
      resolveChat1({ answer: 'Response 1' });
      resolveChat2({ answer: 'Response 2' });
      await Promise.all([p1, p2]);

      // Active generations must be empty after completion
      expect(messagesService.getActiveGenerations(mockUserId)).toHaveLength(0);
    });

    it('should allow another generation immediately once an active generation finishes', async () => {
      const convId1 = new Types.ObjectId().toString();
      const convId2 = new Types.ObjectId().toString();

      await messagesService.sendMessage(mockUserId, { conversationId: convId1, content: 'Sequential 1' });
      expect(messagesService.getActiveGenerations(mockUserId)).toHaveLength(0);

      const res2 = await messagesService.sendMessage(mockUserId, { conversationId: convId2, content: 'Sequential 2' });
      expect(res2).toBeDefined();
      expect(messagesService.getActiveGenerations(mockUserId)).toHaveLength(0);
    });
  });

  describe('2. Rate Limiting Sliding-Window Benchmark (10 req/min per IP)', () => {
    function createMockContext(ip: string): ExecutionContext {
      const headers: Record<string, string> = {};
      return {
        switchToHttp: () => ({
          getRequest: () => ({
            ip,
            headers: {},
            connection: { remoteAddress: ip },
            socket: { remoteAddress: ip },
          }),
          getResponse: () => ({
            setHeader: (name: string, val: string) => {
              headers[name] = val;
            },
          }),
        }),
      } as any;
    }

    it('should allow 10 requests within 1 minute window and strictly block the 11th with 429', () => {
      const testIp = '192.168.1.105';
      const ctx = createMockContext(testIp);

      // First 10 requests succeed
      for (let i = 1; i <= 10; i++) {
        const allowed = authThrottler.canActivate(ctx);
        expect(allowed).toBe(true);
      }

      // 11th request throws 429 HttpException with Retry-After header
      expect(() => authThrottler.canActivate(ctx)).toThrow(HttpException);

      try {
        authThrottler.canActivate(ctx);
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.message).toContain('Too many authentication attempts');
      }
    });

    it('should track rate limits independently across different IP addresses', () => {
      const ipA = '10.0.0.1';
      const ipB = '10.0.0.2';
      const ctxA = createMockContext(ipA);
      const ctxB = createMockContext(ipB);

      // Max out ipA
      for (let i = 1; i <= 10; i++) {
        expect(authThrottler.canActivate(ctxA)).toBe(true);
      }
      expect(() => authThrottler.canActivate(ctxA)).toThrow(HttpException);

      // ipB should still be completely unthrottled
      for (let i = 1; i <= 10; i++) {
        expect(authThrottler.canActivate(ctxB)).toBe(true);
      }
      expect(() => authThrottler.canActivate(ctxB)).toThrow(HttpException);
    });
  });

  describe('3. Throughput & Latency Characteristics (Parallel Pipeline)', () => {
    it('should execute parallel DB write, history fetch, and scope resolution within nominal latency', async () => {
      const startTime = Date.now();
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        const convId = new Types.ObjectId().toString();
        await messagesService.sendMessage(mockUserId, {
          conversationId: convId,
          content: `Throughput benchmark iteration ${i}`,
        });
      }

      const totalDuration = Date.now() - startTime;
      const avgLatencyMs = totalDuration / iterations;

      // Average latency should be nominal
      expect(avgLatencyMs).toBeLessThan(100);
    });
  });
});
