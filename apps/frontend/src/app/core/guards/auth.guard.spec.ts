import { TestBed } from '@angular/core/testing';
import { authGuard, publicGuard, adminGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { Router, UrlTree } from '@angular/router';

describe('Route Guards', () => {
  let authServiceMock: any;
  let routerMock: any;

  beforeEach(() => {
    authServiceMock = {
      isAuthenticated: jest.fn(),
      isAdmin: jest.fn(),
    };
    routerMock = {
      createUrlTree: jest.fn((commands) => ({ path: commands.join('/') } as unknown as UrlTree)),
      navigate: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  describe('authGuard', () => {
    it('should allow navigation when user is authenticated', () => {
      authServiceMock.isAuthenticated.mockReturnValue(true);

      const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('should redirect unauthenticated users to /auth/login', () => {
      authServiceMock.isAuthenticated.mockReturnValue(false);

      const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
      expect(result).toEqual({ path: '/auth/login' });
      expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/auth/login']);
    });
  });

  describe('publicGuard', () => {
    it('should allow access to public/login page for unauthenticated visitors', () => {
      authServiceMock.isAuthenticated.mockReturnValue(false);

      const result = TestBed.runInInjectionContext(() => publicGuard({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('should redirect already logged-in users to /dashboard', () => {
      authServiceMock.isAuthenticated.mockReturnValue(true);

      const result = TestBed.runInInjectionContext(() => publicGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  describe('adminGuard', () => {
    it('should allow access to admin console for users with admin role', () => {
      authServiceMock.isAuthenticated.mockReturnValue(true);
      authServiceMock.isAdmin.mockReturnValue(true);

      const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('should block non-admin authenticated users and redirect to /dashboard', () => {
      authServiceMock.isAuthenticated.mockReturnValue(true);
      authServiceMock.isAdmin.mockReturnValue(false);

      const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));
      expect(result).toEqual({ path: '/dashboard' });
      expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should block unauthenticated visitors from admin routes and redirect to /dashboard', () => {
      authServiceMock.isAuthenticated.mockReturnValue(false);
      authServiceMock.isAdmin.mockReturnValue(false);

      const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));
      expect(result).toEqual({ path: '/dashboard' });
    });
  });
});
