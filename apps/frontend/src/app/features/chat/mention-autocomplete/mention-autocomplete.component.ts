import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  OnChanges,
  SimpleChanges,
  ElementRef,
  Inject,
  Optional,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IMentionOption, MentionResourceType } from '@enter-chat/shared-types';

export interface MentionGroup {
  title: string;
  items: IMentionOption[];
}

@Component({
  selector: 'app-mention-autocomplete',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    @if (isOpen) {
      <div
        class="absolute bottom-full left-0 mb-3 w-full sm:w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl overflow-hidden z-50 animate-fade-in shadow-2xl"
      >
        <!-- Header -->
        <div class="px-3 py-2.5 bg-[#f8f9fa] dark:bg-[#141417] border-b border-[#dcdde1] dark:border-[#27272a] flex items-center justify-between">
          <span class="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1">
            <span class="text-zinc-900 dark:text-white font-bold">&#64;</span>
            <span>Mention</span>
          </span>
          <span class="text-[10px] text-zinc-500 font-mono">
            {{ flatList.length }} result{{ flatList.length === 1 ? '' : 's' }}
          </span>
        </div>

        <!-- Options List Grouped by Section -->
        @if (flatList.length > 0) {
          <div class="max-h-64 overflow-y-auto p-1.5 space-y-2">
            @for (group of displayGroups; track group.title) {
              <div>
                <!-- Group Header -->
                <div class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {{ group.title }}
                </div>

                <!-- Group Items -->
                <ul class="space-y-0.5 mt-0.5">
                  @for (opt of group.items; track opt.id) {
                    <li
                      (click)="selectOption(opt)"
                      (mouseenter)="onItemHover(opt)"
                      [ngClass]="{
                        'bg-[#f0f1f3] text-zinc-900 dark:bg-[#1f1f23] dark:text-white': isSelected(opt)
                      }"
                      class="min-h-[40px] px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-[#f0f1f3] dark:hover:bg-[#18181b] transition-colors flex items-center justify-between gap-2.5"
                    >
                      <div class="flex items-center gap-2.5 min-w-0 flex-1">
                        @if (isAi(opt)) {
                          <div class="w-6 h-6 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 flex items-center justify-center text-[10px] font-bold flex-shrink-0 shadow-xs">
                            AI
                          </div>
                        } @else if (isUser(opt)) {
                          <div class="relative flex-shrink-0">
                            <div class="w-6 h-6 rounded-full bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 flex items-center justify-center text-xs font-semibold uppercase border border-[#dcdde1] dark:border-zinc-700">
                              {{ (opt.name || 'U')[0] }}
                            </div>
                            <span
                              class="absolute bottom-0 right-0 w-2 h-2 rounded-full ring-1 ring-white dark:ring-[#111114]"
                              [ngClass]="opt.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-400'"
                            ></span>
                          </div>
                        } @else if (isFolder(opt)) {
                          <div class="w-6 h-6 rounded-lg bg-[#f8f9fa] text-zinc-700 border border-[#dcdde1] dark:bg-[#18181b] dark:text-white dark:border-[#3f3f46] flex items-center justify-center flex-shrink-0">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                          </div>
                        } @else if (isDocument(opt)) {
                          <div class="w-6 h-6 rounded-lg bg-[#f8f9fa] text-zinc-700 border border-[#dcdde1] dark:bg-[#18181b] dark:text-white dark:border-[#3f3f46] flex items-center justify-center flex-shrink-0">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                        } @else {
                          <div class="w-6 h-6 rounded-lg bg-[#f8f9fa] text-zinc-700 border border-[#dcdde1] dark:bg-[#18181b] dark:text-white dark:border-[#3f3f46] flex items-center justify-center flex-shrink-0">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                            </svg>
                          </div>
                        }
                        <div class="truncate flex-1 min-w-0">
                          <div class="text-xs font-medium text-zinc-900 dark:text-white truncate max-w-[190px] sm:max-w-[240px]">{{ opt.name }}</div>
                          @if (opt.detail) {
                            <div class="text-[10px] text-zinc-500 dark:text-[#a1a1aa] truncate mt-0.5">{{ opt.detail }}</div>
                          }
                        </div>
                      </div>

                      <div class="flex items-center gap-1.5 flex-shrink-0">
                        <span class="text-[10px] font-mono uppercase text-zinc-500 dark:text-[#a1a1aa] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60">
                          {{ getBadge(opt) }}
                        </span>
                      </div>
                    </li>
                  }
                </ul>
              </div>
            }
          </div>
        } @else {
          <!-- Clean Empty State -->
          <div class="p-6 text-center space-y-2">
            <p class="text-xs font-medium text-zinc-900 dark:text-white">No matching results</p>
            <p class="text-[11px] text-zinc-500 dark:text-[#a1a1aa] max-w-[220px] mx-auto">
              No AI commands, files, or team members matched this mention.
            </p>
          </div>
        }

        <!-- Footer Navigation hint -->
        <div class="px-3 py-2 bg-[#f8f9fa] dark:bg-[#0c0c0e] border-t border-[#dcdde1] dark:border-[#27272a] text-[10px] text-zinc-500 dark:text-[#71717a] flex items-center justify-between">
          <span><kbd class="px-1.5 py-0.5 rounded-md bg-zinc-200 text-zinc-700 dark:bg-[#18181b] dark:text-zinc-300 font-mono">↑</kbd> <kbd class="px-1.5 py-0.5 rounded-md bg-zinc-200 text-zinc-700 dark:bg-[#18181b] dark:text-zinc-300 font-mono">↓</kbd> Navigate</span>
          <span><kbd class="px-1.5 py-0.5 rounded-md bg-zinc-200 text-zinc-700 dark:bg-[#18181b] dark:text-zinc-300 font-mono">Enter</kbd> Select</span>
          <span><kbd class="px-1.5 py-0.5 rounded-md bg-zinc-200 text-zinc-700 dark:bg-[#18181b] dark:text-zinc-300 font-mono">Esc</kbd> Close</span>
        </div>
      </div>
    }
  `,
})
export class MentionAutocompleteComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() options: IMentionOption[] = [];
  @Output() optionSelected = new EventEmitter<IMentionOption>();
  @Output() closed = new EventEmitter<void>();

  selectedIndex = 0;
  MentionResourceType = MentionResourceType;

  get displayGroups(): MentionGroup[] {
    const groups: MentionGroup[] = [];
    const ai = this.options.filter((o) => this.isAi(o));
    if (ai.length > 0) {
      groups.push({ title: 'AI ASSISTANT', items: ai });
    }
    const resources = this.options.filter((o) => this.isResource(o));
    if (resources.length > 0) {
      groups.push({ title: 'FILES & CONTEXT', items: resources });
    }
    const members = this.options.filter((o) => this.isUser(o));
    if (members.length > 0) {
      groups.push({ title: 'TEAM MEMBERS', items: members });
    }
    const categorized = new Set([...ai, ...resources, ...members]);
    const others = this.options.filter((o) => !categorized.has(o));
    if (others.length > 0) {
      groups.push({ title: 'OTHER', items: others });
    }
    return groups;
  }

  get flatList(): IMentionOption[] {
    return this.displayGroups.flatMap((g) => g.items);
  }

  get filteredOptions(): IMentionOption[] {
    return this.flatList;
  }

  isSelected(opt: IMentionOption): boolean {
    const current = this.flatList[this.selectedIndex];
    return current ? current.id === opt.id : false;
  }

  onItemHover(opt: IMentionOption): void {
    const idx = this.flatList.findIndex((o) => o.id === opt.id);
    if (idx !== -1) {
      this.selectedIndex = idx;
    }
  }

  isAi(opt: IMentionOption): boolean {
    return (opt.type as any) === 'ai' || opt.id === 'syntra-ai';
  }

  isUser(opt: IMentionOption): boolean {
    return (opt.type as any) === 'user' || (opt.type as any) === 'member';
  }

  isFolder(opt: IMentionOption): boolean {
    return opt.type === MentionResourceType.FOLDER || opt.id.startsWith('folder:');
  }

  isDocument(opt: IMentionOption): boolean {
    return opt.type === MentionResourceType.DOCUMENT;
  }

  isDataset(opt: IMentionOption): boolean {
    return opt.type === MentionResourceType.DATASET;
  }

  isResource(opt: IMentionOption): boolean {
    return this.isFolder(opt) || this.isDocument(opt) || this.isDataset(opt);
  }

  getBadge(opt: IMentionOption): string {
    if (this.isAi(opt)) return 'AI';
    if (this.isUser(opt)) return opt.status === 'online' ? 'Online' : 'Offline';
    if (this.isFolder(opt)) return 'Folder';
    if (this.isDataset(opt)) return (opt.fileType || 'DATA').toUpperCase();
    return (opt.fileType || 'DOC').toUpperCase();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options'] || changes['isOpen']) {
      this.selectedIndex = 0;
    }
  }

  selectOption(opt: IMentionOption): void {
    this.optionSelected.emit(opt);
  }

  constructor(@Optional() @Inject(ElementRef) private readonly elementRef?: ElementRef) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;

    const target = event.target as HTMLElement;
    if (!target) return;

    if (this.elementRef?.nativeElement) {
      if (!this.elementRef.nativeElement.contains(target)) {
        this.closed.emit();
      }
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.isOpen) return;

    const list = this.flatList;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (list.length > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % list.length;
        this.scrollToSelected();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.length > 0) {
        this.selectedIndex = (this.selectedIndex - 1 + list.length) % list.length;
        this.scrollToSelected();
      }
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      if (list.length > 0 && list[this.selectedIndex]) {
        event.preventDefault();
        this.selectOption(list[this.selectedIndex]);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
    }
  }

  private scrollToSelected(): void {
    if (typeof document === 'undefined') return;
    setTimeout(() => {
      const selectedEl = this.elementRef?.nativeElement?.querySelector('li.bg-\\[\\#f0f1f3\\], li.dark\\:bg-\\[\\#1f1f23\\]') as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 0);
  }
}

