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

  beforeEach(async () => {
    aclResolver = {
      canUserAccessFolder: jest.fn(),
    };

    mockCollection = {
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
    };

    mockConnection = {
      collection: jest.fn().mockReturnValue(mockCollection),
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
});
