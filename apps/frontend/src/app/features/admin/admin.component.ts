import { Component, OnInit, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ModalDialogService } from '../../core/services/modal-dialog.service';
import { IUser, UserRole, ICreateUserDto } from '@enter-chat/shared-types';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit {
  private api = inject(ApiService);
  private modal = inject(ModalDialogService);

  activeTab: 'users' | 'roles' | 'requests' = 'users';
  UserRole = UserRole;

  users: IUser[] = [];
  roles: any[] = [];
  pendingRequests: any[] = [];
  searchQuery = '';
  loading = true;
  errorMessage = '';

  // Access Request History & Audit State
  requestsSubTab: 'pending' | 'history' = 'pending';
  historyRequests: any[] = [];
  historyTotal = 0;
  historyPage = 1;
  historyLimit = 10;
  historyTotalPages = 1;
  historyLoading = false;
  historyError = '';

  // History Filters
  historyFilterStatus: string = '';
  historyFilterRequesterId: string = '';
  historyFilterResolvedBy: string = '';
  historyFilterFrom: string = '';
  historyFilterTo: string = '';
  historyFilterDateField: 'requestedAt' | 'resolvedAt' = 'requestedAt';

  // Master available options for multi-select
  availableFolders: string[] = [];
  availableDepartments: string[] = [
    'Sales',
    'HR',
    'Finance',
    'Engineering',
    'Marketing',
    'Operations',
    'Research',
    'Legal',
    'Management',
  ];

  // Dropdown open states
  openDropdownId: string | null = null; // e.g. 'user-folders-123', 'user-deps-123', 'new-user-folders', etc.
  customInputMap: Record<string, string> = {};

  // Create Role Modal State
  showCreateRoleModal = false;
  newRole = {
    name: '',
    key: '',
    description: '',
  };
  newRoleSelectedFolders: string[] = [];
  createRoleError = '';
  creatingRole = false;

  // Edit Role State
  editingRoleId: string | null = null;
  editRoleName = '';
  editRoleDescription = '';
  editRoleSelectedFolders: string[] = [];

  // Create User Modal State
  showCreateModal = false;
  newUser: ICreateUserDto = {
    firstName: '',
    lastName: '',
    email: '',
    role: UserRole.USER,
    departments: [],
    allowedFolders: [],
  };
  newUserMasterAdminPassword = '';
  newUserShowMasterAdminPassword = false;
  newUserSelectedFolders: string[] = [];
  newUserSelectedDepartments: string[] = [];
  createUserError = '';
  creatingUser = false;

  // Created User Success Modal State
  showCreatedUserModal = false;
  createdUserResult: any = null;
  copiedPassword = false;

  // Edit User State
  editingUserId: string | null = null;
  editDepartmentsText = '';
  editSelectedFolders: string[] = [];
  editSelectedDepartments: string[] = [];
  editRole: any = UserRole.USER;
  editMasterAdminPassword = '';
  editShowMasterAdminPassword = false;
  editStatus: 'active' | 'suspended' = 'active';

  get filteredUsers(): IUser[] {
    if (!this.searchQuery.trim()) return this.users;
    const q = this.searchQuery.toLowerCase();
    return this.users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.firstName?.toLowerCase().includes(q) ||
        u.lastName?.toLowerCase().includes(q) ||
        u.departments?.some((d) => d.toLowerCase().includes(q)) ||
        u.allowedFolders?.some((f) => f.toLowerCase().includes(q))
    );
  }

  ngOnInit() {
    this.loadUsers();
    this.loadRoles();
    this.loadRequests();
    this.loadAvailableFoldersAndDeps();
  }
  
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown-container')) {
      this.openDropdownId = null;
    }
    if (this.activeMessageRequest && !target.closest('.request-message-popover')) {
      this.closeRequestMessage();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.activeMessageRequest) {
      this.closeRequestMessage();
    }
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onWindowChange() {
    if (this.activeMessageRequest) {
      this.closeRequestMessage();
    }
  }

  toggleDropdown(id: string, event: MouseEvent) {
    event.stopPropagation();
    this.openDropdownId = this.openDropdownId === id ? null : id;
  }

  loadAvailableFoldersAndDeps() {
    forkJoin({
      docs: this.api.getDocuments().pipe(catchError(() => of([]))),
      datasets: this.api.getDatasets().pipe(catchError(() => of([]))),
    }).subscribe(({ docs, datasets }) => {
      const folderSet = new Set<string>();

      for (const d of docs) {
        if (d.folder && d.folder.trim()) folderSet.add(d.folder.trim());
      }
      for (const ds of datasets) {
        if (ds.folder && ds.folder.trim()) folderSet.add(ds.folder.trim());
      }

      try {
        const docFolders = JSON.parse(localStorage.getItem('syntra_chat_document_folders') || '[]');
        for (const f of docFolders) if (f && f.trim()) folderSet.add(f.trim());
      } catch {}
      try {
        const dsFolders = JSON.parse(localStorage.getItem('syntra_chat_dataset_folders') || '[]');
        for (const f of dsFolders) if (f && f.trim()) folderSet.add(f.trim());
      } catch {}

      for (const u of this.users) {
        if (u.allowedFolders) {
          for (const f of u.allowedFolders) if (f && f.trim()) folderSet.add(f.trim());
        }
        if (u.departments) {
          for (const d of u.departments) {
            if (d && d.trim() && !this.availableDepartments.includes(d.trim())) {
              this.availableDepartments.push(d.trim());
            }
          }
        }
      }

      this.availableFolders = Array.from(folderSet).sort();
    });
  }

  toggleItem(list: string[], item: string, event?: Event) {
    if (event) event.stopPropagation();
    const idx = list.indexOf(item);
    if (idx > -1) {
      list.splice(idx, 1);
    } else {
      list.push(item);
    }
  }

  removeItem(list: string[], item: string, event?: Event) {
    if (event) event.stopPropagation();
    const idx = list.indexOf(item);
    if (idx > -1) {
      list.splice(idx, 1);
    }
  }

  addCustomItem(list: string[], type: 'folder' | 'dept', dropdownKey: string, event?: Event) {
    if (event) event.stopPropagation();
    const inputVal = (this.customInputMap[dropdownKey] || '').trim();
    if (!inputVal) return;

    if (type === 'folder') {
      if (!this.availableFolders.includes(inputVal)) {
        this.availableFolders.push(inputVal);
        this.availableFolders.sort();
      }
    } else {
      if (!this.availableDepartments.includes(inputVal)) {
        this.availableDepartments.push(inputVal);
        this.availableDepartments.sort();
      }
    }

    if (!list.includes(inputVal)) {
      list.push(inputVal);
    }
    this.customInputMap[dropdownKey] = '';
  }

  loadRoles() {
    this.api.getRoles().subscribe({
      next: (res) => {
        this.roles = res.roles || [];
        this.loadAvailableFoldersAndDeps();
      },
      error: (err) => console.error('Failed to load roles', err),
    });
  }

  openCreateRoleModal() {
    this.newRole = {
      name: '',
      key: '',
      description: '',
    };
    this.newRoleSelectedFolders = [];
    this.createRoleError = '';
    this.showCreateRoleModal = true;
  }

  submitCreateRole() {
    if (!this.newRole.name.trim()) {
      this.createRoleError = 'Please provide a role name.';
      return;
    }

    const key = this.newRole.key.trim() || this.newRole.name.toLowerCase().trim().replace(/\s+/g, '_');
    this.creatingRole = true;
    this.createRoleError = '';

    this.api
      .createRole({
        name: this.newRole.name.trim(),
        key,
        description: this.newRole.description,
        allowedFolders: this.newRoleSelectedFolders,
      })
      .subscribe({
        next: (res) => {
          this.roles.push(res.role);
          this.showCreateRoleModal = false;
          this.creatingRole = false;
        },
        error: (err) => {
          this.creatingRole = false;
          this.createRoleError = err.error?.message || 'Failed to create role.';
        },
      });
  }

  startEditingRole(role: any) {
    this.editingRoleId = role._id || role.id;
    this.editRoleName = role.name;
    this.editRoleDescription = role.description || '';
    this.editRoleSelectedFolders = [...(role.allowedFolders || [])];
  }

  cancelEditingRole() {
    this.editingRoleId = null;
    this.openDropdownId = null;
  }

  saveRole(role: any) {
    const roleId = role._id || role.id;
    this.api
      .updateRole(roleId, {
        name: this.editRoleName.trim(),
        description: this.editRoleDescription,
        allowedFolders: this.editRoleSelectedFolders,
      })
      .subscribe({
        next: (res) => {
          const idx = this.roles.findIndex((r) => (r._id || r.id) === roleId);
          if (idx !== -1) {
            this.roles[idx] = res.role;
          }
          this.editingRoleId = null;
          this.openDropdownId = null;
        },
        error: (err) => this.modal.alert(err.error?.message || 'Failed to update role', 'Error'),
      });
  }

  async deleteRole(role: any) {
    const roleId = role._id || role.id;
    const confirmed = await this.modal.confirmDanger(
      `Are you sure you want to delete role "${role.name}"? Users with this role will lose their mapped permissions.`,
      'Delete Role',
      'Delete Role'
    );
    if (!confirmed) return;

    this.api.deleteRole(roleId).subscribe({
      next: () => {
        this.roles = this.roles.filter((r) => (r._id || r.id) !== roleId);
      },
      error: (err) => this.modal.alert(err.error?.message || 'Failed to delete role', 'Error'),
    });
  }

  loadUsers() {
    this.loading = true;
    this.api.getAllUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.loading = false;
        this.loadAvailableFoldersAndDeps();
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Failed to load users (Admin privileges required)';
        this.loading = false;
      },
    });
  }

  loadRequests() {
    this.api.getPendingAccessRequests().subscribe({
      next: (reqs) => (this.pendingRequests = reqs),
      error: (err) => console.error('Failed to load pending requests', err),
    });
    this.loadHistory();
  }

  loadHistory() {
    this.historyLoading = true;
    this.historyError = '';

    const query: any = {
      page: this.historyPage,
      limit: this.historyLimit,
      dateField: this.historyFilterDateField,
    };

    if (this.historyFilterStatus) {
      query.status = this.historyFilterStatus;
    }
    if (this.historyFilterRequesterId) {
      query.requesterId = this.historyFilterRequesterId;
    }
    if (this.historyFilterResolvedBy) {
      query.resolvedBy = this.historyFilterResolvedBy;
    }
    if (this.historyFilterFrom) {
      query.from = this.historyFilterFrom;
    }
    if (this.historyFilterTo) {
      query.to = this.historyFilterTo;
    }

    this.api.getAccessRequestHistory(query).subscribe({
      next: (res) => {
        this.historyRequests = res.items || [];
        this.historyTotal = res.total || 0;
        this.historyPage = res.page || 1;
        this.historyLimit = res.limit || 10;
        this.historyTotalPages = res.totalPages || 1;
        this.historyLoading = false;
      },
      error: (err) => {
        this.historyError = err.error?.message || 'Failed to load access request history';
        this.historyLoading = false;
      },
    });
  }

  applyHistoryFilters() {
    this.historyPage = 1;
    this.loadHistory();
  }

  clearHistoryFilters() {
    this.historyFilterStatus = '';
    this.historyFilterRequesterId = '';
    this.historyFilterResolvedBy = '';
    this.historyFilterFrom = '';
    this.historyFilterTo = '';
    this.historyFilterDateField = 'requestedAt';
    this.historyPage = 1;
    this.loadHistory();
  }

  goToHistoryPage(page: number) {
    if (page < 1 || page > this.historyTotalPages || page === this.historyPage) return;
    this.historyPage = page;
    this.loadHistory();
  }

  approveRequest(req: any) {
    this.updateRequestStatus(req.id || req._id, 'approved');
  }

  rejectRequest(req: any) {
    this.updateRequestStatus(req.id || req._id, 'rejected');
  }

  updateRequestStatus(requestId: string, status: 'approved' | 'rejected') {
    this.api.updateAccessRequestStatus(requestId, { status }).subscribe({
      next: () => {
        this.pendingRequests = this.pendingRequests.filter((r) => r.id !== requestId);
        this.loadUsers();
        this.loadHistory();
      },
      error: (err) => this.modal.alert(err.error?.message || 'Failed to update request', 'Request Error'),
    });
  }

  openCreateModal() {
    this.newUser = {
      firstName: '',
      lastName: '',
      email: '',
      role: UserRole.USER,
      departments: [],
      allowedFolders: [],
    };
    this.newUserMasterAdminPassword = '';
    this.newUserSelectedFolders = [];
    this.newUserSelectedDepartments = [];
    this.createUserError = '';
    this.creatingUser = false;
    this.showCreateModal = true;
  }

  submitCreateUser() {
    if (!this.newUser.email || !this.newUser.firstName || !this.newUser.lastName) {
      this.createUserError = 'Please provide first name, last name, and email.';
      return;
    }

    if (this.newUser.role === UserRole.ADMIN && !this.newUserMasterAdminPassword.trim()) {
      this.createUserError = 'Master admin password is required to create an Administrator.';
      return;
    }

    this.creatingUser = true;
    this.createUserError = '';

    const payload: any = {
      ...this.newUser,
      departments: this.newUserSelectedDepartments,
      allowedFolders: this.newUserSelectedFolders,
    };

    if (this.newUser.role === UserRole.ADMIN) {
      payload.masterAdminPassword = this.newUserMasterAdminPassword.trim();
    }

    this.api
      .createUser(payload)
      .pipe(
        finalize(() => {
          this.creatingUser = false;
        }),
      )
      .subscribe({
        next: (res: any) => {
          const userObj = res.user || res;
          this.users.unshift(userObj);
          this.showCreateModal = false;
          this.newUserMasterAdminPassword = '';
          this.newUser = {
            firstName: '',
            lastName: '',
            email: '',
            role: UserRole.USER,
            departments: [],
            allowedFolders: [],
          };
          this.newUserSelectedFolders = [];
          this.newUserSelectedDepartments = [];
          this.createdUserResult = {
            user: userObj,
            temporaryPassword: res.temporaryPassword || '',
            emailSent: res.emailSent ?? false,
            message: res.message || '',
          };
          this.showCreatedUserModal = true;
          this.copiedPassword = false;
          this.loadUsers();
          this.loadAvailableFoldersAndDeps();
        },
        error: (err) => {
          if (err.name === 'TimeoutError') {
            this.createUserError =
              'User provisioning request timed out. Please check your network connection or refresh the page.';
          } else {
            const msg = err.error?.message;
            if (Array.isArray(msg)) {
              this.createUserError = msg.join(', ');
            } else if (typeof msg === 'string') {
              this.createUserError = msg;
            } else {
              this.createUserError = 'Failed to create user. A user with this email may already exist.';
            }
          }
        },
      });
  }

  copyCreatedPassword(pass: string): void {
    if (!pass) return;
    navigator.clipboard.writeText(pass).then(() => {
      this.copiedPassword = true;
      setTimeout(() => (this.copiedPassword = false), 2500);
    });
  }

  closeCreatedUserModal(): void {
    this.showCreatedUserModal = false;
    this.createdUserResult = null;
  }

  startEditingUser(user: IUser) {
    this.editingUserId = user.id;
    this.editDepartmentsText = user.departments?.join(', ') || '';
    this.editSelectedDepartments = [...(user.departments || [])];
    this.editSelectedFolders = [...(user.allowedFolders || [])];
    this.editRole = user.role;
    this.editMasterAdminPassword = '';
    this.editStatus = user.status || 'active';
  }

  cancelEditing() {
    this.editingUserId = null;
    this.editMasterAdminPassword = '';
    this.openDropdownId = null;
  }

  isTargetRoleAdmin(): boolean {
    return (this.editRole || '').toString().toLowerCase().trim() === 'admin';
  }

  isUserAdmin(user: IUser): boolean {
    return (user.role || '').toString().toLowerCase().trim() === 'admin';
  }

  saveUser(user: IUser) {
    const departments = this.editDepartmentsText
      ? this.editDepartmentsText
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      : this.editSelectedDepartments;

    const payload: any = {
      departments,
      allowedFolders: this.editSelectedFolders,
      role: this.editRole,
      status: this.editStatus,
    };

    const isTargetAdmin = this.isTargetRoleAdmin();
    const wasAlreadyAdmin = this.isUserAdmin(user);

    if (isTargetAdmin && !wasAlreadyAdmin) {
      if (!this.editMasterAdminPassword.trim()) {
        this.modal.alert(
          'Master Administrator Password is required to assign the Administrator role. Please enter the master password.',
          'Security Requirement'
        );
        return;
      }
      payload.masterAdminPassword = this.editMasterAdminPassword.trim();
    }

    this.api
      .updateUser(user.id, payload)
      .subscribe({
        next: (updated) => {
          const idx = this.users.findIndex((u) => u.id === updated.id);
          if (idx !== -1) {
            this.users[idx] = updated;
          }
          this.editingUserId = null;
          this.editMasterAdminPassword = '';
          this.openDropdownId = null;
          this.loadAvailableFoldersAndDeps();
        },
        error: (err) => {
          let errorMsg = 'Failed to update user.';
          if (err.error) {
            if (typeof err.error === 'string') {
              errorMsg = err.error;
            } else if (typeof err.error.message === 'string') {
              errorMsg = err.error.message;
            } else if (Array.isArray(err.error.message)) {
              errorMsg = err.error.message.join(', ');
            } else if (typeof err.error.error === 'string') {
              errorMsg = err.error.error;
            }
          } else if (err.status === 403) {
            errorMsg = 'Permission denied. Master Administrator Password is required to assign Administrator privileges.';
          } else if (err.status === 401) {
            errorMsg = 'Your session has expired. Please log in again.';
          } else if (err.status === 409) {
            errorMsg = 'A conflict occurred while updating this user.';
          } else if (err.message && !err.message.includes('Http failure response')) {
            errorMsg = err.message;
          }
          this.modal.alert(errorMsg, 'Error');
        },
      });
  }

  // Expanded Audit Rows in Access Requests & Audit Log
  expandedAuditRowIds = new Set<string>();

  toggleAuditRowExpand(reqId: string, event?: Event): void {
    if (event) event.stopPropagation();
    if (this.expandedAuditRowIds.has(reqId)) {
      this.expandedAuditRowIds.delete(reqId);
    } else {
      this.expandedAuditRowIds.add(reqId);
    }
  }

  isAuditRowExpanded(reqId: string): boolean {
    return this.expandedAuditRowIds.has(reqId);
  }

  // Contextual Requester Note Popover
  activeMessageRequest: any = null;
  messagePopoverPosition: { top: number; left?: number; right?: number } = { top: 0 };

  openRequestMessage(req: any, event?: MouseEvent): void {
    if (this.activeMessageRequest?.id === req.id) {
      this.closeRequestMessage();
      return;
    }

    if (event) {
      event.stopPropagation();
      const button = (event.currentTarget as HTMLElement) || (event.target as HTMLElement);
      const rect = button.getBoundingClientRect();
      const popoverWidth = 320;
      const popoverEstimatedHeight = 220;

      if (window.innerWidth < 640) {
        this.messagePopoverPosition = {
          top: Math.max(20, (window.innerHeight - popoverEstimatedHeight) / 2),
          left: Math.max(16, (window.innerWidth - popoverWidth) / 2),
        };
      } else {
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUpward = spaceBelow < popoverEstimatedHeight && rect.top > popoverEstimatedHeight;
        const top = openUpward ? Math.max(8, rect.top - popoverEstimatedHeight - 4) : rect.bottom + 4;

        let right: number | undefined = Math.max(8, window.innerWidth - rect.right);
        let left: number | undefined;

        if (window.innerWidth - right - popoverWidth < 8) {
          right = undefined;
          left = Math.max(8, rect.left - popoverWidth + rect.width);
        }

        this.messagePopoverPosition = { top, left, right };
      }
    }

    this.activeMessageRequest = req;
  }

  closeRequestMessage(): void {
    this.activeMessageRequest = null;
  }

  toggleUserStatus(user: IUser) {
    const nextStatus = user.status === 'suspended' ? 'active' : 'suspended';
    this.api.updateUser(user.id, { status: nextStatus }).subscribe({
      next: (updated) => {
        const idx = this.users.findIndex((u) => u.id === updated.id);
        if (idx !== -1) {
          this.users[idx] = updated;
        }
      },
    });
  }

  async deleteUser(user: IUser) {
    const confirmed = await this.modal.confirmDanger(
      `Are you sure you want to permanently delete user "${user.firstName} ${user.lastName}" (${user.email})?`,
      'Permanent User Deletion',
      'Delete User'
    );
    if (!confirmed) {
      return;
    }

    this.api.deleteUser(user.id).subscribe({
      next: () => {
        this.users = this.users.filter((u) => u.id !== user.id);
      },
      error: (err) => this.modal.alert(err.error?.message || 'Failed to delete user', 'Error'),
    });
  }
}
