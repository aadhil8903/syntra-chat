import { Test, TestingModule } from '@nestjs/testing';
import { AccessRequestsService } from './access-requests.service';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { AccessRequestEntity } from './schemas/access-request.schema';
import { UsersService } from '../users/users.service';

describe('AccessRequestsService', () => {
  let service: AccessRequestsService;

  const mockModel: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockConnection = {
    collection: jest.fn(),
  };

  const mockUsersService = {
    findById: jest.fn(),
    update: jest.fn(),
    addAllowedFolder: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessRequestsService,
        {
          provide: getModelToken(AccessRequestEntity.name),
          useValue: mockModel,
        },
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    service = module.get<AccessRequestsService>(AccessRequestsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Audit Log & History', () => {
    it('should assign authenticated admin ID to resolvedBy on status update', async () => {
      const mockReq: any = {
        _id: 'req123',
        status: 'pending',
        userId: 'user123',
        resourceType: 'folder',
        resourceId: 'Finance',
        save: jest.fn().mockResolvedValue(true),
      };
      mockModel.findById = jest.fn().mockResolvedValue(mockReq);

      const adminId = '507f1f77bcf86cd799439011';
      const result = await service.updateRequestStatus(
        'req123',
        { status: 'approved' as any },
        adminId
      );

      expect(mockReq.status).toBe('approved');
      expect(mockReq.resolvedBy.toString()).toBe(adminId);
      expect(mockReq.resolvedAt).toBeDefined();
      expect(mockReq.save).toHaveBeenCalled();
    });

    it('should perform server-side filtering and pagination in getHistory', async () => {
      const mockQueryExec = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          {
            _id: 'req1',
            userId: { _id: 'u1', firstName: 'Sarah', lastName: 'Al-Sayed', email: 'sarah@co.com' },
            resourceId: 'doc123',
            resourceType: 'document',
            status: 'approved',
            resolvedBy: { _id: 'admin1', firstName: 'Admin', lastName: 'One', email: 'admin@co.com' },
            resolvedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      };

      mockModel.find = jest.fn().mockReturnValue(mockQueryExec);
      mockModel.countDocuments = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const res = await service.getHistory({
        status: 'approved',
        page: '1',
        limit: '10',
      });

      expect(res.total).toBe(1);
      expect(res.items.length).toBe(1);
      expect(res.items[0].resolvedByName).toBe('Admin One');
      expect(res.items[0].userName).toBe('Sarah Al-Sayed');
    });
  });
});

