import { Test, TestingModule } from '@nestjs/testing';
import { AccessRequestsController } from './access-requests.controller';
import { AccessRequestsService } from './access-requests.service';

describe('AccessRequestsController', () => {
  let controller: AccessRequestsController;

  const mockAccessRequestsService = {
    createRequest: jest.fn(),
    getUserRequests: jest.fn(),
    getPendingRequests: jest.fn(),
    updateRequestStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccessRequestsController],
      providers: [
        {
          provide: AccessRequestsService,
          useValue: mockAccessRequestsService,
        },
      ],
    }).compile();

    controller = module.get<AccessRequestsController>(AccessRequestsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

