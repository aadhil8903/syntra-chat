import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PresenceService } from './presence.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@enter-chat/shared-types';
import { ExecutionContext } from '@nestjs/common';

describe('UsersController (Provisioning & Access Control)', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<any>;
  let reflector: Reflector;
  let rolesGuard: RolesGuard;

  const mockAdminUser = {
    id: '507f1f77bcf86cd799439099',
    role: UserRole.ADMIN,
    email: 'admin@syntrachat.internal',
  };

  const mockNormalUser = {
    id: '507f1f77bcf86cd799439011',
    role: UserRole.USER,
    email: 'user@syntrachat.internal',
  };

  beforeEach(async () => {
    usersService = {
      findById: jest.fn(),
      findAll: jest.fn(),
      createUserByAdmin: jest.fn(),
      update: jest.fn(),
      deleteUser: jest.fn(),
    };

    const mockPresenceService = {
      recordHeartbeat: jest.fn().mockResolvedValue({ status: 'ok' }),
      getOrgMembersWithPresence: jest.fn().mockResolvedValue([]),
    };

    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: PresenceService, useValue: mockPresenceService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue(rolesGuard)
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  function createMockContext(user: any, handler: any): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => UsersController,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  describe('User Provisioning Endpoint (POST /users)', () => {
    it('should delegate user provisioning to usersService.createUserByAdmin for authorized admin', async () => {
      const mockResult = {
        user: { id: 'new-user-id', email: 'new@enterprise.com' } as any,
        temporaryPassword: 'TempPass123!',
        emailSent: true,
        message: 'User created and welcome email dispatched successfully.',
      };
      usersService.createUserByAdmin.mockResolvedValue(mockResult);

      const payload = {
        email: 'new@enterprise.com',
        firstName: 'New',
        lastName: 'User',
        role: UserRole.USER,
        departments: ['Sales'],
        allowedFolders: ['General'],
      };

      const result = await controller.createUser(mockAdminUser.id, payload);
      expect(result).toEqual(mockResult);
      expect(usersService.createUserByAdmin).toHaveBeenCalledWith(payload, mockAdminUser.id);
    });

    it('should allow RolesGuard canActivate when user is an administrator', () => {
      const context = createMockContext(mockAdminUser, controller.createUser);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should deny RolesGuard canActivate when user is not an administrator', () => {
      const context = createMockContext(mockNormalUser, controller.createUser);
      expect(rolesGuard.canActivate(context)).toBe(false);
    });
  });
});
