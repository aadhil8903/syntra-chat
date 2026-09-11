import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { INotification } from '@enter-chat/shared-types';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private apiService = inject(ApiService);

  readonly notifications = signal<INotification[]>([]);
  readonly unreadCount = signal<number>(0);
  readonly activeToast = signal<INotification | null>(null);

  private toastTimeout: any = null;

  fetchNotifications(limit = 20): void {
    if (typeof this.apiService.getNotifications !== 'function') return;
    this.apiService.getNotifications(limit).subscribe({
      next: (list) => {
        this.notifications.set(list);
      },
      error: () => {},
    });
    this.fetchUnreadCount();
  }

  fetchUnreadCount(): void {
    if (typeof this.apiService.getUnreadNotificationCount !== 'function') return;
    this.apiService.getUnreadNotificationCount().subscribe({
      next: (res) => {
        this.unreadCount.set(res.count);
      },
      error: () => {},
    });
  }

  markAsRead(id: string): void {
    this.apiService.markNotificationAsRead(id).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      },
      error: () => {},
    });
  }

  markAllAsRead(): void {
    this.apiService.markAllNotificationsAsRead().subscribe({
      next: () => {
        this.notifications.update((list) => list.map((n) => ({ ...n, isRead: true })));
        this.unreadCount.set(0);
      },
      error: () => {},
    });
  }

  showToast(notification: INotification): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.activeToast.set(notification);
    this.toastTimeout = setTimeout(() => {
      this.activeToast.set(null);
    }, 6000);
  }

  dismissToast(): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.activeToast.set(null);
  }
}
