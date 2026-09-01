import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

describe('MailService', () => {
  let service: MailService;
  let mockConfigService: { get: jest.Mock };
  let mockTransporter: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-mock-123', response: '250 OK' }),
      verify: jest.fn().mockResolvedValue(true),
    };

    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);
  });

  const createServiceWithEnv = async (env: Record<string, any>) => {
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

  describe('Configuration and SMTP Initialization', () => {
    it('1. should handle missing SMTP configuration gracefully', async () => {
      service = await createServiceWithEnv({});

      expect((service as any).transporter).toBeNull();
      const result = await service.sendWelcomeEmail('user@domain.com', 'User', 'Temp123!');
      expect(result).toBe(false);
    });

    it('2. should initialize SMTP transporter when SMTP configuration is present', async () => {
      service = await createServiceWithEnv({
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'test@gmail.com',
        SMTP_PASS: 'abcd efgh ijkl mnop',
        SMTP_FROM: 'Syntra Chat <test@gmail.com>',
      });

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            user: 'test@gmail.com',
            pass: 'abcdefghijklmnop', // Spaces stripped for Gmail
          },
        }),
      );
    });

    it('3. should correctly parse SMTP_SECURE="true" as boolean true', async () => {
      service = await createServiceWithEnv({
        SMTP_HOST: 'smtp.custom.org',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'custom@custom.org',
        SMTP_PASS: 'secret',
      });

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.custom.org',
          port: 465,
          secure: true,
        }),
      );
    });

    it('4. should correctly parse SMTP_SECURE="false" as boolean false (STARTTLS for 587)', async () => {
      service = await createServiceWithEnv({
        SMTP_HOST: 'smtp.custom.org',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_USER: 'custom@custom.org',
        SMTP_PASS: 'secret',
      });

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.custom.org',
          port: 587,
          secure: false,
        }),
      );
    });
  });

  describe('Frontend URL Resolution', () => {
    it('8. should use production FRONTEND_URL when configured', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: 'https://syntra-chat.onrender.com',
        NODE_ENV: 'production',
      });
      expect(service.getFrontendUrl()).toBe('https://syntra-chat.onrender.com');
    });

    it('9. should not use localhost when FRONTEND_URL is configured', async () => {
      service = await createServiceWithEnv({
        FRONTEND_URL: 'https://syntra-chat.onrender.com/',
        NODE_ENV: 'development',
      });
      expect(service.getFrontendUrl()).toBe('https://syntra-chat.onrender.com');
      expect(service.getFrontendUrl()).not.toContain('localhost');
    });

    it('should fallback to production URL if NODE_ENV=production and FRONTEND_URL unset', async () => {
      service = await createServiceWithEnv({
        NODE_ENV: 'production',
      });
      expect(service.getFrontendUrl()).toBe('https://syntra-chat.onrender.com');
    });

    it('should fallback to localhost:4200 in development when FRONTEND_URL unset', async () => {
      service = await createServiceWithEnv({
        NODE_ENV: 'development',
      });
      expect(service.getFrontendUrl()).toBe('http://localhost:4200');
    });
  });

  describe('Email Sending Behavior & Failure Safety', () => {
    it('5. should dispatch email successfully and return true', async () => {
      service = await createServiceWithEnv({
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'admin@gmail.com',
        SMTP_PASS: 'apppassword',
        SMTP_FROM: 'Syntra Chat <admin@gmail.com>',
        FRONTEND_URL: 'https://syntra-chat.onrender.com',
      });

      const result = await service.sendWelcomeEmail(
        'employee@enterprise.com',
        'Aadil',
        'TempPass123!',
      );

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('employee@enterprise.com');
      expect(callArgs.from).toBe('Syntra Chat <admin@gmail.com>');
      expect(callArgs.subject).toBe('Welcome to Syntra Chat — Your Account Credentials');
      expect(callArgs.text).toContain('Login URL:          https://syntra-chat.onrender.com');
      expect(callArgs.text).toContain('Temporary Password: TempPass123!');
      expect(callArgs.html).toContain('https://syntra-chat.onrender.com');
      expect(callArgs.html).toContain('TempPass123!');
    });

    it('6. should handle failed email delivery gracefully without throwing and return false', async () => {
      service = await createServiceWithEnv({
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_USER: 'admin@gmail.com',
        SMTP_PASS: 'apppassword',
      });

      mockTransporter.sendMail.mockRejectedValue(new Error('Invalid login credentials: 535-5.7.8'));

      const result = await service.sendWelcomeEmail(
        'employee@enterprise.com',
        'Aadil',
        'TempPass123!',
      );

      expect(result).toBe(false);
    });

    it('7. should skip external mail dispatch for dummy test domains', async () => {
      service = await createServiceWithEnv({
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_USER: 'admin@gmail.com',
        SMTP_PASS: 'apppassword',
      });

      const result = await service.sendWelcomeEmail(
        'test@example.com',
        'Test User',
        'TempPass123!',
      );

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should verify connection status safely via verifyConnection()', async () => {
      service = await createServiceWithEnv({
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_USER: 'admin@gmail.com',
        SMTP_PASS: 'apppassword',
      });

      const verified = await service.verifyConnection();
      expect(verified).toBe(true);
      expect(mockTransporter.verify).toHaveBeenCalledTimes(1);

      mockTransporter.verify.mockRejectedValue(new Error('Connection timeout'));
      const failedVerify = await service.verifyConnection();
      expect(failedVerify).toBe(false);
    });
  });
});
