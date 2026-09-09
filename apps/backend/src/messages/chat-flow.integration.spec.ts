import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessageEntity } from './schemas/message.schema';
import { ConversationEntity } from '../conversations/schemas/conversation.schema';
import { OwnershipService } from '../permissions/services/ownership.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { MentionsService } from '../mentions/mentions.service';
import { CollectionsService } from '../collections/collections.service';
import { DocumentsService } from '../documents/documents.service';
import { MessageRole, UserRole } from '@enter-chat/shared-types';

describe('ChatFlow Integration — Controller -> Service -> Gateway -> DB Pipeline', () => {
  let controller: MessagesController;
  let service: MessagesService;
  let aiGatewayService: AiGatewayService;

  const mockUserId = new Types.ObjectId().toString();
  const mockConvId = new Types.ObjectId().toString();
  const mockDocId = new Types.ObjectId().toString();

  let conversationState: any;
  let messagesStore: any[];

  beforeEach(async () => {
    messagesStore = [];
    conversationState = {
      _id: new Types.ObjectId(mockConvId),
      userId: new Types.ObjectId(mockUserId),
      title: 'Initial Title',
      attachedResourceIds: [mockDocId],
      activeScope: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockConversationModel = {
      findOne: jest.fn().mockImplementation((query) => {
        if (
          query._id.toString() === mockConvId &&
          query.userId.toString() === mockUserId
        ) {
          return Promise.resolve(conversationState);
        }
        return Promise.resolve(null);
      }),
      findByIdAndUpdate: jest.fn().mockImplementation((id, update) => {
        if (update.$set) {
          Object.assign(conversationState, update.$set);
        }
        return Promise.resolve(conversationState);
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    const mockMessageModel: any = jest.fn().mockImplementation((dto) => {
      const msg = {
        ...dto,
        _id: new Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        save: jest.fn().mockImplementation(function () {
          messagesStore.push(this);
          return Promise.resolve(this);
        }),
      };
      return msg;
    });

    mockMessageModel.find = jest.fn().mockImplementation(() => ({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([...messagesStore]),
        }),
      }),
    }));

    mockMessageModel.create = jest.fn().mockImplementation((dto) => {
      const msg = {
        ...dto,
        _id: new Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      messagesStore.push(msg);
      return Promise.resolve(msg);
    });

    const mockDocumentModel = {
      findById: jest.fn().mockImplementation((id) => {
        const idStr = id?.toString?.() || id;
        if (idStr === mockDocId) {
          return {
            select: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                _id: new Types.ObjectId(mockDocId),
                originalName: '01_employee_handbook.pdf',
                title: '01_employee_handbook.pdf',
              }),
            }),
            exec: jest.fn().mockResolvedValue({
              _id: new Types.ObjectId(mockDocId),
              originalName: '01_employee_handbook.pdf',
              title: '01_employee_handbook.pdf',
            }),
          };
        }
        return {
          select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
          exec: jest.fn().mockResolvedValue(null),
        };
      }),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
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
      validateUserResources: jest.fn().mockImplementation((userId, resourceIds) => {
        return Promise.resolve({
          validDocumentIds: resourceIds.filter((id: string) => !id.startsWith('folder:')),
          validDatasetIds: [],
        });
      }),
    };

    const mockAiGatewayService = {
      chat: jest.fn().mockResolvedValue({
        answer: 'Here is the company leave policy according to the handbook.',
        citations: [{ source: '01_employee_handbook.pdf', page: 3, text: 'Annual leave is 25 days.' }],
        metadata: {
          intent: 'document_rag',
          grounded: true,
          model: 'gpt-4o',
          tokens: 150,
        },
      }),
      streamChat: jest.fn().mockImplementation(async function* () {
        yield { type: 'chunk', content: 'Here is ' };
        yield { type: 'chunk', content: 'the policy.' };
        yield {
          type: 'done',
          citations: [{ source: '01_employee_handbook.pdf', page: 3 }],
          metadata: { intent: 'document_rag', grounded: true },
        };
      }),
      generateTitle: jest.fn().mockResolvedValue('Employee Leave Policy'),
      transcribeAudio: jest.fn().mockResolvedValue({ transcript: 'test transcript' }),
    };

    const mockMentionsService = {
      searchMentions: jest.fn().mockImplementation((userId, query) => {
        if (query.includes('employee_handbook')) {
          return Promise.resolve({
            results: [{ id: mockDocId, name: '01_employee_handbook.pdf', type: 'document' }],
          });
        }
        return Promise.resolve({ results: [] });
      }),
    };

    const mockCollectionsService = {
      getSharedMemory: jest.fn().mockResolvedValue('Department memory: HR guidelines 2026'),
      updateSharedMemory: jest.fn().mockResolvedValue(undefined),
    };

    const mockDocumentsService = {
      resolvePdfRequest: jest.fn().mockResolvedValue({ found: false }),
      canUserDownloadDocument: jest.fn().mockResolvedValue({ canDownload: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [
        MessagesService,
        { provide: getModelToken(MessageEntity.name), useValue: mockMessageModel },
        { provide: getModelToken(ConversationEntity.name), useValue: mockConversationModel },
        { provide: getModelToken('DocumentEntity'), useValue: mockDocumentModel },
        { provide: getModelToken('DatasetEntity'), useValue: mockDatasetModel },
        { provide: OwnershipService, useValue: mockOwnershipService },
        { provide: AiGatewayService, useValue: mockAiGatewayService },
        { provide: MentionsService, useValue: mockMentionsService },
        { provide: CollectionsService, useValue: mockCollectionsService },
        { provide: DocumentsService, useValue: mockDocumentsService },
      ],
    }).compile();

    controller = module.get<MessagesController>(MessagesController);
    service = module.get<MessagesService>(MessagesService);
    aiGatewayService = module.get<AiGatewayService>(AiGatewayService);
  });

  describe('Full Request/Response Chat Pipeline (HTTP POST /messages)', () => {
    it('should receive user message via controller, execute pipeline, and return assistant response with citations', async () => {
      const user = { id: mockUserId, role: UserRole.USER };
      const dto = {
        conversationId: mockConvId,
        content: 'How many vacation days do I get per year?',
      };

      const result = await controller.sendMessage(user, dto);

      expect(result).toBeDefined();
      expect(result.assistantMessage).toBeDefined();
      expect(result.assistantMessage.role).toBe(MessageRole.ASSISTANT);
      expect(result.assistantMessage.content).toContain('Here is the company leave policy');
      expect(result.assistantMessage.citations).toHaveLength(1);
      expect(result.assistantMessage.citations[0].source).toBe('01_employee_handbook.pdf');

      // Verify that both user message and assistant message were persisted to the store
      expect(messagesStore.length).toBeGreaterThanOrEqual(2);
      const userMsg = messagesStore.find((m) => m.role === MessageRole.USER);
      expect(userMsg).toBeDefined();
      expect(userMsg.content).toBe(dto.content);

      // Verify AI Gateway was invoked with correct parameters
      expect(aiGatewayService.chat).toHaveBeenCalledTimes(1);
      const gatewayCallArgs = (aiGatewayService.chat as jest.Mock).mock.calls[0][0];
      expect(gatewayCallArgs.message).toBe(dto.content);
      expect(gatewayCallArgs.userId).toBe(mockUserId);
    });

    it('should parse @mentions in controller message, add to resource scope, and pass to AI gateway', async () => {
      const user = { id: mockUserId, role: UserRole.USER };
      const dto = {
        conversationId: mockConvId,
        content: 'Check @01_employee_handbook.pdf for maternity leave policies',
      };

      const result = await controller.sendMessage(user, dto);

      expect(result).toBeDefined();
      expect(result.assistantMessage.role).toBe(MessageRole.ASSISTANT);

      // Verify AI Gateway call received the document in resource scope
      const gatewayCallArgs = (aiGatewayService.chat as jest.Mock).mock.calls[0][0];
      expect(gatewayCallArgs.resourceIds).toContain(mockDocId);
    });
  });

  describe('Streaming Flow (HTTP POST /messages/stream)', () => {
    it('should stream chunks via SSE res.write and save final assistant response', async () => {
      const user = { id: mockUserId, role: UserRole.USER };
      const dto = {
        conversationId: mockConvId,
        content: 'Tell me about the policy',
      };

      const writtenChunks: string[] = [];
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn().mockImplementation((chunk) => {
          writtenChunks.push(chunk);
          return true;
        }),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await controller.streamMessage(user, dto, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(writtenChunks.length).toBeGreaterThan(0);
      expect(mockRes.end).toHaveBeenCalled();

      // Verify final assistant message was stored
      const assistantMsg = messagesStore.find(
        (m) => m.role === MessageRole.ASSISTANT && m.content.includes('Here is the company leave policy'),
      );
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg.content).toContain('Here is the company leave policy');
    });
  });

  describe('Error Resilience & Lock Release', () => {
    it('should propagate AI Gateway errors and properly release the active generation lock', async () => {
      (aiGatewayService.chat as jest.Mock).mockRejectedValueOnce(
        new Error('AI Service connection timed out after 45000ms'),
      );

      const user = { id: mockUserId, role: UserRole.USER };
      const dto = {
        conversationId: mockConvId,
        content: 'Will this fail gracefully?',
      };

      await expect(controller.sendMessage(user, dto)).rejects.toThrow(
        'AI Service connection timed out after 45000ms',
      );

      // Verify active generation lock is released even after failure
      const activeGenerations = await controller.getActiveGenerations(mockUserId);
      expect(activeGenerations.activeConversationIds).not.toContain(mockConvId);
    });
  });
});
