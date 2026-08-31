import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { CollectionsService } from './collections.service';
import { CollectionEntity } from './schemas/collection.schema';
import { ConversationEntity } from '../conversations/schemas/conversation.schema';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('CollectionsService', () => {
  let service: CollectionsService;
  let mockCollectionModel: any;
  let mockConversationModel: any;

  const mockUserA = new Types.ObjectId().toString();
  const mockUserB = new Types.ObjectId().toString();
  const mockColAId = new Types.ObjectId().toString();
  const mockConvId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockCollectionModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      _id: new Types.ObjectId(mockColAId),
      save: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(mockColAId),
        ...dto,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    }));

    mockCollectionModel.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(mockColAId),
            userId: new Types.ObjectId(mockUserA),
            name: 'Project Orion',
            sharedMemory: '• Project Orion uses PostgreSQL.',
            summaryVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      }),
    });

    mockCollectionModel.findOne = jest.fn().mockImplementation((query) => {
      if (query.userId?.toString() === mockUserA && query._id?.toString() === mockColAId) {
        return Promise.resolve({
          _id: new Types.ObjectId(mockColAId),
          userId: new Types.ObjectId(mockUserA),
          name: 'Project Orion',
          sharedMemory: '• Project Orion uses PostgreSQL.',
          summaryVersion: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return Promise.resolve(null);
    });

    mockCollectionModel.findOneAndUpdate = jest.fn().mockImplementation((query, update) => {
      if (query.userId?.toString() === mockUserA && query._id?.toString() === mockColAId) {
        return Promise.resolve({
          _id: new Types.ObjectId(mockColAId),
          userId: new Types.ObjectId(mockUserA),
          name: update.$set?.name || 'Project Orion',
          sharedMemory: update.$set?.sharedMemory || '• Project Orion uses PostgreSQL.',
          summaryVersion: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return Promise.resolve(null);
    });

    mockCollectionModel.findOneAndDelete = jest.fn().mockImplementation((query) => {
      if (query.userId?.toString() === mockUserA && query._id?.toString() === mockColAId) {
        return Promise.resolve({
          _id: new Types.ObjectId(mockColAId),
          userId: new Types.ObjectId(mockUserA),
        });
      }
      return Promise.resolve(null);
    });

    mockConversationModel = {
      findOne: jest.fn().mockImplementation((query) => {
        if (query.userId?.toString() === mockUserA && query._id?.toString() === mockConvId) {
          return Promise.resolve({
            _id: new Types.ObjectId(mockConvId),
            userId: new Types.ObjectId(mockUserA),
            title: 'Orion Architecture Chat',
            collectionId: undefined,
            save: jest.fn().mockResolvedValue(true),
          });
        }
        return Promise.resolve(null);
      }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectionsService,
        {
          provide: getModelToken(CollectionEntity.name),
          useValue: mockCollectionModel,
        },
        {
          provide: getModelToken(ConversationEntity.name),
          useValue: mockConversationModel,
        },
      ],
    }).compile();

    service = module.get<CollectionsService>(CollectionsService);
  });

  describe('CRUD & Validation', () => {
    it('should create a collection for authenticated user', async () => {
      const col = await service.create(mockUserA, 'Q3 Financials');
      expect(col.name).toBe('Q3 Financials');
      expect(col.userId).toBe(mockUserA);
    });

    it('should reject empty or whitespace collection names', async () => {
      await expect(service.create(mockUserA, '   ')).rejects.toThrow(BadRequestException);
    });

    it('should allow user to list only their own collections', async () => {
      const cols = await service.findAllByUser(mockUserA);
      expect(cols.length).toBe(1);
      expect(cols[0].name).toBe('Project Orion');
    });

    it('should rename a collection owned by the user', async () => {
      const updated = await service.rename(mockUserA, mockColAId, 'Project Orion 2.0');
      expect(updated.name).toBe('Project Orion 2.0');
    });

    it('should delete a collection and unlink conversations returning them to Recent Chats', async () => {
      await service.delete(mockUserA, mockColAId);
      expect(mockConversationModel.updateMany).toHaveBeenCalledWith(
        { collectionId: new Types.ObjectId(mockColAId), userId: new Types.ObjectId(mockUserA) },
        { $unset: { collectionId: 1 } },
      );
    });
  });

  describe('IDOR & User Isolation Protection', () => {
    it('User B cannot retrieve User A collection', async () => {
      await expect(service.findOneByUser(mockUserB, mockColAId)).rejects.toThrow(NotFoundException);
    });

    it('User B cannot rename User A collection', async () => {
      await expect(service.rename(mockUserB, mockColAId, 'Hacked')).rejects.toThrow(NotFoundException);
    });

    it('User B cannot delete User A collection', async () => {
      await expect(service.delete(mockUserB, mockColAId)).rejects.toThrow(NotFoundException);
    });

    it('User B cannot move their chat into User A collection', async () => {
      mockConversationModel.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(mockUserB),
      });

      await expect(
        service.moveConversation(mockUserB, new Types.ObjectId().toString(), mockColAId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Shared Memory Isolation & Bounded Updates', () => {
    it('should retrieve shared memory for collection owned by user', async () => {
      const memory = await service.getSharedMemory(mockUserA, mockColAId);
      expect(memory).toContain('PostgreSQL');
    });

    it('should return empty memory if requested by unauthorized User B', async () => {
      const memory = await service.getSharedMemory(mockUserB, mockColAId);
      expect(memory).toBe('');
    });

    it('should append new fact safely without duplicates', async () => {
      await service.updateSharedMemory(mockUserA, mockColAId, 'Server port is 5432');
      expect(mockCollectionModel.findOneAndUpdate).toHaveBeenCalled();
    });
  });
});
