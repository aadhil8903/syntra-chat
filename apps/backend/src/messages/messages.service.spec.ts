import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessageEntity } from './schemas/message.schema';
import { ConversationEntity } from '../conversations/schemas/conversation.schema';
import { OwnershipService } from '../permissions/services/ownership.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { MentionsService } from '../mentions/mentions.service';
import { CollectionsService } from '../collections/collections.service';
import { DocumentsService } from '../documents/documents.service';
import { MessageRole } from '@enter-chat/shared-types';

describe('MessagesService — Spec Round 22 Active Scope Persistence', () => {
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
      findById: jest.fn().mockImplementation((id) => {
        const idStr = id?.toString?.() || id;
        if (idStr === mockDocId1) {
          return {
            select: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                _id: new Types.ObjectId(mockDocId1),
                originalName: '01_employee_handbook.pdf',
                title: '01_employee_handbook.pdf',
              }),
            }),
            exec: jest.fn().mockResolvedValue({
              _id: new Types.ObjectId(mockDocId1),
              originalName: '01_employee_handbook.pdf',
              title: '01_employee_handbook.pdf',
            }),
          };
        }
        if (idStr === mockDocId2) {
          return {
            select: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                _id: new Types.ObjectId(mockDocId2),
                originalName: '02_security_policy.pdf',
                title: '02_security_policy.pdf',
              }),
            }),
            exec: jest.fn().mockResolvedValue({
              _id: new Types.ObjectId(mockDocId2),
              originalName: '02_security_policy.pdf',
              title: '02_security_policy.pdf',
            }),
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
          exec: jest.fn().mockResolvedValue(null),
        };
      }),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      }),
    };

    mockDatasetModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
        exec: jest.fn().mockResolvedValue(null),
      }),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      }),
    };

    mockOwnershipService = {
      verifyOwnership: jest.fn().mockResolvedValue(true),
      validateUserResources: jest.fn().mockImplementation((userId, resourceIds) => {
        return Promise.resolve({
          validDocumentIds: resourceIds.filter((id: string) => !id.startsWith('folder:')),
          validDatasetIds: [],
        });
      }),
    };

    mockAiGatewayService = {
      chat: jest.fn().mockResolvedValue({
        answer: 'This is the AI response.',
        citations: [],
      }),
      streamChat: jest.fn(),
      generateTitle: jest.fn().mockResolvedValue('Employee Handbook Discussion'),
    };

    mockMentionsService = {
      searchMentions: jest.fn().mockImplementation((userId, query) => {
        if (query.includes('employee_handbook')) {
          return Promise.resolve({
            results: [{ id: mockDocId1, name: '01_employee_handbook.pdf', type: 'document' }],
          });
        }
        if (query.includes('security_policy')) {
          return Promise.resolve({
            results: [{ id: mockDocId2, name: '02_security_policy.pdf', type: 'document' }],
          });
        }
        if (query.includes('HR_Documents') || query.includes('HR Documents')) {
          return Promise.resolve({
            results: [{ id: 'folder:HR Documents', name: 'HR Documents', type: 'folder' }],
          });
        }
        return Promise.resolve({ results: [] });
      }),
    };

    mockCollectionsService = {
      getSharedMemory: jest.fn().mockResolvedValue(''),
      updateSharedMemory: jest.fn().mockResolvedValue(undefined),
    };

    mockDocumentsService = {
      resolvePdfRequest: jest.fn().mockResolvedValue({ found: false }),
      canUserDownloadDocument: jest.fn().mockResolvedValue({ canDownload: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
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

    service = module.get<MessagesService>(MessagesService);
  });

  describe('Spec Round 22 Active Scope Resolution and Persistence', () => {
    it('Scenario A: Initial explicit file mention sets activeScope on conversation', async () => {
      const result = await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: '@01_employee_handbook.pdf what is the leave policy?',
      });

      expect(result.conversation?.activeScope).toBeDefined();
      expect(result.conversation?.activeScope?.id).toBe(mockDocId1);
      expect(result.conversation?.activeScope?.name).toBe('01_employee_handbook.pdf');
      expect(result.conversation?.activeScope?.type).toBe('document');

      // AI gateway must receive activeScope and resourceIds
      expect(mockAiGatewayService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceIds: [mockDocId1],
          activeScope: expect.objectContaining({
            id: mockDocId1,
            name: '01_employee_handbook.pdf',
          }),
        }),
      );
    });

    it('Scenario B & C: Follow-up without mention resolves to the conversation activeScope', async () => {
      // Set activeScope on conversation
      conversationInDb.activeScope = {
        type: 'document',
        id: mockDocId1,
        name: '01_employee_handbook.pdf',
        updatedAt: new Date(),
      };

      const result = await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: 'show me what is inside of that file',
      });

      expect(mockAiGatewayService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceIds: [mockDocId1],
          activeScope: expect.objectContaining({
            id: mockDocId1,
            name: '01_employee_handbook.pdf',
          }),
        }),
      );

      // Follow-up question
      await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: 'what does it say about leave?',
      });

      expect(mockAiGatewayService.chat).toHaveBeenLastCalledWith(
        expect.objectContaining({
          resourceIds: [mockDocId1],
          activeScope: expect.objectContaining({
            id: mockDocId1,
          }),
        }),
      );
    });

    it('Scenario D: Multiple follow-ups continue using active scope', async () => {
      conversationInDb.activeScope = {
        type: 'document',
        id: mockDocId1,
        name: '01_employee_handbook.pdf',
        updatedAt: new Date(),
      };

      const followUps = [
        'what are the key points?',
        'what about the leave policy?',
        'give me an example from it',
      ];

      for (const msg of followUps) {
        await service.sendMessage(mockUserId, {
          conversationId: mockConvId,
          content: msg,
        });

        expect(mockAiGatewayService.chat).toHaveBeenLastCalledWith(
          expect.objectContaining({
            resourceIds: [mockDocId1],
            activeScope: expect.objectContaining({
              id: mockDocId1,
            }),
          }),
        );
      }
    });

    it('Scenario E: Explicit replacement updates conversation active scope', async () => {
      // Active scope is handbook
      conversationInDb.activeScope = {
        type: 'document',
        id: mockDocId1,
        name: '01_employee_handbook.pdf',
        updatedAt: new Date(),
      };

      // User mentions new file
      await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: '@02_security_policy.pdf summarize this',
      });

      expect(mockAiGatewayService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceIds: [mockDocId2],
          activeScope: expect.objectContaining({
            id: mockDocId2,
            name: '02_security_policy.pdf',
          }),
        }),
      );

      // Subsequent follow-up resolves to security_policy
      await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: 'what does it say about passwords?',
      });

      expect(mockAiGatewayService.chat).toHaveBeenLastCalledWith(
        expect.objectContaining({
          resourceIds: [mockDocId2],
          activeScope: expect.objectContaining({
            id: mockDocId2,
          }),
        }),
      );
    });

    it('Scenario F: Folder scope persists and expands contained documents', async () => {
      mockDocumentModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { _id: new Types.ObjectId(mockDocId1) },
            { _id: new Types.ObjectId(mockDocId2) },
          ]),
        }),
      });

      // User mentions folder
      await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: '@[HR Documents](folder:folder:HR Documents) what is inside?',
      });

      expect(conversationInDb.activeScope?.type).toBe('folder');
      expect(conversationInDb.activeScope?.id).toContain('folder:HR Documents');

      // Follow up
      await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: 'show me the files in it',
      });

      expect(mockAiGatewayService.chat).toHaveBeenLastCalledWith(
        expect.objectContaining({
          resourceIds: expect.arrayContaining([mockDocId1, mockDocId2]),
          activeScope: expect.objectContaining({
            type: 'folder',
            name: 'HR Documents',
          }),
        }),
      );
    });

    it('Scenario G: Permission revocation denies follow-up access and protects data', async () => {
      conversationInDb.activeScope = {
        type: 'document',
        id: mockDocId1,
        name: '01_employee_handbook.pdf',
        updatedAt: new Date(),
      };

      // Mock permission revocation: user no longer has access to mockDocId1
      mockOwnershipService.validateUserResources.mockResolvedValueOnce({
        validDocumentIds: [],
        validDatasetIds: [],
      });

      await expect(
        service.sendMessage(mockUserId, {
          conversationId: mockConvId,
          content: 'show me what is inside of that file',
        }),
      ).rejects.toThrow(ForbiddenException);

      // Ensure AI service was NEVER called with unauthorized document
      expect(mockAiGatewayService.chat).not.toHaveBeenCalled();
    });

    it('Scenario H: Deleted file detects stale scope safely and clears it', async () => {
      const deletedDocId = new Types.ObjectId().toString();
      conversationInDb.activeScope = {
        type: 'document',
        id: deletedDocId,
        name: 'deleted_handbook.pdf',
        updatedAt: new Date(),
      };

      const result = await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: 'show me what is inside of that file',
      });

      // Stale active scope was cleared
      expect(conversationInDb.activeScope).toBeNull();
      // AI service called without stale document ID
      expect(mockAiGatewayService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceIds: [],
          activeScope: null,
        }),
      );
    });

    it('Scenario I & J: Unrelated questions do not force active file, but preserve active scope for later return', async () => {
      conversationInDb.activeScope = {
        type: 'document',
        id: mockDocId1,
        name: '01_employee_handbook.pdf',
        updatedAt: new Date(),
      };

      // Unrelated question
      await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: 'What is the capital of France?',
      });

      // Unrelated question called AI with empty resourceIds
      expect(mockAiGatewayService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'What is the capital of France?',
          resourceIds: [],
        }),
      );

      // Active scope is STILL preserved on conversation
      expect(conversationInDb.activeScope?.id).toBe(mockDocId1);

      // User returns to the file
      await service.sendMessage(mockUserId, {
        conversationId: mockConvId,
        content: 'now summarize that file',
      });

      expect(mockAiGatewayService.chat).toHaveBeenLastCalledWith(
        expect.objectContaining({
          message: 'now summarize that file',
          resourceIds: [mockDocId1],
          activeScope: expect.objectContaining({
            id: mockDocId1,
          }),
        }),
      );
    });

    it('Scenario K & L: Conversation isolation & new conversation state', async () => {
      // New conversation has no active scope
      const freshConvId = new Types.ObjectId().toString();
      const freshConv = {
        _id: new Types.ObjectId(freshConvId),
        userId: new Types.ObjectId(mockUserId),
        title: 'Fresh Chat',
        attachedResourceIds: [],
        activeScope: null,
      };

      mockConversationModel.findOne.mockResolvedValueOnce(freshConv);

      await service.sendMessage(mockUserId, {
        conversationId: freshConvId,
        content: 'Hello, what can you do?',
      });

      expect(mockAiGatewayService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: freshConvId,
          resourceIds: [],
          activeScope: null,
        }),
      );
    });
  });
});
