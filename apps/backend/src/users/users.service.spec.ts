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
      email: 'aadil@gmail.com',
      role: UserRole.ADMIN,
    });

    await expect(service.deleteUser('507f1f77bcf86cd799439099')).rejects.toThrow(ConflictException);
    expect(repo.deleteById).not.toHaveBeenCalled();
  });

  it('should allow deletion of a standard user account', async () => {
    repo.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      email: 'standard.user@test.com',
      role: UserRole.USER,
    });
    repo.deleteById.mockResolvedValue(true);

    await service.deleteUser('507f1f77bcf86cd799439011');
    expect(repo.deleteById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
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
    expect(systemSettings.verifyMasterPassword).not.toHaveBeenCalled();
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
});
