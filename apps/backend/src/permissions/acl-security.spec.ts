import { AclResolverService } from './services/acl-resolver.service';
import { OwnershipService } from './services/ownership.service';
import { UserRole } from '@enter-chat/shared-types';

describe('ACL Security & Permission-Bypass Tests', () => {
  let aclResolver: AclResolverService;
  let ownershipService: OwnershipService;
  let mockConnection: any;

  beforeEach(() => {
    mockConnection = {
      collection: jest.fn().mockImplementation((name: string) => {
        if (name === 'users') {
          return {
            findOne: jest.fn().mockImplementation(({ _id }) => {
              const idStr = _id.toString();
              if (idStr === 'user-finance') {
                return Promise.resolve({
                  _id,
                  email: 'finance@corp.com',
                  role: UserRole.USER,
                  departments: ['Finance'],
                  allowedFolders: ['Finance'],
                  deniedFolders: [],
                });
              }
              if (idStr === 'user-hr') {
                return Promise.resolve({
                  _id,
                  email: 'hr@corp.com',
                  role: UserRole.USER,
                  departments: ['HR'],
                  allowedFolders: ['HR'],
                  deniedFolders: [],
                });
              }
              if (idStr === 'user-admin') {
                return Promise.resolve({
                  _id,
                  email: 'admin@corp.com',
                  role: UserRole.ADMIN,
                  departments: ['Executive'],
                });
              }
              return Promise.resolve(null);
            }),
          };
        }
        if (name === 'documents') {
          return {
            findOne: jest.fn().mockImplementation(({ _id }) => {
              const idStr = _id.toString();
              if (idStr === '507f1f77bcf86cd799439011') {
                return Promise.resolve({
                  _id,
                  userId: 'user-finance',
                  originalName: 'Q3_Financials.pdf',
                  folder: 'Finance/Confidential',
                  allowedDepartments: ['Finance'],
                  downloadPolicy: 'restricted',
                });
              }
              if (idStr === '507f1f77bcf86cd799439022') {
                return Promise.resolve({
                  _id,
                  userId: 'user-hr',
                  originalName: 'Employee_Handbook.pdf',
                  folder: 'HR/General',
                  allowedDepartments: ['HR'],
                  downloadPolicy: 'allowed',
                });
              }
              return Promise.resolve(null);
            }),
          };
        }
        if (name === 'datasets') {
          return {
            findOne: jest.fn().mockResolvedValue(null),
          };
        }
        if (name === 'folders') {
          return {
            find: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue([
                { name: 'Finance', allowedDepartments: ['Finance'] },
                { name: 'Finance/Confidential', allowedDepartments: ['Finance'] },
                { name: 'HR', allowedDepartments: ['HR'] },
                { name: 'HR/General', allowedDepartments: ['HR'] },
              ]),
            }),
          };
        }
        if (name === 'roles') {
          return {
            findOne: jest.fn().mockResolvedValue(null),
          };
        }
        return {
          findOne: jest.fn().mockResolvedValue(null),
        };
      }),
    };

    aclResolver = new AclResolverService(mockConnection);
    ownershipService = new OwnershipService(mockConnection, aclResolver);
  });

  describe('1. Cross-Department Data Isolation & Folder ACL', () => {
    it('should grant access to Finance user for Finance documents', async () => {
      const res = await ownershipService.validateUserResources('user-finance', [
        '507f1f77bcf86cd799439011',
      ]);
      expect(res.validDocumentIds).toContain('507f1f77bcf86cd799439011');
    });

    it('should REJECT HR user from accessing Finance documents (Permission Bypass Prevention)', async () => {
      const res = await ownershipService.validateUserResources('user-hr', [
        '507f1f77bcf86cd799439011',
      ]);
      expect(res.validDocumentIds).not.toContain('507f1f77bcf86cd799439011');
      expect(res.validDocumentIds).toHaveLength(0);
    });

    it('should allow Administrator access across all department documents', async () => {
      const res = await ownershipService.validateUserResources('user-admin', [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439022',
      ]);
      expect(res.validDocumentIds).toContain('507f1f77bcf86cd799439011');
      expect(res.validDocumentIds).toContain('507f1f77bcf86cd799439022');
    });
  });

  describe('2. Nested Folder ACL Inheritance & Nearest-Ancestor Rules', () => {
    it('should correctly inherit department restrictions from parent folder if child has no explicit grants', async () => {
      const foldersMap = new Map<string, string[]>([
        ['Legal', ['Legal']],
        ['Legal/Contracts', []], // Inherits from Legal
      ]);

      const hrUser = { id: 'hr-1', departments: ['HR'], allowedFolders: [], deniedFolders: [] };
      const legalUser = { id: 'leg-1', departments: ['Legal'], allowedFolders: [], deniedFolders: [] };

      const hrAccess = await aclResolver.canUserAccessFolder('hr-1', 'Legal/Contracts', hrUser, foldersMap);
      expect(hrAccess).toBe(false);

      const legalAccess = await aclResolver.canUserAccessFolder('leg-1', 'Legal/Contracts', legalUser, foldersMap);
      expect(legalAccess).toBe(true);
    });

    it('should respect deniedFolders override even if department matches', async () => {
      const foldersMap = new Map<string, string[]>([['Finance', ['Finance']]]);
      const financeUserWithDeny = {
        id: 'fin-denied',
        departments: ['Finance'],
        allowedFolders: ['Finance'],
        deniedFolders: ['Finance/Payroll'],
      };

      const canAccessPayroll = await aclResolver.canUserAccessFolder(
        'fin-denied',
        'Finance/Payroll',
        financeUserWithDeny,
        foldersMap,
      );
      expect(canAccessPayroll).toBe(false);
    });
  });

  describe('3. Resource Injection in Mentions / Attachments', () => {
    it('should strip out any injected unpermitted resource IDs and return only authorized IDs', async () => {
      const validated = await ownershipService.validateUserResources('user-hr', [
        '507f1f77bcf86cd799439022', // HR doc (allowed)
        '507f1f77bcf86cd799439011', // Finance doc (injected/unauthorized)
        '507f1f77bcf86cd799439999', // Non-existent doc
      ]);

      expect(validated.validDocumentIds).toEqual(['507f1f77bcf86cd799439022']);
      expect(validated.validDocumentIds).not.toContain('507f1f77bcf86cd799439011');
    });
  });
});
