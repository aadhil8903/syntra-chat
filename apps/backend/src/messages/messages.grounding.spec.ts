import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { MessagesService, detectUnresolvedTargetOperation } from './messages.service';
import { MessagesEventsService } from './messages-events.service';
import { MessageEntity } from './schemas/message.schema';
import { ConversationEntity } from '../conversations/schemas/conversation.schema';
import { OwnershipService } from '../permissions/services/ownership.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { MentionsService } from '../mentions/mentions.service';
import { CollectionsService } from '../collections/collections.service';
import { DocumentsService } from '../documents/documents.service';
import { MessageShareEntity } from './schemas/message-share.schema';
import { ConversationShareEntity } from '../conversations/schemas/conversation-share.schema';
import { User } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { MessageRole } from '@enter-chat/shared-types';

describe('MessagesService — Grounding & Anti-Hallucination Spec', () => {
  let service: MessagesService;
  let mockMessageModel: any;
  let mockConversationModel: any;
  let mockDocumentModel: any;
  let mockDatasetModel: any;
  let mockOwnershipService: any;
  let mockAiGatewayService: any;
  let mockMentionsService: any;
  let mockCollectionsService: any;
  let mockDocumentsService: any;

  const mockUserId = new Types.ObjectId().toString();
  const mockConvId = new Types.ObjectId().toString();
  const mockDocId1 = new Types.ObjectId().toString();
  const mockDocId2 = new Types.ObjectId().toString();

  let conversationInDb: any;

  beforeEach(async () => {
    conversationInDb = {
      _id: new Types.ObjectId(mockConvId),
      userId: new Types.ObjectId(mockUserId),
      title: 'Test Conversation',
      attachedResourceIds: [],
      activeScope: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockConversationModel = {
      findOne: jest.fn().mockImplementation((query) => {
        if (query._id.toString() === mockConvId && query.userId.toString() === mockUserId) {
          return Promise.resolve(conversationInDb);
        }
        return Promise.resolve(null);
      }),
      findById: jest.fn().mockImplementation((id) => {
        if (id && id.toString() === mockConvId) {
          return Promise.resolve(conversationInDb);
        }
        return Promise.resolve(null);
      }),
      findByIdAndUpdate: jest.fn().mockImplementation((id, update) => {
        if (update.$set) {
          Object.assign(conversationInDb, update.$set);
        }
        return Promise.resolve(conversationInDb);
      }),
    };

    mockMessageModel = jest.fn().mockImplementation((dto) => ({
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

    mockDocumentModel = {
      findById: jest.fn().mockImplementation((id) => ({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId(id.toString()),
            originalName: id.toString() === mockDocId1 ? '25_org_chart.xlsx' : 'Document 2',
            title: 'Doc Title',
          }),
        }),
      })),
      find: jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { _id: new Types.ObjectId(mockDocId1), originalName: '25_org_chart.xlsx', title: 'Leadership Org Chart' },
          ]),
        }),
      })),
    };

    mockDatasetModel = {
      findById: jest.fn().mockImplementation((id) => ({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId(id.toString()),
            originalName: '10_employee_directory.xlsx',
            name: 'Employee Directory',
          }),
        }),
      })),
      find: jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { _id: new Types.ObjectId(mockDocId2), originalName: '10_employee_directory.xlsx', name: 'Employee Directory' },
          ]),
        }),
      })),
    };

    mockOwnershipService = {
      verifyOwnership: jest.fn().mockResolvedValue(true),
      validateUserResources: jest.fn().mockResolvedValue({
        validDocumentIds: [mockDocId1],
        validDatasetIds: [mockDocId2],
        invalidIds: [],
      }),
    };

    mockAiGatewayService = {
      chat: jest.fn().mockResolvedValue({
        answer: 'Here is the comparison.',
        intent: 'data_analysis',
        citations: [],
      }),
      streamChat: jest.fn(),
      generateTitle: jest.fn().mockResolvedValue('Chat Title'),
    };

    mockMentionsService = {
      searchMentions: jest.fn().mockResolvedValue({ results: [] }),
    };

    mockCollectionsService = {
      getSharedMemory: jest.fn().mockResolvedValue(''),
      updateSharedMemory: jest.fn().mockResolvedValue(undefined),
    };

    mockDocumentsService = {
      canUserDownloadDocument: jest.fn().mockResolvedValue({ canDownload: true }),
      resolvePdfRequest: jest.fn().mockResolvedValue({ matchType: 'none' }),
    };

    const mockUserModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId(mockUserId),
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
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
        { provide: AiGatewayService, useValue: mockAiGatewayService },
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

    service = module.get<MessagesService>(MessagesService);
  });

  describe('detectUnresolvedTargetOperation unit tests', () => {
    it('returns clarification for ungrounded comparison queries without files', () => {
      const check = detectUnresolvedTargetOperation(
        'Compare the following files and highlight key differences.',
        [],
        null,
      );
      expect(check.isUnresolved).toBe(true);
      expect(check.clarificationAnswer).toBe('Which files would you like me to compare?');
    });

    it('returns targeted clarification for comparison with 1 active scope file', () => {
      const check = detectUnresolvedTargetOperation(
        'Compare the following files and highlight differences',
        [],
        { id: mockDocId1, name: '10_employee_directory.xlsx', type: 'dataset' },
      );
      expect(check.isUnresolved).toBe(true);
      expect(check.clarificationAnswer).toBe("Which file would you like to compare with '10_employee_directory.xlsx'?");
    });

    it('allows comparison when 2 explicit files are provided', () => {
      const check = detectUnresolvedTargetOperation(
        'Compare these two files',
        [mockDocId1, mockDocId2],
        null,
      );
      expect(check.isUnresolved).toBe(false);
    });

    it('returns clarification for plural summarize without files', () => {
      const check = detectUnresolvedTargetOperation(
        'Summarize the following files for our meeting',
        [],
        null,
      );
      expect(check.isUnresolved).toBe(true);
      expect(check.clarificationAnswer).toBe('Which files would you like me to summarize?');
    });

    it('returns clarification for plural analyze without files', () => {
      const check = detectUnresolvedTargetOperation(
        'Analyze these spreadsheets and give me the summary',
        [],
        null,
      );
      expect(check.isUnresolved).toBe(true);
      expect(check.clarificationAnswer).toBe('Which files would you like me to analyze?');
    });
  });

  describe('sendMessage deterministic clarification behavior', () => {
    it('returns clarification immediately without calling AI Gateway when user asks to compare without files', async () => {
      const res = await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: 'Compare the following files and highlight key differences.',
      });

      expect(mockAiGatewayService.chat).not.toHaveBeenCalled();
      expect(res.assistantMessage.content).toBe('Which files would you like me to compare?');
      expect(res.userMessage.content).toBe('Compare the following files and highlight key differences.');
    });

    it('resolves plaintext filenames when user provides them in message and calls AI Gateway', async () => {
      const res = await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: 'Compare 25_org_chart.xlsx and 10_employee_directory.xlsx',
      });

      expect(mockAiGatewayService.chat).toHaveBeenCalled();
      expect(res.assistantMessage.content).toBe('Here is the comparison.');
    });
  });
});
