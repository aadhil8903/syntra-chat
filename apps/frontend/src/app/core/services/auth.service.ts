import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of, throwError } from 'rxjs';
import { IUser, ILoginDto, IAuthResponse, APP_CONFIG } from '@enter-chat/shared-types';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly baseUrl = 'http://localhost:3000/api/auth';
  private readonly TOKEN_KEY = `${APP_CONFIG.storagePrefix}_access_token`;
  private readonly REFRESH_KEY = `${APP_CONFIG.storagePrefix}_refresh_token`;
  private readonly USER_KEY = `${APP_CONFIG.storagePrefix}_user`;

  private currentUserSignal = signal<IUser | null>(this.getStoredUser());
  readonly currentUser = computed(() => this.currentUserSignal());
  readonly isAuthenticated = computed(() => !!this.currentUserSignal());
  readonly isAdmin = computed(() => this.currentUserSignal()?.role === 'admin');

  getUserRole(): string | null {
    const user = this.currentUserSignal();
    return user ? user.role : null;
  }

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {}

  private getStoredUser(): IUser | null {
    const raw = localStorage.getItem(this.USER_KEY) || localStorage.getItem('enter_chat_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY) || localStorage.getItem('enter_chat_access_token');
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_KEY) || localStorage.getItem('enter_chat_refresh_token');
  }

  login(dto: ILoginDto): Observable<IAuthResponse> {
    return this.http.post<IAuthResponse>(`${this.baseUrl}/login`, dto).pipe(
      tap((res) => this.handleAuthSuccess(res)),
    );
  }

  refreshToken(): Observable<{ accessToken: string; refreshToken: string }> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.logout();
      return throwError(() => new Error('No refresh token available'));
    }

    return this.http
      .post<{ accessToken: string; refreshToken: string }>(`${this.baseUrl}/refresh`, { refreshToken })
      .pipe(
        tap((tokens) => {
          localStorage.setItem(this.TOKEN_KEY, tokens.accessToken);
          localStorage.setItem(this.REFRESH_KEY, tokens.refreshToken);
        }),
        catchError((err) => {
          this.logout();
          return throwError(() => err);
        }),
      );
  }

  logout(): void {
    const token = this.getAccessToken();
    if (token) {
      this.http.post(`${this.baseUrl}/logout`, {}).subscribe({
        error: () => {},
      });
    }
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem('enter_chat_access_token');
    localStorage.removeItem('enter_chat_refresh_token');
    localStorage.removeItem('enter_chat_user');
    localStorage.removeItem('syntra_chat_walkthrough_completed');
    this.currentUserSignal.set(null);
    this.router.navigate(['/auth/login']);
  }

  private handleAuthSuccess(res: IAuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, res.accessToken);
    localStorage.setItem(this.REFRESH_KEY, res.refreshToken);
    localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
    this.currentUserSignal.set(res.user);
  }

  updateCurrentUser(partial: Partial<IUser>): void {
    const current = this.currentUserSignal();
    if (current) {
      const updated = { ...current, ...partial };
      localStorage.setItem(this.USER_KEY, JSON.stringify(updated));
      this.currentUserSignal.set(updated);
    }
  }
}

