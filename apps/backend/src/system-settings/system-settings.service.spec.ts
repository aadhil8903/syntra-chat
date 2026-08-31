import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { SystemSettingsService } from './system-settings.service';
import { SystemSetting } from './schemas/system-setting.schema';
import * as argon2 from 'argon2';
import { ForbiddenException, UnauthorizedException, BadRequestException } from '@nestjs/common';

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;
  let mockSystemSettingModel: any;
  let mockConfigService: any;
  let storedSetting: any = null;

  beforeEach(async () => {
    storedSetting = null;

    mockSystemSettingModel = {
      findOne: jest.fn().mockImplementation((query) => {
        if (storedSetting && storedSetting.key === query.key) {
          return Promise.resolve(storedSetting);
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockImplementation((doc) => {
        storedSetting = { ...doc };
        return Promise.resolve(storedSetting);
      }),
      findOneAndUpdate: jest.fn().mockImplementation((query, update) => {
        const val = update.value || (update['$set'] && update['$set'].value) || storedSetting?.value;
        storedSetting = { ...storedSetting, ...update, value: val };
        return Promise.resolve(storedSetting);
      }),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'MASTER_ADMIN_PASSWORD') return 'MySecretEnvPass123!';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSettingsService,
        {
          provide: getModelToken(SystemSetting.name),
          useValue: mockSystemSettingModel,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<SystemSettingsService>(SystemSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initializeMasterPassword', () => {
    it('should initialize master password from env as Argon2id hash when not existing in DB', async () => {
      await service.initializeMasterPassword();

      expect(mockSystemSettingModel.findOne).toHaveBeenCalledWith({
        key: 'master_admin_password_hash',
      });
      expect(mockSystemSettingModel.create).toHaveBeenCalled();
      expect(storedSetting).toBeDefined();
      expect(storedSetting.value).not.toBe('MySecretEnvPass123!');
      
      const isValid = await argon2.verify(storedSetting.value, 'MySecretEnvPass123!');
      expect(isValid).toBe(true);
    });

    it('should do nothing if master password hash already exists in DB', async () => {
      const existingHash = await argon2.hash('ExistingPassword123!', { type: argon2.argon2id });
      storedSetting = {
        key: 'master_admin_password_hash',
        value: existingHash,
      };

      await service.initializeMasterPassword();
      expect(mockSystemSettingModel.create).not.toHaveBeenCalled();
      expect(storedSetting.value).toBe(existingHash);
    });

    it('should not create setting if env variable is not configured', async () => {
      mockConfigService.get.mockReturnValue(null);
      await service.initializeMasterPassword();
      expect(mockSystemSettingModel.create).not.toHaveBeenCalled();
      expect(storedSetting).toBeNull();
    });
  });

  describe('verifyMasterPassword', () => {
    it('should return true for correct password', async () => {
      await service.initializeMasterPassword();
      const isValid = await service.verifyMasterPassword('MySecretEnvPass123!', 'test-client');
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password and increment failed attempts', async () => {
      await service.initializeMasterPassword();
      const isValid = await service.verifyMasterPassword('WrongPassword123!', 'test-client-2');
      expect(isValid).toBe(false);
    });

    it('should enforce rate limit after 5 failed attempts', async () => {
      await service.initializeMasterPassword();
      for (let i = 0; i < 5; i++) {
        await service.verifyMasterPassword('WrongPassword123!', 'rate-limited-user');
      }

      await expect(
        service.verifyMasterPassword('MySecretEnvPass123!', 'rate-limited-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('changeMasterPassword', () => {
    it('should rotate master password when current password is valid', async () => {
      await service.initializeMasterPassword();

      const res = await service.changeMasterPassword('admin-user-id', {
        currentMasterPassword: 'MySecretEnvPass123!',
        newMasterPassword: 'NewStrongPassword2026!',
      });

      expect(res.message).toContain('successfully updated');
      expect(mockSystemSettingModel.findOneAndUpdate).toHaveBeenCalled();
      
      const isNewValid = await service.verifyMasterPassword('NewStrongPassword2026!', 'verify-new');
      expect(isNewValid).toBe(true);
    });

    it('should throw UnauthorizedException if current password is wrong', async () => {
      await service.initializeMasterPassword();

      await expect(
        service.changeMasterPassword('admin-user-id', {
          currentMasterPassword: 'WrongPassword!',
          newMasterPassword: 'NewStrongPassword2026!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if new password is too short or weak', async () => {
      await service.initializeMasterPassword();

      await expect(
        service.changeMasterPassword('admin-user-id', {
          currentMasterPassword: 'MySecretEnvPass123!',
          newMasterPassword: 'short',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
