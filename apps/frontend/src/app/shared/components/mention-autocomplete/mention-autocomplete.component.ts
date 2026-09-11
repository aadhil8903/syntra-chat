import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  HostListener,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IOrgMember, IMention } from '@enter-chat/shared-types';

export interface MentionItem {
  type: 'ai' | 'user';
  id: string;
  name: string;
  subtitle?: string;
  member?: IOrgMember;
}

@Component({
  selector: 'app-mention-autocomplete',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen && allItems().length > 0) {
      <div
        class="absolute bottom-full mb-2 left-0 w-80 max-h-64 overflow-y-auto bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-xl shadow-xl z-[50] p-1.5 space-y-1 text-xs text-zinc-800 dark:text-zinc-200 animate-scale-up"
      >
        <!-- AI Invocation Section -->
        @if (showAi()) {
          <div class="px-2 py-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
            AI Assistant
          </div>
          <button
            type="button"
            (click)="selectItem(aiItem)"
            [class.bg-zinc-100]="selectedIndex() === 0"
            [class.dark:bg-zinc-800]="selectedIndex() === 0"
            class="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-6 h-6 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                AI
              </div>
              <div class="min-w-0">
                <div class="font-medium text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <span>Syntra AI</span>
                  <span class="px-1.5 py-0.2 rounded text-[9px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    &#64;Syntra
                  </span>
                </div>
                <div class="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                  Ask Syntra AI inside this conversation
                </div>
              </div>
            </div>
          </button>
        }

        <!-- Organization Members Section -->
        @if (memberItems().length > 0) {
          <div class="px-2 py-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
            People
          </div>
          @for (item of memberItems(); track item.id; let idx = $index) {
            <button
              type="button"
              (click)="selectItem(item)"
              [class.bg-zinc-100]="selectedIndex() === (showAi() ? idx + 1 : idx)"
              [class.dark:bg-zinc-800]="selectedIndex() === (showAi() ? idx + 1 : idx)"
              class="w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <div class="flex items-center gap-2 min-w-0">
                <!-- Avatar with Presence Dot -->
                <div class="relative flex-shrink-0">
                  <div class="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-[10px] font-medium border border-[#dcdde1] dark:border-zinc-700">
                    {{ getInitials(item.member) }}
                  </div>
                  <span
                    class="absolute bottom-0 right-0 w-2 h-2 rounded-full ring-1 ring-white dark:ring-[#111114]"
                    [ngClass]="item.member?.presence?.isOnline ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'"
                  ></span>
                </div>

                <div class="min-w-0">
                  <div class="font-medium text-zinc-900 dark:text-white truncate">
                    {{ item.name }}
                  </div>
                  <div class="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                    {{ item.subtitle }}
                  </div>
                </div>
              </div>

              @if (item.member?.presence?.isOnline) {
                <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex-shrink-0">
                  Online
                </span>
              }
            </button>
          }
        }
      </div>
    }
  `,
})
export class MentionAutocompleteComponent {
  @Input() isOpen = false;
  @Input() query = '';
  @Input() members: IOrgMember[] = [];
  @Output() selectMention = new EventEmitter<IMention>();
  @Output() closeEvent = new EventEmitter<void>();

  readonly selectedIndex = signal<number>(0);

  readonly aiItem: MentionItem = {
    type: 'ai',
    id: 'syntra',
    name: 'Syntra',
    subtitle: 'Ask Syntra AI',
  };

  readonly showAi = computed(() => {
    const q = this.query.toLowerCase().trim();
    if (!q) return true;
    return 'syntra'.includes(q) || 'ai'.includes(q) || 'syntra ai'.includes(q);
  });

  readonly memberItems = computed<MentionItem[]>(() => {
    const q = this.query.toLowerCase().trim();
    return this.members
      .filter((m) => {
        if (!q) return true;
        const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
        return fullName.includes(q) || m.email.toLowerCase().includes(q);
      })
      .slice(0, 8)
      .map((m) => ({
        type: 'user' as const,
        id: m.id,
        name: `${m.firstName} ${m.lastName}`,
        subtitle: m.email,
        member: m,
      }));
  });

  readonly allItems = computed<MentionItem[]>(() => {
    const items: MentionItem[] = [];
    if (this.showAi()) {
      items.push(this.aiItem);
    }
    items.push(...this.memberItems());
    return items;
  });

  selectItem(item: MentionItem): void {
    this.selectMention.emit({
      type: item.type,
      id: item.id,
      name: item.name,
    });
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.isOpen) return false;

    const items = this.allItems();
    if (items.length === 0) return false;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex.update((i) => (i + 1) % items.length);
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex.update((i) => (i - 1 + items.length) % items.length);
      return true;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const current = items[this.selectedIndex()];
      if (current) {
        this.selectItem(current);
      }
      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeEvent.emit();
      return true;
    }

    return false;
  }

  getInitials(member?: IOrgMember): string {
    if (!member) return 'U';
    const f = member.firstName ? member.firstName[0] : '';
    const l = member.lastName ? member.lastName[0] : '';
    return (f + l).toUpperCase() || 'U';
  }
}
