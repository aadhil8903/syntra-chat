import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { MailService } from '../mail/mail.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@enter-chat/shared-types';

describe('UsersService (Security & Admin Invariant)', () => {
  let service: UsersService;
  let repo: jest.Mocked<any>;
  let mail: jest.Mocked<any>;
  let systemSettings: jest.Mocked<any>;

  beforeEach(async () => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      softDeleteById: jest.fn().mockResolvedValue(true),
      count: jest.fn().mockResolvedValue(2),
      updateRefreshTokenHash: jest.fn(),
    };

    mail = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(true),
    };

    systemSettings = {
      verifyMasterPassword: jest.fn(),
      changeMasterPassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repo },
        { provide: MailService, useValue: mail },
        { provide: SystemSettingsService, useValue: systemSettings },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should generate secure random temporary passwords with mixed character types', () => {
    const password = (service as any).generateTemporaryPassword();
    expect(password.length).toBeGreaterThanOrEqual(10);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
  });

  it('should block deletion of the primary system administrator account (Single-Admin Invariant)', async () => {
    repo.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      email: 'admin@corp.com',
      role: UserRole.ADMIN,
    });
    repo.count.mockResolvedValue(1);

    await expect(service.deleteUser('507f1f77bcf86cd799439099')).rejects.toThrow(ConflictException);
    expect(repo.softDeleteById).not.toHaveBeenCalled();
  });

  it('should allow deletion of a standard user account', async () => {
    repo.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      email: 'standard.user@test.com',
      role: UserRole.USER,
    });
    repo.softDeleteById.mockResolvedValue(true);

    await service.deleteUser('507f1f77bcf86cd799439011', 'admin-id-123');
    expect(repo.softDeleteById).toHaveBeenCalledWith('507f1f77bcf86cd799439011', 'admin-id-123');
  });

  it('should create normal user without requiring master password', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439022',
      email: 'employee@test.com',
      firstName: 'Emp',
      lastName: 'Loyee',
      role: UserRole.USER,
      departments: ['Sales'],
      allowedFolders: [],
      deniedFolders: [],
      status: 'active',
    });

    const result = await service.createUserByAdmin({
      email: 'employee@test.com',
      firstName: 'Emp',
      lastName: 'Loyee',
      role: UserRole.USER,
    });

    expect(result.user.email).toBe('employee@test.com');
    expect(mail.sendWelcomeEmail).toHaveBeenCalledWith(
      'employee@test.com',
      'Emp',
      expect.any(String),
    );
    expect(result.emailSent).toBe(true);
    expect(systemSettings.verifyMasterPassword).not.toHaveBeenCalled();
  });

  it('should gracefully report emailSent: false when mail service delivery fails', async () => {
    mail.sendWelcomeEmail.mockResolvedValueOnce(false);
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      email: 'failedmail@test.com',
      firstName: 'Fail',
      lastName: 'Mail',
      role: UserRole.USER,
      departments: [],
      allowedFolders: [],
      deniedFolders: [],
      status: 'active',
    });

    const result = await service.createUserByAdmin({
      email: 'failedmail@test.com',
      firstName: 'Fail',
      lastName: 'Mail',
      role: UserRole.USER,
    });

    expect(result.user.email).toBe('failedmail@test.com');
    expect(result.emailSent).toBe(false);
    expect(result.message).toContain('Email delivery was unavailable or skipped');
    expect(result.temporaryPassword).toBeDefined();
  });

  it('should reject creating Administrator if master password is not provided or invalid', async () => {
    repo.findByEmail.mockResolvedValue(null);
    systemSettings.verifyMasterPassword.mockResolvedValue(false);

    await expect(
      service.createUserByAdmin({
        email: 'newadmin@test.com',
        firstName: 'New',
        lastName: 'Admin',
        role: UserRole.ADMIN,
        masterAdminPassword: 'wrong-password',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(systemSettings.verifyMasterPassword).toHaveBeenCalledWith('wrong-password', 'admin');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('should allow creating Administrator when correct master password is provided', async () => {
    repo.findByEmail.mockResolvedValue(null);
    systemSettings.verifyMasterPassword.mockResolvedValue(true);
    repo.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439033',
      email: 'newadmin@test.com',
      firstName: 'New',
      lastName: 'Admin',
      role: UserRole.ADMIN,
      departments: [],
      allowedFolders: [],
      deniedFolders: [],
      status: 'active',
    });

    const result = await service.createUserByAdmin({
      email: 'newadmin@test.com',
      firstName: 'New',
      lastName: 'Admin',
      role: UserRole.ADMIN,
      masterAdminPassword: 'correct-master-password',
    });

    expect(result.user.role).toBe(UserRole.ADMIN);
    expect(systemSettings.verifyMasterPassword).toHaveBeenCalledWith('correct-master-password', 'admin');
    expect(repo.create).toHaveBeenCalled();
  });

  it('should deny updating role to Administrator without valid master password', async () => {
    repo.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439044',
      email: 'user@test.com',
      role: UserRole.USER,
    });
    systemSettings.verifyMasterPassword.mockResolvedValue(false);

    await expect(
      service.update('507f1f77bcf86cd799439044', {
        role: UserRole.ADMIN,
        masterAdminPassword: 'invalid-pw',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(systemSettings.verifyMasterPassword).toHaveBeenCalledWith('invalid-pw', 'admin');
    expect(repo.updateById).not.toHaveBeenCalled();
  });

  it('should allow updating role to Administrator with valid master password', async () => {
    repo.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439044',
      email: 'user@test.com',
      role: UserRole.USER,
    });
    systemSettings.verifyMasterPassword.mockResolvedValue(true);
    repo.updateById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439044',
      email: 'user@test.com',
      firstName: 'User',
      lastName: 'Test',
      role: UserRole.ADMIN,
      departments: [],
      allowedFolders: [],
      deniedFolders: [],
      status: 'active',
    });

    const updated = await service.update('507f1f77bcf86cd799439044', {
      role: UserRole.ADMIN,
      masterAdminPassword: 'correct-master-password',
    });

    expect(updated.role).toBe(UserRole.ADMIN);
    expect(systemSettings.verifyMasterPassword).toHaveBeenCalledWith('correct-master-password', 'admin');
    expect(repo.updateById).toHaveBeenCalled();
  });

  it('should allow updating normal role without requiring master password', async () => {
    repo.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439044',
      email: 'user@test.com',
      role: UserRole.USER,
    });
    repo.updateById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439044',
      email: 'user@test.com',
      firstName: 'User',
      lastName: 'Test',
      role: UserRole.MANAGER,
      departments: ['Sales'],
      allowedFolders: [],
      deniedFolders: [],
      status: 'active',
    });

    const updated = await service.update('507f1f77bcf86cd799439044', {
      role: UserRole.MANAGER,
    });

    expect(updated.role).toBe(UserRole.MANAGER);
    expect(systemSettings.verifyMasterPassword).not.toHaveBeenCalled();
  });

  describe('User Provisioning Flow (createUserByAdmin)', () => {
    it('should successfully provision an enterprise user with departments and allowedFolders', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockImplementation(async (data: any) => ({
        _id: '507f1f77bcf86cd799439055',
        ...data,
      }));
      mail.sendWelcomeEmail.mockResolvedValue(true);

      const result = await service.createUserByAdmin({
        email: 'rayyan.alsayed@enterprise.com',
        firstName: 'Rayyan',
        lastName: 'Al-Sayed',
        role: UserRole.USER,
        departments: ['Engineering', 'DevOps'],
        allowedFolders: ['Engineering/Docs', 'General'],
      });

      expect(result.user.email).toBe('rayyan.alsayed@enterprise.com');
      expect(result.user.departments).toEqual(['Engineering', 'DevOps']);
      expect(result.user.allowedFolders).toEqual(['Engineering/Docs', 'General']);
      expect(result.emailSent).toBe(true);
      expect(result.temporaryPassword).toBeDefined();
      expect(result.message).toContain('welcome email dispatched successfully');
      expect(mail.sendWelcomeEmail).toHaveBeenCalledWith(
        'rayyan.alsayed@enterprise.com',
        'Rayyan',
        result.temporaryPassword,
      );
    });

    it('should reject provisioning when email is invalid or missing', async () => {
      await expect(
        service.createUserByAdmin({
          email: 'not-an-email',
          firstName: 'Bad',
          lastName: 'Email',
        }),
      ).rejects.toThrow('Please provide a valid email address.');

      await expect(
        service.createUserByAdmin({
          email: '',
          firstName: 'Missing',
          lastName: 'Email',
        }),
      ).rejects.toThrow('Please provide a valid email address.');
    });

    it('should reject provisioning when duplicate email exists in MongoDB', async () => {
      repo.findByEmail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439066',
        email: 'existing@enterprise.com',
      });

      await expect(
        service.createUserByAdmin({
          email: 'existing@enterprise.com',
          firstName: 'Existing',
          lastName: 'User',
        }),
      ).rejects.toThrow(ConflictException);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('should reject provisioning when departments format is invalid', async () => {
      await expect(
        service.createUserByAdmin({
          email: 'test@enterprise.com',
          firstName: 'Test',
          lastName: 'User',
          departments: 'NotAnArray' as any,
        }),
      ).rejects.toThrow('Departments must be a list of valid department names.');

      await expect(
        service.createUserByAdmin({
          email: 'test@enterprise.com',
          firstName: 'Test',
          lastName: 'User',
          departments: [123, 456] as any,
        }),
      ).rejects.toThrow('Departments must be a list of valid department names.');
    });

    it('should reject provisioning when allowedFolders format is invalid', async () => {
      await expect(
        service.createUserByAdmin({
          email: 'test@enterprise.com',
          firstName: 'Test',
          lastName: 'User',
          allowedFolders: 'NotAnArray' as any,
        }),
      ).rejects.toThrow('Allowed folders must be a list of valid folder names.');
    });

    it('should fail when MongoDB creation encounters an error', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockRejectedValue(new Error('MongoDB connection failure'));

      await expect(
        service.createUserByAdmin({
          email: 'dberror@enterprise.com',
          firstName: 'Db',
          lastName: 'Error',
        }),
      ).rejects.toThrow('MongoDB connection failure');

      expect(mail.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it('should handle email failure gracefully without failing user creation', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockImplementation(async (data: any) => ({
        _id: '507f1f77bcf86cd799439077',
        ...data,
      }));
      mail.sendWelcomeEmail.mockResolvedValue(false);

      const result = await service.createUserByAdmin({
        email: 'smtpdown@enterprise.com',
        firstName: 'Smtp',
        lastName: 'Down',
      });

      expect(result.user.email).toBe('smtpdown@enterprise.com');
      expect(result.emailSent).toBe(false);
      expect(result.message).toContain('Email delivery was unavailable or skipped');
      expect(result.temporaryPassword).toBeDefined();
    });

    it('should handle email timeout gracefully when mail service reports timeout', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockImplementation(async (data: any) => ({
        _id: '507f1f77bcf86cd799439088',
        ...data,
      }));
      // Simulating mail service catching timeout and returning false
      mail.sendWelcomeEmail.mockResolvedValue(false);

      const result = await service.createUserByAdmin({
        email: 'timeout@enterprise.com',
        firstName: 'Time',
        lastName: 'Out',
      });

      expect(result.user.email).toBe('timeout@enterprise.com');
      expect(result.emailSent).toBe(false);
      expect(result.temporaryPassword).toBeDefined();
    });
  });
});
