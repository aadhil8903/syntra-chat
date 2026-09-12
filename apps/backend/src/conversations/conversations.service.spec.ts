import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationEntity } from './schemas/conversation.schema';
import { User } from '../users/schemas/user.schema';
import { OwnershipService } from '../permissions/services/ownership.service';
import { PresenceService } from '../users/presence.service';
import { DocumentsService } from '../documents/documents.service';

describe('ConversationsService — Direct Messaging & Organization Collaboration', () => {
  let service: ConversationsService;
  let mockConversationModel: any;
  let mockUserModel: any;
  let mockConnection: any;
  let mockOwnershipService: any;
  let mockPresenceService: any;

  const userAId = new Types.ObjectId().toString();
  const userBId = new Types.ObjectId().toString();
  const userCId = new Types.ObjectId().toString();

  const userA = {
    _id: new Types.ObjectId(userAId),
    firstName: 'Aadil',
    lastName: 'Mohammed',
    email: 'aadil@company.com',
    status: 'active',
    isDeleted: false,
    departments: ['Engineering'],
    lastSeenAt: new Date(),
  };

  const userB = {
    _id: new Types.ObjectId(userBId),
    firstName: 'Rahul',
    lastName: 'Kumar',
    email: 'rahul@company.com',
    status: 'active',
    isDeleted: false,
    departments: ['Operations'],
    lastSeenAt: new Date(),
  };

  const userC = {
    _id: new Types.ObjectId(userCId),
    firstName: 'Sarah',
    lastName: 'Thomas',
    email: 'sarah@company.com',
    status: 'active',
    isDeleted: false,
    departments: ['Product'],
    lastSeenAt: new Date(),
  };

  let mockConversationsDb: any[] = [];

  beforeEach(async () => {
    mockConversationsDb = [];

    mockConversationModel = jest.fn().mockImplementation((dto) => {
      const doc = {
        ...dto,
        _id: new Types.ObjectId(),
        unreadCounts: dto.unreadCounts || new Map(),
        createdAt: new Date(),
        updatedAt: new Date(),
        save: jest.fn().mockImplementation(function () {
          mockConversationsDb.push(this);
          return Promise.resolve(this);
        }),
      };
      return doc;
    });

    mockConversationModel.find = jest.fn().mockImplementation((query) => {
      let filtered = [...mockConversationsDb];
      if (query.type) {
        filtered = filtered.filter((c) => c.type === query.type);
      }
      if (query.participants) {
        filtered = filtered.filter((c) =>
          c.participants?.some((p: any) => p.toString() === query.participants.toString()),
        );
      }
      return {
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(filtered),
            }),
          }),
          exec: jest.fn().mockResolvedValue(filtered),
        }),
      };
    });

    mockConversationModel.findOne = jest.fn().mockImplementation((query) => {
      if (query.type === 'direct' && query.participants && query.participants.$all) {
        const [p1, p2] = query.participants.$all;
        const found = mockConversationsDb.find(
          (c) =>
            c.type === 'direct' &&
            c.participants?.some((p: any) => p.toString() === p1.toString()) &&
            c.participants?.some((p: any) => p.toString() === p2.toString()),
        );
        return Promise.resolve(found || null);
      }
      return Promise.resolve(null);
    });

    mockConversationModel.findById = jest.fn().mockImplementation((id) => {
      const found = mockConversationsDb.find((c) => c._id.toString() === id.toString());
      return Promise.resolve(found || null);
    });

    mockUserModel = {
      findById: jest.fn().mockImplementation((id) => {
        const idStr = id?.toString?.() || id;
        if (idStr === userAId) {
          return { lean: () => ({ exec: () => Promise.resolve(userA) }), exec: () => Promise.resolve(userA) };
        }
        if (idStr === userBId) {
          return { lean: () => ({ exec: () => Promise.resolve(userB) }), exec: () => Promise.resolve(userB) };
        }
        if (idStr === userCId) {
          return { lean: () => ({ exec: () => Promise.resolve(userC) }), exec: () => Promise.resolve(userC) };
        }
        return { lean: () => ({ exec: () => Promise.resolve(null) }), exec: () => Promise.resolve(null) };
      }),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([userA, userB, userC]),
          }),
        }),
      }),
    };

    mockConnection = {
      collection: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      }),
    };

    mockOwnershipService = {
      validateUserResources: jest.fn().mockResolvedValue({ validDocumentIds: [], validDatasetIds: [] }),
    };

    mockPresenceService = {
      calculatePresence: jest.fn().mockImplementation((uid: string) => ({
        userId: uid,
        isOnline: true,
        lastSeenRelative: 'Online',
      })),
    };

    const mockDocumentsService = {
      uploadDirectAttachment: jest.fn().mockImplementation((userId: string, file: any) =>
        Promise.resolve({
          id: new Types.ObjectId().toString(),
          originalName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          status: 'ready',
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: getModelToken(ConversationEntity.name), useValue: mockConversationModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: OwnershipService, useValue: mockOwnershipService },
        { provide: PresenceService, useValue: mockPresenceService },
        { provide: DocumentsService, useValue: mockDocumentsService },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
  });

  describe('1. Direct Conversation Creation & Reuse', () => {
    it('should create a direct conversation between User A and User B', async () => {
      const conv = await service.getOrCreateDirectConversation(userAId, userBId);
      expect(conv).toBeDefined();
      expect(conv.type).toBe('direct');
      expect(conv.participants).toContain(userAId);
      expect(conv.participants).toContain(userBId);
      expect(conv.partner?.firstName).toBe('Rahul');
    });

    it('should reuse existing direct conversation and not create duplicates', async () => {
      const conv1 = await service.getOrCreateDirectConversation(userAId, userBId);
      const conv2 = await service.getOrCreateDirectConversation(userBId, userAId);
      expect(conv1.id).toBe(conv2.id);
      expect(mockConversationsDb.length).toBe(1);
    });

    it('should reject starting a direct conversation with oneself', async () => {
      await expect(service.getOrCreateDirectConversation(userAId, userAId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('2. Direct Conversation Access Control', () => {
    it('should allow participants (User A or User B) to access the DM', async () => {
      const conv = await service.getOrCreateDirectConversation(userAId, userBId);
      const fetchedByA = await service.getDirectConversation(userAId, conv.id);
      expect(fetchedByA.id).toBe(conv.id);

      const fetchedByB = await service.getDirectConversation(userBId, conv.id);
      expect(fetchedByB.id).toBe(conv.id);
    });

    it('should reject non-participant (User C) with 403 Forbidden', async () => {
      const conv = await service.getOrCreateDirectConversation(userAId, userBId);
      await expect(service.getDirectConversation(userCId, conv.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('3. Listing Direct Conversations with Presence', () => {
    it('should list direct conversations with partner details and presence', async () => {
      await service.getOrCreateDirectConversation(userAId, userBId);
      await service.getOrCreateDirectConversation(userAId, userCId);

      const list = await service.listDirectConversations(userAId);
      expect(list).toHaveLength(2);
      expect(list.some((item) => item.partner.firstName === 'Rahul')).toBe(true);
      expect(list.some((item) => item.partner.firstName === 'Sarah')).toBe(true);
    });
  });

  describe('4. Direct Message Attachments Flow & Authorization', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'Design_Spec.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 4096,
      buffer: Buffer.from('%PDF dummy file'),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    it('should allow an active DM participant to upload an attachment', async () => {
      const conv = await service.getOrCreateDirectConversation(userAId, userBId);
      const res = await service.uploadDirectAttachment(userAId, conv.id, mockFile);
      expect(res).toBeDefined();
      expect(res.originalName).toBe('Design_Spec.pdf');
    });

    it('should reject a non-participant from uploading an attachment to the DM', async () => {
      const conv = await service.getOrCreateDirectConversation(userAId, userBId);
      await expect(service.uploadDirectAttachment(userCId, conv.id, mockFile)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject upload when conversation is not a direct message conversation', async () => {
      // Mock an AI conversation
      const aiConv = {
        _id: new Types.ObjectId(),
        type: 'ai',
        userId: new Types.ObjectId(userAId),
        participants: [],
      };
      mockConversationsDb.push(aiConv);

      await expect(service.uploadDirectAttachment(userAId, aiConv._id.toString(), mockFile)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject upload when no file is provided', async () => {
      const conv = await service.getOrCreateDirectConversation(userAId, userBId);
      await expect(service.uploadDirectAttachment(userAId, conv.id, null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject upload for invalid/non-existent conversation ID', async () => {
      await expect(service.uploadDirectAttachment(userAId, 'invalid-id', mockFile)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
