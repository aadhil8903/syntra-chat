import { AuthService } from './auth.service';
import { of, throwError } from 'rxjs';
import { UserRole } from '@enter-chat/shared-types';

describe('AuthService', () => {
  let service: AuthService;
  let httpClientMock: any;
  let routerMock: any;

  beforeEach(() => {
    localStorage.clear();
    httpClientMock = {
      post: jest.fn(),
      get: jest.fn(),
      patch: jest.fn(),
    };
    routerMock = {
      navigate: jest.fn(),
    };

    service = new AuthService(httpClientMock, routerMock);
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('Initial State & Token Storage', () => {
    it('should initialize unauthenticated when storage is empty', () => {
      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
      expect(service.isAdmin()).toBe(false);
      expect(service.getAccessToken()).toBeNull();
      expect(service.getRefreshToken()).toBeNull();
      expect(service.getUserRole()).toBeNull();
    });

    it('should restore user and tokens from localStorage if present', () => {
      const mockUser = { id: 'u1', email: 'admin@enterprise.com', role: 'admin', firstName: 'Root', lastName: 'Admin' };
      localStorage.setItem('enter_chat_access_token', 'jwt-access-token');
      localStorage.setItem('enter_chat_refresh_token', 'jwt-refresh-token');
      localStorage.setItem('enter_chat_user', JSON.stringify(mockUser));

      const newService = new AuthService(httpClientMock, routerMock);
      expect(newService.getAccessToken()).toBe('jwt-access-token');
      expect(newService.getRefreshToken()).toBe('jwt-refresh-token');
      expect(newService.currentUser()?.email).toBe('admin@enterprise.com');
      expect(newService.isAdmin()).toBe(true);
      expect(newService.isAuthenticated()).toBe(true);
    });
  });

  describe('Login Flow', () => {
    it('should authenticate user and store tokens on success', (done) => {
      const mockUser = { id: 'u2', email: 'sarah@enterprise.com', role: UserRole.USER, firstName: 'Sarah', lastName: 'Al-Sayed' };
      const mockResponse = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        user: mockUser,
      };
      httpClientMock.post.mockReturnValue(of(mockResponse));

      service.login({ email: 'sarah@enterprise.com', password: 'Password123!' }).subscribe({
        next: (res) => {
          expect(res).toEqual(mockResponse);
          expect(service.isAuthenticated()).toBe(true);
          expect(service.currentUser()).toEqual(mockUser);
          expect(service.getUserRole()).toBe(UserRole.USER);
          expect(service.isAdmin()).toBe(false);
          expect(localStorage.getItem('syntra_chat_access_token')).toBe('access-token-123');
          expect(localStorage.getItem('syntra_chat_refresh_token')).toBe('refresh-token-456');
          done();
        },
      });
    });

    it('should recognize admin role correctly when logging in', (done) => {
      const mockAdmin = { id: 'admin1', email: 'admin@enterprise.com', role: 'admin', firstName: 'Root', lastName: 'Admin' };
      httpClientMock.post.mockReturnValue(of({ accessToken: 'admin-tok', refreshToken: 'admin-ref', user: mockAdmin }));

      service.login({ email: 'admin@enterprise.com', password: 'AdminPassword123!' }).subscribe({
        next: () => {
          expect(service.isAdmin()).toBe(true);
          expect(service.getUserRole()).toBe('admin');
          done();
        },
      });
    });

    it('should fail login and not store tokens on 401 Unauthorized', (done) => {
      httpClientMock.post.mockReturnValue(throwError(() => ({ status: 401, error: { message: 'Invalid email or password' } })));

      service.login({ email: 'wrong@test.local', password: 'Bad' }).subscribe({
        error: (err) => {
          expect(err.status).toBe(401);
          expect(service.isAuthenticated()).toBe(false);
          expect(localStorage.getItem('syntra_chat_access_token')).toBeNull();
          done();
        },
      });
    });

    it('should fail login on network failure', (done) => {
      httpClientMock.post.mockReturnValue(throwError(() => new Error('Connection refused')));

      service.login({ email: 'sarah@enterprise.com', password: 'Password123!' }).subscribe({
        error: (err) => {
          expect(err.message).toBe('Connection refused');
          expect(service.isAuthenticated()).toBe(false);
          done();
        },
      });
    });
  });

  describe('Logout Flow', () => {
    it('should clear stored credentials, reset state, post logout API, and redirect to /auth/login', () => {
      localStorage.setItem('syntra_chat_access_token', 'tok');
      localStorage.setItem('syntra_chat_refresh_token', 'ref');
      localStorage.setItem('syntra_chat_user', JSON.stringify({ id: 'u1', email: 'a@b.com' }));
      httpClientMock.post.mockReturnValue(of({}));

      service.logout();

      expect(localStorage.getItem('syntra_chat_access_token')).toBeNull();
      expect(localStorage.getItem('syntra_chat_refresh_token')).toBeNull();
      expect(localStorage.getItem('syntra_chat_user')).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/auth/login']);
    });
  });

  describe('Token Refresh Flow', () => {
    it('should update access token on successful refresh', (done) => {
      localStorage.setItem('syntra_chat_refresh_token', 'valid-refresh-token');
      httpClientMock.post.mockReturnValue(of({ accessToken: 'new-access-tok', refreshToken: 'new-refresh-tok' }));

      service.refreshToken().subscribe({
        next: (tokens) => {
          expect(tokens.accessToken).toBe('new-access-tok');
          expect(localStorage.getItem('syntra_chat_access_token')).toBe('new-access-tok');
          expect(localStorage.getItem('syntra_chat_refresh_token')).toBe('new-refresh-tok');
          done();
        },
      });
    });

    it('should trigger logout when refresh token is missing', (done) => {
      service.refreshToken().subscribe({
        error: (err) => {
          expect(err.message).toBe('No refresh token available');
          expect(routerMock.navigate).toHaveBeenCalledWith(['/auth/login']);
          done();
        },
      });
    });

    it('should trigger logout when refresh request fails with 401', (done) => {
      localStorage.setItem('syntra_chat_refresh_token', 'expired-refresh');
      httpClientMock.post.mockReturnValue(throwError(() => ({ status: 401 })));

      service.refreshToken().subscribe({
        error: (err) => {
          expect(err.status).toBe(401);
          expect(routerMock.navigate).toHaveBeenCalledWith(['/auth/login']);
          done();
        },
      });
    });
  });

  describe('User Profile Updates', () => {
    it('should update current user signal and localStorage', () => {
      const initialUser = { id: 'u1', email: 'test@local', firstName: 'Tariq', lastName: 'Khan', role: UserRole.USER };
      httpClientMock.post.mockReturnValue(of({ accessToken: 'a', refreshToken: 'r', user: initialUser }));

      service.login({ email: 'test@local', password: 'p' }).subscribe();

      service.updateCurrentUser({ firstName: 'Tariq-Updated' });
      expect(service.currentUser()?.firstName).toBe('Tariq-Updated');
      expect(JSON.parse(localStorage.getItem('syntra_chat_user') || '{}').firstName).toBe('Tariq-Updated');
    });
  });
});
