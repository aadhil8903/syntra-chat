import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
  computed,
  OnChanges,
  SimpleChanges,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { IOrgMember } from '@enter-chat/shared-types';

@Component({
  selector: 'app-org-directory-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (isOpen) {
      <div
        class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
        role="dialog"
        aria-modal="true"
        (click)="close()"
      >
        <div
          class="w-full max-w-lg bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl overflow-hidden p-6 space-y-4 text-zinc-800 dark:text-zinc-200 animate-scale-up shadow-2xl flex flex-col max-h-[85vh]"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div class="flex items-center justify-between gap-3 border-b border-[#e7e9ed] dark:border-[#27272a] pb-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#f8f9fa] dark:bg-zinc-900 border border-[#dcdde1] dark:border-zinc-800 text-zinc-700 dark:text-zinc-200">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div class="min-w-0">
                <h3 class="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                  Organization Directory
                </h3>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  Find colleagues to start a direct message
                </p>
              </div>
            </div>

            <button
              (click)="close()"
              class="p-1 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Search Bar -->
          <div class="relative">
            <input
              type="text"
              [ngModel]="searchQuery()"
              (ngModelChange)="onSearchChange($event)"
              placeholder="Search by name or email..."
              class="w-full pl-9 pr-8 py-2 text-xs bg-[#f8f9fa] dark:bg-zinc-900 border border-[#dcdde1] dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-all"
              autofocus
            />
            <svg class="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            @if (searchQuery()) {
              <button
                (click)="onSearchChange('')"
                class="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            }
          </div>

          <!-- Members List -->
          <div class="flex-1 overflow-y-auto space-y-1.5 min-h-[220px] max-h-[360px] pr-1">
            @if (isLoading()) {
              <div class="flex flex-col items-center justify-center py-12 text-zinc-400 dark:text-zinc-500 space-y-2">
                <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span class="text-xs">Loading directory...</span>
              </div>
            } @else if (filteredMembers().length === 0) {
              <div class="flex flex-col items-center justify-center py-12 text-center text-zinc-400 dark:text-zinc-500 space-y-1.5">
                <svg class="w-7 h-7 stroke-1 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <p class="text-xs font-medium text-zinc-600 dark:text-zinc-400">No members found</p>
                <p class="text-[11px] text-zinc-400 dark:text-zinc-500">Try a different name or email search term</p>
              </div>
            } @else {
              @for (member of filteredMembers(); track member.id) {
                <div
                  class="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-[#e7e9ed] dark:border-[#27272a] hover:bg-[#f8f9fa] dark:hover:bg-zinc-900/60 transition-colors"
                >
                  <div class="flex items-center gap-2.5 min-w-0 flex-1">
                    <!-- Avatar with Presence Dot -->
                    <div class="relative flex-shrink-0">
                      <div class="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-xs font-medium uppercase border border-[#dcdde1] dark:border-zinc-700">
                        {{ getInitials(member) }}
                      </div>
                      <span
                        class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#111114]"
                        [ngClass]="member.presence?.isOnline ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'"
                        [title]="member.presence?.isOnline ? 'Online' : (member.presence?.lastSeenRelative || 'Offline')"
                      ></span>
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-xs font-medium text-zinc-900 dark:text-white truncate">
                          {{ member.firstName }} {{ member.lastName }}
                        </span>
                        @if (member.departments && member.departments.length > 0) {
                          <span class="px-1.5 py-0.2 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                            {{ member.departments[0] }}
                          </span>
                        }
                      </div>
                      <div class="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        <span class="truncate">{{ member.email }}</span>
                        <span>•</span>
                        <span [ngClass]="member.presence?.isOnline ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-zinc-400'">
                          {{ member.presence?.isOnline ? 'Online' : member.presence?.lastSeenRelative || 'Offline' }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      (click)="onStartMessage(member)"
                      class="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span>Message</span>
                    </button>
                  </div>
                </div>
              }
            }
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between pt-2 border-t border-[#e7e9ed] dark:border-[#27272a] text-xs text-zinc-500">
            <span>{{ filteredMembers().length }} organization member(s)</span>
            <button
              type="button"
              (click)="close()"
              class="px-3 py-1.5 rounded-lg border border-[#dcdde1] dark:border-[#27272a] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class OrgDirectoryModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Output() closeEvent = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @Output() startMessageEvent = new EventEmitter<IOrgMember>();
  @Output() messageMember = new EventEmitter<IOrgMember>();

  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly searchQuery = signal<string>('');
  readonly members = signal<IOrgMember[]>([]);
  readonly isLoading = signal<boolean>(false);

  readonly currentUserId = computed(() => this.auth.currentUser()?.id || '');

  readonly filteredMembers = computed(() => {
    const curId = this.currentUserId();
    return this.members().filter((m) => m.id !== curId);
  });

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) {
      this.close();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.searchQuery.set('');
      this.loadMembers('');
    }
  }

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
    this.loadMembers(query);
  }

  loadMembers(search: string): void {
    this.isLoading.set(true);
    this.api.getOrganizationMembers(search).subscribe({
      next: (data) => {
        this.members.set(data || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  onStartMessage(member: IOrgMember): void {
    this.startMessageEvent.emit(member);
    this.messageMember.emit(member);
    this.close();
  }

  close(): void {
    this.closeEvent.emit();
    this.closed.emit();
  }

  getInitials(member: IOrgMember): string {
    const f = member.firstName ? member.firstName[0] : '';
    const l = member.lastName ? member.lastName[0] : '';
    return (f + l).toUpperCase() || 'U';
  }
}
