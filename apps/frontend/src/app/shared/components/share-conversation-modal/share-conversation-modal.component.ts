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
import { SharingService } from '../../../core/services/sharing.service';
import { PresenceService } from '../../../core/services/presence.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  IConversation,
  IConversationShare,
  IOrgMember,
  SharePermission,
} from '@enter-chat/shared-types';

@Component({
  selector: 'app-share-conversation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (isOpen && conversation) {
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
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <div class="min-w-0">
                <h3 class="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                  Share "{{ conversation.title }}"
                </h3>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  Collaborate with team members in real time
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

          <!-- Tabs (if Owner) -->
          @if (isOwner) {
            <div class="flex items-center gap-1 border-b border-[#e7e9ed] dark:border-[#27272a] pb-2 text-xs font-medium">
              <button
                type="button"
                (click)="activeTab.set('share')"
                [class.text-zinc-900]="activeTab() === 'share'"
                [class.dark:text-white]="activeTab() === 'share'"
                [class.border-b-2]="activeTab() === 'share'"
                [class.border-zinc-900]="activeTab() === 'share'"
                [class.dark:border-white]="activeTab() === 'share'"
                [class.text-zinc-500]="activeTab() !== 'share'"
                [class.dark:text-zinc-400]="activeTab() !== 'share'"
                class="px-3 py-1.5 transition-colors -mb-[9px]"
              >
                Share with people
              </button>
              <button
                type="button"
                (click)="activeTab.set('manage')"
                [class.text-zinc-900]="activeTab() === 'manage'"
                [class.dark:text-white]="activeTab() === 'manage'"
                [class.border-b-2]="activeTab() === 'manage'"
                [class.border-zinc-900]="activeTab() === 'manage'"
                [class.dark:border-white]="activeTab() === 'manage'"
                [class.text-zinc-500]="activeTab() !== 'manage'"
                [class.dark:text-zinc-400]="activeTab() !== 'manage'"
                class="px-3 py-1.5 transition-colors -mb-[9px] flex items-center gap-1.5"
              >
                <span>Manage access</span>
                @if (existingShares().length > 0) {
                  <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    {{ existingShares().length }}
                  </span>
                }
              </button>
            </div>
          }

          <!-- TAB 1: Share with People -->
          @if (activeTab() === 'share') {
            <div class="space-y-3.5 flex-1 overflow-y-auto pr-1">
              <!-- Search and Filter -->
              <div>
                <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Select organization members
                </label>
                <div class="relative">
                  <input
                    type="text"
                    [(ngModel)]="searchQuery"
                    (input)="onSearchInput()"
                    placeholder="Search by name or email..."
                    class="w-full px-3 py-2 bg-[#f8f9fa] dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] focus:border-zinc-900 dark:focus:border-white focus:outline-none rounded-xl text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-colors"
                  />
                  @if (isLoadingMembers()) {
                    <div class="absolute right-3 top-2.5">
                      <div class="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  }
                </div>
              </div>

              <!-- Permission selector -->
              <div class="flex items-center justify-between gap-3 p-3 bg-[#f8f9fa] dark:bg-[#18181b] border border-[#e7e9ed] dark:border-[#27272a] rounded-xl">
                <div>
                  <span class="text-xs font-medium text-zinc-900 dark:text-white block">Permission level</span>
                  <span class="text-[11px] text-zinc-500 dark:text-zinc-400 block">
                    {{ selectedPermission === 'contribute' ? 'Collaborators can send messages and interact with AI.' : 'Collaborators can only read conversation history.' }}
                  </span>
                </div>
                <select
                  [(ngModel)]="selectedPermission"
                  class="px-2.5 py-1.5 bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-lg text-xs font-medium text-zinc-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  <option value="view">Can view</option>
                  <option value="contribute">Can contribute</option>
                </select>
              </div>

              <!-- Members List -->
              <div class="border border-[#e7e9ed] dark:border-[#27272a] rounded-xl divide-y divide-[#e7e9ed] dark:divide-[#27272a] max-h-56 overflow-y-auto">
                @for (member of availableMembers(); track member.id) {
                  <div
                    (click)="toggleMember(member.id)"
                    class="flex items-center justify-between p-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer transition-colors"
                    [class.bg-zinc-100]="isMemberSelected(member.id)"
                    [class.dark:bg-zinc-900]="isMemberSelected(member.id)"
                  >
                    <div class="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        [checked]="isMemberSelected(member.id)"
                        (click)="$event.stopPropagation()"
                        (change)="toggleMember(member.id)"
                        class="rounded border-[#dcdde1] dark:border-zinc-700 text-zinc-900 focus:ring-0 cursor-pointer"
                      />
                      <div class="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex-shrink-0">
                        {{ member.firstName.charAt(0) }}{{ member.lastName.charAt(0) }}
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="text-xs font-medium text-zinc-900 dark:text-white truncate">
                            {{ member.firstName }} {{ member.lastName }}
                          </span>
                          @if (member.id === currentUserId) {
                            <span class="text-[10px] text-zinc-400">(You)</span>
                          }
                        </div>
                        <span class="text-[11px] text-zinc-500 dark:text-zinc-400 truncate block">
                          {{ member.email }}
                        </span>
                      </div>
                    </div>

                    <!-- Presence status badge -->
                    <div class="flex items-center gap-1.5 flex-shrink-0">
                      @if (member.presence?.isOnline) {
                        <span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                          Online
                        </span>
                      } @else {
                        <span class="inline-flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                          <span class="w-2 h-2 rounded-full border border-zinc-400 dark:border-zinc-600"></span>
                          {{ presenceService.formatLastActive(member.presence?.lastSeenAt) }}
                        </span>
                      }
                    </div>
                  </div>
                } @empty {
                  <div class="p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                    No members found matching your search.
                  </div>
                }
              </div>

              @if (errorMessage()) {
                <div class="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                  {{ errorMessage() }}
                </div>
              }

              @if (successMessage()) {
                <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
                  {{ successMessage() }}
                </div>
              }
            </div>

            <!-- Footer Actions -->
            <div class="flex items-center justify-between gap-2 pt-3 border-t border-[#e7e9ed] dark:border-[#27272a]">
              <span class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ selectedUserIds().length }} selected
              </span>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  (click)="close()"
                  class="px-3.5 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-700 hover:text-zinc-900 dark:bg-[#18181b] dark:hover:bg-[#27272a] text-xs font-medium dark:text-zinc-300 dark:hover:text-white transition-colors border border-[#dcdde1] dark:border-[#27272a]"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  (click)="submitShare()"
                  [disabled]="selectedUserIds().length === 0 || isSubmitting()"
                  class="px-4 py-1.5 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black transition-colors flex items-center gap-1.5"
                >
                  @if (isSubmitting()) {
                    <div class="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  }
                  <span>Share</span>
                </button>
              </div>
            </div>
          }

          <!-- TAB 2: Manage Access (Owner Only) -->
          @if (activeTab() === 'manage') {
            <div class="space-y-3 flex-1 overflow-y-auto pr-1">
              <div class="text-xs text-zinc-500 dark:text-zinc-400">
                Manage members with active access to this conversation.
              </div>

              <div class="border border-[#e7e9ed] dark:border-[#27272a] rounded-xl divide-y divide-[#e7e9ed] dark:divide-[#27272a]">
                <!-- Owner Entry -->
                <div class="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/30">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-7 h-7 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      You
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="text-xs font-semibold text-zinc-900 dark:text-white">You</span>
                        <span class="text-[10px] px-1.5 py-0.2 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded font-medium">Owner</span>
                      </div>
                      <span class="text-[11px] text-zinc-500 dark:text-zinc-400 block truncate">
                        Full management permissions
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Shared Members -->
                @for (share of existingShares(); track share.id) {
                  <div class="flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex-shrink-0">
                        {{ share.sharedWithUser?.firstName?.charAt(0) || 'U' }}{{ share.sharedWithUser?.lastName?.charAt(0) || '' }}
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="text-xs font-medium text-zinc-900 dark:text-white truncate">
                            {{ share.sharedWithUser?.firstName }} {{ share.sharedWithUser?.lastName }}
                          </span>
                          @if (share.sharedWithUser?.presence?.isOnline) {
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="Online"></span>
                          }
                        </div>
                        <span class="text-[11px] text-zinc-500 dark:text-zinc-400 block truncate">
                          {{ share.sharedWithUser?.email }}
                        </span>
                      </div>
                    </div>

                    <!-- Actions: Permission dropdown + Remove button -->
                    <div class="flex items-center gap-2 flex-shrink-0">
                      @if (confirmingRevokeId() === share.sharedWithUserId) {
                        <div class="flex items-center gap-1">
                          <button
                            type="button"
                            (click)="executeRevoke(share.sharedWithUserId)"
                            class="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-medium transition-colors"
                          >
                            Confirm Remove
                          </button>
                          <button
                            type="button"
                            (click)="confirmingRevokeId.set(null)"
                            class="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded text-[11px] hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      } @else {
                        <select
                          [ngModel]="share.permission"
                          (ngModelChange)="onUpdatePermission(share.sharedWithUserId, $event)"
                          class="px-2 py-1 bg-[#f8f9fa] dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none cursor-pointer"
                        >
                          <option value="view">Can view</option>
                          <option value="contribute">Can contribute</option>
                        </select>

                        <button
                          type="button"
                          (click)="confirmingRevokeId.set(share.sharedWithUserId)"
                          title="Revoke access"
                          class="p-1 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        >
                          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      }
                    </div>
                  </div>
                } @empty {
                  <div class="p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                    This conversation has not been shared with anyone yet.
                  </div>
                }
              </div>
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-end pt-3 border-t border-[#e7e9ed] dark:border-[#27272a]">
              <button
                type="button"
                (click)="close()"
                class="px-4 py-1.5 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black transition-colors"
              >
                Done
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class ShareConversationModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() conversation: IConversation | null = null;
  @Input() isOwner = true;

  @Output() closed = new EventEmitter<void>();
  @Output() sharesUpdated = new EventEmitter<void>();

  private sharingService = inject(SharingService);
  readonly presenceService = inject(PresenceService);
  private authService = inject(AuthService);

  readonly activeTab = signal<'share' | 'manage'>('share');
  readonly availableMembers = signal<IOrgMember[]>([]);
  readonly existingShares = signal<IConversationShare[]>([]);
  readonly selectedUserIds = signal<string[]>([]);
  readonly isLoadingMembers = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly confirmingRevokeId = signal<string | null>(null);

  selectedPermission: SharePermission = 'view';
  searchQuery = '';

  get currentUserId(): string {
    return this.authService.currentUser()?.id || '';
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.isOpen) {
      this.close();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.resetModal();
      this.loadData();
    }
  }

  resetModal(): void {
    this.activeTab.set('share');
    this.selectedUserIds.set([]);
    this.selectedPermission = 'view';
    this.searchQuery = '';
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.confirmingRevokeId.set(null);
  }

  loadData(): void {
    if (!this.conversation) return;
    this.loadMembers();
    if (this.isOwner) {
      this.loadShares();
    }
  }

  loadMembers(): void {
    this.isLoadingMembers.set(true);
    this.sharingService.getOrganizationMembers(this.searchQuery).subscribe({
      next: (members) => {
        // Filter out current user
        this.availableMembers.set(members.filter((m) => m.id !== this.currentUserId));
        this.isLoadingMembers.set(false);
      },
      error: () => {
        this.isLoadingMembers.set(false);
      },
    });
  }

  loadShares(): void {
    if (!this.conversation?.id) return;
    this.sharingService.getConversationShares(this.conversation.id).subscribe({
      next: (shares) => {
        this.existingShares.set(shares);
      },
      error: () => {},
    });
  }

  onSearchInput(): void {
    this.loadMembers();
  }

  isMemberSelected(userId: string): boolean {
    return this.selectedUserIds().includes(userId);
  }

  toggleMember(userId: string): void {
    const current = [...this.selectedUserIds()];
    const index = current.indexOf(userId);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(userId);
    }
    this.selectedUserIds.set(current);
  }

  submitShare(): void {
    if (!this.conversation?.id || this.selectedUserIds().length === 0) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.sharingService
      .shareConversation(this.conversation.id, {
        userIds: this.selectedUserIds(),
        permission: this.selectedPermission,
      })
      .subscribe({
        next: (shares) => {
          this.isSubmitting.set(false);
          this.existingShares.set(shares);
          this.successMessage.set('Conversation shared successfully!');
          this.selectedUserIds.set([]);
          this.sharesUpdated.emit();
          setTimeout(() => {
            this.successMessage.set(null);
            if (this.isOwner) {
              this.activeTab.set('manage');
            } else {
              this.close();
            }
          }, 1000);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(
            err.error?.message || err.message || 'Failed to share conversation.',
          );
        },
      });
  }

  onUpdatePermission(targetUserId: string, permission: SharePermission): void {
    if (!this.conversation?.id) return;

    this.sharingService
      .updateSharePermission(this.conversation.id, targetUserId, { permission })
      .subscribe({
        next: (updated) => {
          this.existingShares.update((list) =>
            list.map((s) => (s.sharedWithUserId === targetUserId ? updated : s)),
          );
          this.sharesUpdated.emit();
        },
        error: (err) => {
          this.errorMessage.set(
            err.error?.message || err.message || 'Failed to update permission.',
          );
        },
      });
  }

  executeRevoke(targetUserId: string): void {
    if (!this.conversation?.id) return;

    this.sharingService.revokeShare(this.conversation.id, targetUserId).subscribe({
      next: () => {
        this.existingShares.update((list) =>
          list.filter((s) => s.sharedWithUserId !== targetUserId),
        );
        this.confirmingRevokeId.set(null);
        this.sharesUpdated.emit();
      },
      error: (err) => {
        this.errorMessage.set(
          err.error?.message || err.message || 'Failed to revoke access.',
        );
      },
    });
  }

  close(): void {
    this.closed.emit();
  }
}
