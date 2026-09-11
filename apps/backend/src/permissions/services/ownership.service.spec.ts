import { Test, TestingModule } from '@nestjs/testing';
import { OwnershipService } from './ownership.service';
import { getConnectionToken } from '@nestjs/mongoose';
import { AclResolverService } from './acl-resolver.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('OwnershipService (Multi-User Isolation & IDOR Protection)', () => {
  let service: OwnershipService;
  let aclResolver: jest.Mocked<any>;
  let mockConnection: any;
  let mockCollection: any;

  const userAId = '507f1f77bcf86cd799439011';
  const userBId = '507f1f77bcf86cd799439022';
  const validDocId = '607f1f77bcf86cd799439001';

  let collections: Record<string, any>;

  beforeEach(async () => {
    aclResolver = {
      canUserAccessFolder: jest.fn(),
    };

    collections = {};
    const getCollection = (name: string) => {
      if (!collections[name]) {
        collections[name] = {
          findOne: jest.fn(),
          find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
        };
      }
      return collections[name];
    };

    ['users', 'documents', 'datasets', 'folders', 'roles', 'conversations', 'conversation_shares', 'message_shares'].forEach(getCollection);
    mockCollection = getCollection('documents');

    mockConnection = {
      collection: jest.fn((name: string) => getCollection(name)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnershipService,
        { provide: AclResolverService, useValue: aclResolver },
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();

    service = module.get<OwnershipService>(OwnershipService);
  });

  it('should verify ownership when resource belongs to the user', async () => {
    mockCollection.findOne.mockResolvedValue({
      _id: new Types.ObjectId(validDocId),
      userId: new Types.ObjectId(userAId),
    });

    const isOwner = await service.verifyOwnership('documents', validDocId, userAId);
    expect(isOwner).toBe(true);
  });

  it('should throw ForbiddenException when User B tries to access User A resource (IDOR defense)', async () => {
    mockCollection.findOne.mockResolvedValue({
      _id: new Types.ObjectId(validDocId),
      userId: new Types.ObjectId(userAId),
    });

    await expect(service.verifyOwnership('documents', validDocId, userBId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should throw NotFoundException when resource does not exist', async () => {
    mockCollection.findOne.mockResolvedValue(null);

    await expect(service.verifyOwnership('documents', validDocId, userAId)).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('Administrator Authorization Override', () => {
    const adminUserId = '507f1f77bcf86cd799439099';

    it('should allow admin to access resource belonging to User A (via userRole parameter)', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(validDocId),
        userId: new Types.ObjectId(userAId),
      });

      const isAllowed = await service.verifyOwnership('documents', validDocId, adminUserId, 'admin');
      expect(isAllowed).toBe(true);
    });

    it('should allow admin with uppercase ADMIN role', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(validDocId),
        userId: new Types.ObjectId(userAId),
      });

      const isAllowed = await service.verifyOwnership('documents', validDocId, adminUserId, 'ADMIN');
      expect(isAllowed).toBe(true);
    });

    it('should allow admin when role is retrieved from users collection', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(validDocId),
        userId: new Types.ObjectId(userAId),
      });
      collections['users'].findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(adminUserId),
        role: 'admin',
      });

      const isAllowed = await service.verifyOwnership('documents', validDocId, adminUserId);
      expect(isAllowed).toBe(true);
    });

    it('should deny non-admin user when user document has role "user"', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(validDocId),
        userId: new Types.ObjectId(userAId),
      });
      collections['users'].findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(userBId),
        role: 'user',
      });

      await expect(service.verifyOwnership('documents', validDocId, userBId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should prevent spoofing: non-admin cannot access another user resource if DB role is "user"', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(validDocId),
        userId: new Types.ObjectId(userAId),
      });
      // Attacker attempts to call without verified admin role
      collections['users'].findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(userBId),
        role: 'user',
      });

      await expect(service.verifyOwnership('documents', validDocId, userBId, 'user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should validate all requested resources for administrator in validateUserResources', async () => {
      const docId = '607f1f77bcf86cd799439001';
      const dsId = '607f1f77bcf86cd799439002';

      const usersCol = mockConnection.collection('users');
      const docsCol = mockConnection.collection('documents');
      const datasetsCol = mockConnection.collection('datasets');

      usersCol.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(adminUserId),
        role: 'admin',
      });

      docsCol.findOne.mockImplementation(async (query: any) => {
        if (query._id.toString() === docId) {
          return { _id: new Types.ObjectId(docId), userId: new Types.ObjectId(userAId), folder: 'Restricted/Secret' };
        }
        return null;
      });

      datasetsCol.findOne.mockImplementation(async (query: any) => {
        if (query._id.toString() === dsId) {
          return { _id: new Types.ObjectId(dsId), userId: new Types.ObjectId(userAId), folder: 'Finance/Confidential' };
        }
        return null;
      });

      const result = await service.validateUserResources(adminUserId, [docId, dsId]);
      expect(result.validDocumentIds).toContain(docId);
      expect(result.validDatasetIds).toContain(dsId);
    });

    it('should filter out unauthorized resources for normal users in validateUserResources', async () => {
      const normalUserId = '507f1f77bcf86cd799439022';
      const docId = '607f1f77bcf86cd799439001';
      const dsId = '607f1f77bcf86cd799439002';

      const usersCol = mockConnection.collection('users');
      const docsCol = mockConnection.collection('documents');
      const datasetsCol = mockConnection.collection('datasets');

      usersCol.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(normalUserId),
        role: 'user',
        departments: ['Engineering'],
        allowedFolders: ['General'],
      });

      docsCol.findOne.mockImplementation(async (query: any) => {
        if (query._id.toString() === docId) {
          return {
            _id: new Types.ObjectId(docId),
            userId: new Types.ObjectId(userAId),
            folder: 'Restricted/Secret',
            allowedDepartments: ['HR'],
          };
        }
        return null;
      });

      datasetsCol.findOne.mockImplementation(async (query: any) => {
        if (query._id.toString() === dsId) {
          return {
            _id: new Types.ObjectId(dsId),
            userId: new Types.ObjectId(userAId),
            folder: 'Finance/Confidential',
            allowedDepartments: ['Finance'],
          };
        }
        return null;
      });

      aclResolver.canUserAccessFolder.mockResolvedValue(false);

      const result = await service.validateUserResources(normalUserId, [docId, dsId]);
      expect(result.validDocumentIds).not.toContain(docId);
      expect(result.validDatasetIds).not.toContain(dsId);
    });
  });
});
