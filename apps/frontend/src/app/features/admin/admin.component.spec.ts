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

  describe('Administrative Tables Pagination Systems', () => {
    describe('Users Table Pagination', () => {
      beforeEach(() => {
        const users: any[] = [];
        for (let i = 1; i <= 60; i++) {
          users.push({
            id: `u-${i}`,
            email: `user${i}@enterprise.com`,
            firstName: `User${i}`,
            lastName: 'Test',
            role: UserRole.USER,
            departments: ['Engineering'],
          });
        }
        component.users = users;
        component.usersPage = 1;
        component.usersPageSize = 50;
      });

      it('should paginate users with default page size 50', () => {
        expect(component.filteredUsers.length).toBe(60);
        expect(component.paginatedUsers.length).toBe(50);
        expect(component.paginatedUsers[0].id).toBe('u-1');

        component.onUsersPageChange(2);
        expect(component.usersPage).toBe(2);
        expect(component.paginatedUsers.length).toBe(10);
      });

      it('should slice users when page size is changed to 10', () => {
        component.onUsersPageSizeChange(10);
        expect(component.usersPageSize).toBe(10);
        expect(component.usersPage).toBe(1);
        expect(component.paginatedUsers.length).toBe(10);
      });

      it('should return all users when page size is "all"', () => {
        component.onUsersPageSizeChange('all');
        expect(component.usersPageSize).toBe('all');
        expect(component.paginatedUsers.length).toBe(60);
      });

      it('should reset usersPage to 1 on search filter change', () => {
        component.usersPage = 2;
        component.searchQuery = 'User1';
        component.onUsersSearchChange();
        expect(component.usersPage).toBe(1);
      });

      it('should auto-clamp usersPage if user count decreases below page boundary', () => {
        component.usersPageSize = 10;
        component.usersPage = 6;
        expect(component.paginatedUsers.length).toBe(10);

        // Filter users to only 15 items (2 pages of 10)
        component.searchQuery = 'user1'; // matches user1, user10..user19
        expect(component.paginatedUsers.length).toBe(1); // 11 items -> page 2 has 1 item
        expect(component.usersPage).toBe(2);
      });
    });

    describe('Pending Access Requests Pagination', () => {
      beforeEach(() => {
        const reqs: any[] = [];
        for (let i = 1; i <= 55; i++) {
          reqs.push({
            id: `req-${i}`,
            userId: `u-${i}`,
            resourceType: 'document',
            resourceName: `Document_${i}.pdf`,
            createdAt: new Date().toISOString(),
          });
        }
        component.pendingRequests = reqs;
        component.requestsPage = 1;
        component.requestsPageSize = 50;
      });

      it('should paginate pending requests with default page size 50', () => {
        expect(component.paginatedPendingRequests.length).toBe(50);
        component.onRequestsPageChange(2);
        expect(component.requestsPage).toBe(2);
        expect(component.paginatedPendingRequests.length).toBe(5);
      });

      it('should slice pending requests when page size is changed to 10', () => {
        component.onRequestsPageSizeChange(10);
        expect(component.requestsPageSize).toBe(10);
        expect(component.requestsPage).toBe(1);
        expect(component.paginatedPendingRequests.length).toBe(10);
      });

      it('should return all requests when page size is "all"', () => {
        component.onRequestsPageSizeChange('all');
        expect(component.requestsPageSize).toBe('all');
        expect(component.paginatedPendingRequests.length).toBe(55);
      });
    });

    describe('Audit & Resolution History Pagination', () => {
      beforeEach(() => {
        apiMock.getAccessRequestHistory = jest.fn().mockImplementation((query: any) => of({
          items: [{ id: 'h-1' }],
          total: 100,
          page: query.page || 1,
          limit: query.limit || 50,
          totalPages: Math.ceil(100 / (query.limit || 50)),
        }));
      });

      it('should change history page size and reload history from page 1', () => {
        component.onHistoryPageSizeChange(10);
        expect(component.historyPageSize).toBe(10);
        expect(component.historyLimit).toBe(10);
        expect(component.historyPage).toBe(1);
        expect(apiMock.getAccessRequestHistory).toHaveBeenCalledWith(expect.objectContaining({
          page: 1,
          limit: 10,
        }));
      });

      it('should handle "all" page size by requesting a high limit', () => {
        component.onHistoryPageSizeChange('all');
        expect(component.historyPageSize).toBe('all');
        expect(component.historyLimit).toBe(1000);
        expect(apiMock.getAccessRequestHistory).toHaveBeenCalledWith(expect.objectContaining({
          page: 1,
          limit: 1000,
        }));
      });

      it('should navigate to specific history page within bounds', () => {
        component.historyTotalPages = 5;
        component.historyPage = 1;

        component.goToHistoryPage(3);
        expect(component.historyPage).toBe(3);
        expect(apiMock.getAccessRequestHistory).toHaveBeenCalledWith(expect.objectContaining({
          page: 3,
        }));
      });
    });
  });
});
