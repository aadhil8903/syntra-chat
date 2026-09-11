import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceService } from '../../../core/services/presence.service';
import { IOrgMember, IUserPresence } from '@enter-chat/shared-types';

@Component({
  selector: 'app-user-profile-popover',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen && user) {
      <div
        class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
        (click)="close()"
      >
        <div
          class="w-full max-w-sm bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl overflow-hidden p-5 space-y-4 text-zinc-800 dark:text-zinc-200 animate-scale-up shadow-2xl"
          (click)="$event.stopPropagation()"
        >
          <!-- User header -->
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-zinc-200 text-zinc-900 border border-zinc-300 dark:bg-zinc-800 dark:text-white dark:border-zinc-700 flex items-center justify-center text-base font-semibold">
                {{ user.firstName.charAt(0) }}{{ user.lastName.charAt(0) }}
              </div>
              <div>
                <h4 class="text-sm font-semibold text-zinc-900 dark:text-white">
                  {{ user.firstName }} {{ user.lastName }}
                </h4>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                  {{ user.email }}
                </p>
              </div>
            </div>

            <button
              (click)="close()"
              class="p-1 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Presence details -->
          <div class="p-3 rounded-xl bg-[#f8f9fa] dark:bg-[#18181b] border border-[#e7e9ed] dark:border-[#27272a] space-y-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-zinc-500 dark:text-zinc-400">Status</span>
              <div class="flex items-center gap-1.5 font-medium">
                @if (user.presence?.isOnline) {
                  <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span class="text-emerald-600 dark:text-emerald-400">Online now</span>
                } @else {
                  <span class="w-2 h-2 rounded-full border border-zinc-400 dark:border-zinc-600"></span>
                  <span class="text-zinc-500 dark:text-zinc-400">
                    Last active {{ presenceService.formatLastActive(user.presence?.lastSeenAt) }}
                  </span>
                }
              </div>
            </div>

            @if (user.role) {
              <div class="flex items-center justify-between">
                <span class="text-zinc-500 dark:text-zinc-400">Role</span>
                <span class="text-zinc-800 dark:text-zinc-200 capitalize font-medium">
                  {{ user.role }}
                </span>
              </div>
            }

            @if (user.departments && user.departments.length > 0) {
              <div class="flex items-center justify-between">
                <span class="text-zinc-500 dark:text-zinc-400">Departments</span>
                <span class="text-zinc-800 dark:text-zinc-200 font-medium">
                  {{ user.departments.join(', ') }}
                </span>
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="flex justify-end pt-1">
            <button
              type="button"
              (click)="close()"
              class="px-4 py-1.5 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class UserProfilePopoverComponent {
  @Input() isOpen = false;
  @Input() user: IOrgMember | null = null;
  @Output() closed = new EventEmitter<void>();

  readonly presenceService = inject(PresenceService);

  close(): void {
    this.closed.emit();
  }
}
