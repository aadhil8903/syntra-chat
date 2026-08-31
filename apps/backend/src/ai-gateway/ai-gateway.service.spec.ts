import { Test, TestingModule } from '@nestjs/testing';
import { AiGatewayService } from './ai-gateway.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { throwError } from 'rxjs';

describe('AiGatewayService (Resilience & Error Sanitization)', () => {
  let service: AiGatewayService;
  let httpService: jest.Mocked<any>;

  beforeEach(async () => {
    httpService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGatewayService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((k, def) => def || 'http://localhost:8000'),
          },
        },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<AiGatewayService>(AiGatewayService);
  });

  it('should return clean fallback message when AI service is unreachable without leaking connection ports', async () => {
    // Override Axios client directly to simulate error
    jest.spyOn((service as any).client, 'post').mockRejectedValue({
      code: 'ECONNREFUSED',
      message: 'connect ECONNREFUSED 127.0.0.1:8000',
    });

    const response = await service.chat(
      {
        userId: '123',
        conversationId: 'conv_123',
        message: 'Hello',
        resourceIds: [],
      },
      6, // Skip sleep loop in unit test
    );

    expect(response.answer).toContain('temporarily unavailable');
    expect(response.answer).not.toContain('ECONNREFUSED');
    expect(response.answer).not.toContain('8000');
  });
});
