import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { HttpRequest, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

describe('authInterceptor', () => {
  let authServiceMock: any;

  beforeEach(() => {
    authServiceMock = {
      getAccessToken: jest.fn(),
      logout: jest.fn(),
      refreshToken: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
      ],
    });
  });

  it('should attach Bearer token to outgoing API requests when token is present', (done) => {
    authServiceMock.getAccessToken.mockReturnValue('jwt-sample-token-xyz');
    const req = new HttpRequest('GET', 'http://localhost:3000/api/documents');
    
    const nextHandler = (clonedReq: HttpRequest<any>) => {
      expect(clonedReq.headers.get('Authorization')).toBe('Bearer jwt-sample-token-xyz');
      return of(new HttpResponse({ status: 200 }));
    };

    TestBed.runInInjectionContext(() => {
      authInterceptor(req, nextHandler).subscribe({
        next: () => done(),
      });
    });
  });

  it('should NOT attach Authorization header for /auth/login or /auth/register', (done) => {
    authServiceMock.getAccessToken.mockReturnValue('jwt-sample-token-xyz');
    const req = new HttpRequest('POST', 'http://localhost:3000/api/auth/login', {});

    const nextHandler = (clonedReq: HttpRequest<any>) => {
      expect(clonedReq.headers.has('Authorization')).toBe(false);
      return of(new HttpResponse({ status: 200 }));
    };

    TestBed.runInInjectionContext(() => {
      authInterceptor(req, nextHandler).subscribe({
        next: () => done(),
      });
    });
  });

  it('should attempt token refresh on 401 Unauthorized response and retry request', (done) => {
    authServiceMock.getAccessToken.mockReturnValue('expired-access-token');
    authServiceMock.refreshToken.mockReturnValue(of({ accessToken: 'fresh-access-token', refreshToken: 'fresh-refresh' }));

    const req = new HttpRequest('GET', 'http://localhost:3000/api/conversations');
    let callCount = 0;

    const nextHandler = (incomingReq: HttpRequest<any>) => {
      callCount++;
      if (callCount === 1) {
        return throwError(() => new HttpErrorResponse({ status: 401, error: { message: 'Token expired' } }));
      }
      expect(incomingReq.headers.get('Authorization')).toBe('Bearer fresh-access-token');
      return of(new HttpResponse({ status: 200, body: [{ id: '1' }] }));
    };

    TestBed.runInInjectionContext(() => {
      authInterceptor(req, nextHandler).subscribe({
        next: (res: any) => {
          expect(res.status).toBe(200);
          expect(authServiceMock.refreshToken).toHaveBeenCalled();
          done();
        },
      });
    });
  });
});
