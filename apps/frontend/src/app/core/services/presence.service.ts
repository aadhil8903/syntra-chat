import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Subscription, interval } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PresenceService implements OnDestroy {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);

  private heartbeatSub: Subscription | null = null;
  private visibilityHandler: (() => void) | null = null;

  readonly isHeartbeatActive = signal(false);
  readonly onlineUsers = signal<Record<string, { isOnline: boolean; lastSeenAt?: string; lastSeenRelative?: string }>>({});

  constructor() {
    this.initHeartbeat();
  }

  updateUserPresence(userId: string, isOnline: boolean, lastSeenAt?: string): void {
    const current = { ...this.onlineUsers() };
    current[userId] = {
      isOnline,
      lastSeenAt: lastSeenAt || new Date().toISOString(),
      lastSeenRelative: isOnline ? 'Active now' : this.formatLastActive(lastSeenAt),
    };
    this.onlineUsers.set(current);
  }

  getPresence(userId?: string | null): { isOnline: boolean; lastSeenAt?: string; lastSeenRelative?: string } | null {
    if (!userId) return null;
    return this.onlineUsers()[userId] || null;
  }

  private isAuth(): boolean {
    if (typeof this.authService.isAuthenticated === 'function') {
      return this.authService.isAuthenticated();
    }
    if (typeof this.authService.currentUser === 'function') {
      return !!this.authService.currentUser();
    }
    return false;
  }

  private initHeartbeat(): void {
    if (typeof window === 'undefined') return;

    // Send immediate heartbeat if authenticated
    if (this.isAuth()) {
      this.sendHeartbeat();
    }

    // Interval every 60s
    this.heartbeatSub = interval(60000).subscribe(() => {
      if (this.isAuth() && document.visibilityState === 'visible') {
        this.sendHeartbeat();
      }
    });

    // Visibility change listener
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible' && this.isAuth()) {
        this.sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.isHeartbeatActive.set(true);
  }

  sendHeartbeat(): void {
    if (!this.isAuth()) return;
    if (typeof this.apiService.recordHeartbeat !== 'function') return;
    this.apiService.recordHeartbeat().subscribe({
      next: () => {},
      error: () => {},
    });
  }

  isUserOnline(presenceOrUser?: any): boolean {
    if (typeof presenceOrUser === 'boolean') return presenceOrUser;
    if (typeof presenceOrUser === 'object' && presenceOrUser !== null) {
      if ('isOnline' in presenceOrUser) return !!presenceOrUser.isOnline;
      if (presenceOrUser.presence && 'isOnline' in presenceOrUser.presence) {
        return !!presenceOrUser.presence.isOnline;
      }
    }
    return false;
  }

  formatLastActive(dateStr?: string | Date | null): string {
    if (!dateStr) return 'Never';
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) return 'Just now';

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} mins ago`;
    if (diffHr === 1) return '1 hour ago';
    if (diffHr < 24) return `${diffHr} hours ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  ngOnDestroy(): void {
    this.heartbeatSub?.unsubscribe();
    if (this.visibilityHandler && typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
  }
}
