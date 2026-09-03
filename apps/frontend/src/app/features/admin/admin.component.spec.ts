import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { AdminComponent } from './admin.component';
import { ApiService } from '../../core/services/api.service';
import { ModalDialogService } from '../../core/services/modal-dialog.service';
import { of, throwError } from 'rxjs';
import { UserRole } from '@enter-chat/shared-types';

describe('AdminComponent (User Provisioning & Loading State)', () => {
  let component: AdminComponent;
  let apiMock: any;
  let modalMock: any;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    apiMock = {
      getAllUsers: jest.fn().mockReturnValue(of([])),
      getRoles: jest.fn().mockReturnValue(of([])),
      getPendingAccessRequests: jest.fn().mockReturnValue(of([])),
      getRequestAuditHistory: jest.fn().mockReturnValue(of([])),
      getDocuments: jest.fn().mockReturnValue(of([])),
      getDatasets: jest.fn().mockReturnValue(of([])),
      getFolders: jest.fn().mockReturnValue(of([])),
      createUser: jest.fn(),
    };

    modalMock = {
      alert: jest.fn(),
      confirm: jest.fn(),
    };

    injector = createEnvironmentInjector([
      { provide: ApiService, useValue: apiMock },
      { provide: ModalDialogService, useValue: modalMock },
    ]);

    component = runInInjectionContext(injector, () => new AdminComponent());
  });

  afterEach(() => {
    injector.destroy();
  });

  describe('User Provisioning Lifecycle & Loading State', () => {
    it('should provision user successfully and reset creatingUser loading state via finalize', () => {
      const mockCreatedUser = {
        user: {
          id: 'u123',
          email: 'rayyan.test@enterprise.com',
          firstName: 'Rayyan',
          lastName: 'Al-Sayed',
          role: UserRole.USER,
        },
        temporaryPassword: 'TempPassword123!',
        emailSent: true,
        message: 'User created and welcome email dispatched successfully.',
      };

      apiMock.createUser.mockReturnValue(of(mockCreatedUser));

      component.newUser = {
        firstName: 'Rayyan',
        lastName: 'Al-Sayed',
        email: 'rayyan.test@enterprise.com',
        role: UserRole.USER,
        departments: [],
        allowedFolders: [],
      };
      component.newUserSelectedDepartments = ['Engineering'];
      component.newUserSelectedFolders = ['General'];
      component.showCreateModal = true;

      component.submitCreateUser();

      // Verify state after success
      expect(component.creatingUser).toBe(false);
      expect(component.showCreateModal).toBe(false);
      expect(component.showCreatedUserModal).toBe(true);
      expect(component.createdUserResult).toEqual({
        user: mockCreatedUser.user,
        temporaryPassword: 'TempPassword123!',
        emailSent: true,
        message: 'User created and welcome email dispatched successfully.',
      });
      expect(component.newUser.email).toBe('');
      expect(component.newUserSelectedDepartments).toEqual([]);
    });

    it('should reset creatingUser loading state and show error on API failure', () => {
      apiMock.createUser.mockReturnValue(
        throwError(() => ({
          error: { message: 'A user with this email already exists.' },
        })),
      );

      component.newUser = {
        firstName: 'Duplicate',
        lastName: 'User',
        email: 'existing@enterprise.com',
        role: UserRole.USER,
        departments: [],
        allowedFolders: [],
      };
      component.showCreateModal = true;

      component.submitCreateUser();

      // Verify loading state is guaranteed to be terminated
      expect(component.creatingUser).toBe(false);
      expect(component.createUserError).toBe('A user with this email already exists.');
      expect(component.showCreateModal).toBe(true);
    });

    it('should reset creatingUser loading state and show helpful error on timeout', () => {
      const timeoutErr = new Error('Timeout has occurred');
      timeoutErr.name = 'TimeoutError';
      apiMock.createUser.mockReturnValue(throwError(() => timeoutErr));

      component.newUser = {
        firstName: 'Slow',
        lastName: 'Server',
        email: 'slow@enterprise.com',
        role: UserRole.USER,
        departments: [],
        allowedFolders: [],
      };
      component.showCreateModal = true;

      component.submitCreateUser();

      // Verify loading state terminated and timeout error surfaced
      expect(component.creatingUser).toBe(false);
      expect(component.createUserError).toContain('User provisioning request timed out');
      expect(component.showCreateModal).toBe(true);
    });

    it('should open and close requester note popover with anchor positioning', () => {
      const mockReq = {
        id: 'req-1',
        userName: 'Sarah Al-Sayed',
        resourceName: 'HR_Policy.pdf',
        reason: 'Need for onboarding reference',
        createdAt: new Date().toISOString(),
      };

      const dummyButton = document.createElement('button');
      jest.spyOn(dummyButton, 'getBoundingClientRect').mockReturnValue({
        top: 200,
        bottom: 232,
        left: 500,
        right: 532,
        width: 32,
        height: 32,
      } as DOMRect);

      const event = { currentTarget: dummyButton, stopPropagation: jest.fn() } as any;

      component.openRequestMessage(mockReq, event);

      expect(component.activeMessageRequest).toBe(mockReq);
      expect(component.messagePopoverPosition.top).toBe(236); // 232 + 4

      // Toggling the same request closes it
      component.openRequestMessage(mockReq, event);
      expect(component.activeMessageRequest).toBeNull();

      // Explicit close
      component.openRequestMessage(mockReq, event);
      expect(component.activeMessageRequest).toBe(mockReq);
      component.closeRequestMessage();
      expect(component.activeMessageRequest).toBeNull();
    });
  });
});
