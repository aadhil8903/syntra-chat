import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let mockConfigService: { get: jest.Mock };

  const createServiceWithEnv = async (env: Record<string, string | undefined>) => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key in env) {
          return env[key];
        }
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    return module.get<MailService>(MailService);
  };

  describe('getFrontendUrl', () => {
    it('should return configured FRONTEND_URL in production', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: 'https://syntra-chat.onrender.com',
        NODE_ENV: 'production',
      });
      expect(service.getFrontendUrl()).toBe('https://syntra-chat.onrender.com');
    });

    it('should strip trailing slashes from FRONTEND_URL', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: 'https://syntra-chat.onrender.com/',
        NODE_ENV: 'production',
      });
      expect(service.getFrontendUrl()).toBe('https://syntra-chat.onrender.com');
    });

    it('should fallback to production Render URL when FRONTEND_URL is unset and NODE_ENV is production', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: undefined,
        NODE_ENV: 'production',
      });
      expect(service.getFrontendUrl()).toBe('https://syntra-chat.onrender.com');
    });

    it('should return localhost:4200 when FRONTEND_URL is explicitly http://localhost:4200', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: 'http://localhost:4200',
        NODE_ENV: 'development',
      });
      expect(service.getFrontendUrl()).toBe('http://localhost:4200');
    });

    it('should fallback to localhost:4200 in local development when FRONTEND_URL is unset', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: undefined,
        NODE_ENV: 'development',
      });
      expect(service.getFrontendUrl()).toBe('http://localhost:4200');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should skip external mail dispatch for dummy test domains', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: 'https://syntra-chat.onrender.com',
      });
      const result = await service.sendWelcomeEmail(
        'alice@example.com',
        'Alice',
        'TempPass123!',
      );
      expect(result).toBe(true);
    });

    it('should generate email with production URL on the Sign In button', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: 'https://syntra-chat.onrender.com',
        NODE_ENV: 'production',
      });

      // Mock transporter
      const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'msg-123' });
      (service as any).transporter = { sendMail: sendMailMock };

      const result = await service.sendWelcomeEmail(
        'newuser@company.com',
        'Bob',
        'SecretTemp456!',
      );

      expect(result).toBe(true);
      expect(sendMailMock).toHaveBeenCalledTimes(1);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.to).toBe('newuser@company.com');
      expect(callArgs.text).toContain('Login URL:          https://syntra-chat.onrender.com');
      expect(callArgs.html).toContain('href="https://syntra-chat.onrender.com"');
      expect(callArgs.html).toContain('Sign In to Syntra Chat &rarr;');
      expect(callArgs.text).not.toContain('localhost');
      expect(callArgs.html).not.toContain('localhost');
    });

    it('should handle SMTP error gracefully without throwing and return false', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: 'https://syntra-chat.onrender.com',
      });

      // Mock failing transporter
      const sendMailMock = jest.fn().mockRejectedValue(new Error('SMTP Connection Refused'));
      (service as any).transporter = { sendMail: sendMailMock };

      const result = await service.sendWelcomeEmail(
        'user@external.com',
        'Charlie',
        'TempPass789!',
      );

      expect(result).toBe(false);
    });

    it('should return false when no email provider is configured and not throw', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: 'https://syntra-chat.onrender.com',
      });

      const result = await service.sendWelcomeEmail(
        'user@external.com',
        'Diana',
        'TempPassABC!',
      );

      expect(result).toBe(false);
    });

    it('should handle SMTP timeout gracefully and return false without hanging', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: 'https://syntra-chat.onrender.com',
      });

      // Mock a hanging transporter that never resolves
      let timer: any;
      const hangingSendMail = jest.fn().mockImplementation(
        () => new Promise((resolve) => {
          timer = setTimeout(resolve, 10000);
          if (timer.unref) timer.unref();
        }),
      );
      (service as any).transporter = { sendMail: hangingSendMail };

      // Call sendWelcomeEmail
      const result = await service.sendWelcomeEmail(
        'timeout.user@external.com',
        'Timeout',
        'TempPassTimeout!',
      );

      clearTimeout(timer);
      expect(result).toBe(false);
    }, 10000);
  });
});
