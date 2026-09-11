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

@Component({
  selector: 'app-mention-autocomplete',
  standalone: true,
  imports: [CommonModule, RouterModule], 
  template: `
    @if (isOpen) {
      <div
        class="absolute bottom-full left-0 mb-3 w-full sm:w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl overflow-hidden z-50 animate-fade-in shadow-2xl"
      >
        <!-- Header & Tabs -->
        <div class="p-2.5 sm:p-3 bg-[#f8f9fa] dark:bg-[#141417] border-b border-[#dcdde1] dark:border-[#27272a] flex items-center justify-between gap-1 flex-wrap">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1">
              <span class="text-zinc-900 dark:text-white font-bold">&#64;</span>
              <span>Mention</span>
            </span>
          </div>
          <div class="flex items-center gap-1 text-[11px] flex-wrap">
            <button
              (click)="activeTab = 'all'"
              [ngClass]="activeTab === 'all' ? 'bg-zinc-900 text-white dark:bg-white dark:text-black font-semibold shadow-2xs' : 'text-zinc-600 hover:text-zinc-900 dark:text-[#a1a1aa] dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-[#1f1f23]'"
              class="min-h-[30px] px-2.5 py-1 rounded-xl transition-colors"
            >
              All ({{ options.length }})
            </button>
            <button
              (click)="activeTab = 'folders'"
              [ngClass]="activeTab === 'folders' ? 'bg-zinc-900 text-white dark:bg-white dark:text-black font-semibold shadow-2xs' : 'text-zinc-600 hover:text-zinc-900 dark:text-[#a1a1aa] dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-[#1f1f23]'"
              class="min-h-[30px] px-2.5 py-1 rounded-xl transition-colors"
            >
              Folders
            </button>
            <button
              (click)="activeTab = 'docs'"
              [ngClass]="activeTab === 'docs' ? 'bg-zinc-900 text-white dark:bg-white dark:text-black font-semibold shadow-2xs' : 'text-zinc-600 hover:text-zinc-900 dark:text-[#a1a1aa] dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-[#1f1f23]'"
              class="min-h-[30px] px-2.5 py-1 rounded-xl transition-colors"
            >
              Docs
            </button>
            <button
              (click)="activeTab = 'data'"
              [ngClass]="activeTab === 'data' ? 'bg-zinc-900 text-white dark:bg-white dark:text-black font-semibold shadow-2xs' : 'text-zinc-600 hover:text-zinc-900 dark:text-[#a1a1aa] dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-[#1f1f23]'"
              class="min-h-[30px] px-2.5 py-1 rounded-xl transition-colors"
            >
              Datasets
            </button>
          </div>
        </div>

        <!-- Options List -->
        @if (filteredOptions.length > 0) {
          <ul class="max-h-64 overflow-y-auto divide-y divide-[#e7e9ed] dark:divide-[#27272a] p-1.5">
            @for (opt of filteredOptions; track opt.id; let idx = $index) {
              <li
                (click)="selectOption(opt)"
                (mouseenter)="selectedIndex = idx"
                [ngClass]="{ 'bg-[#f0f1f3] text-zinc-900 dark:bg-[#1f1f23] dark:text-white': selectedIndex === idx }"
                class="min-h-[44px] px-3 py-2 rounded-xl cursor-pointer hover:bg-[#f0f1f3] dark:hover:bg-[#18181b] transition-colors flex items-center justify-between gap-2.5"
              >
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                  @if (isAi(opt)) {
                    <div class="w-7 h-7 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 flex items-center justify-center text-[10px] font-bold flex-shrink-0 shadow-xs">
                      AI
                    </div>
                  } @else if (isUser(opt)) {
                    <div class="relative flex-shrink-0">
                      <div class="w-7 h-7 rounded-full bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 flex items-center justify-center text-xs font-semibold uppercase border border-[#dcdde1] dark:border-zinc-700">
                        {{ (opt.name || 'U')[0] }}
                      </div>
                      <span
                        class="absolute bottom-0 right-0 w-2 h-2 rounded-full ring-1 ring-white dark:ring-[#111114]"
                        [ngClass]="opt.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-400'"
                      ></span>
                    </div>
                  } @else if (isFolder(opt)) {
                    <div class="w-7 h-7 rounded-xl bg-[#f8f9fa] text-zinc-700 border border-[#dcdde1] dark:bg-[#18181b] dark:text-white dark:border-[#3f3f46] flex items-center justify-center flex-shrink-0">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                  } @else if (isDocument(opt)) {
                    <div class="w-7 h-7 rounded-xl bg-[#f8f9fa] text-zinc-700 border border-[#dcdde1] dark:bg-[#18181b] dark:text-white dark:border-[#3f3f46] flex items-center justify-center flex-shrink-0">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  } @else {
                    <div class="w-7 h-7 rounded-xl bg-[#f8f9fa] text-zinc-700 border border-[#dcdde1] dark:bg-[#18181b] dark:text-white dark:border-[#3f3f46] flex items-center justify-center flex-shrink-0">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                    </div>
                  }
                  <div class="truncate flex-1 min-w-0">
                    <div class="text-xs font-medium text-zinc-900 dark:text-white truncate max-w-[170px] sm:max-w-[230px]">{{ opt.name }}</div>
                    @if (opt.detail) {
                      <div class="text-[10px] text-zinc-500 dark:text-[#a1a1aa] truncate mt-0.5">{{ opt.detail }}</div>
                    }
                  </div>
                </div>

                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <span class="text-[11px] font-mono uppercase text-zinc-500 dark:text-[#a1a1aa]">
                    {{ getBadge(opt) }}
                  </span>
                </div>
              </li>
            }
          </ul>
        } @else {
          <!-- Empty State with guidance -->
          <div class="p-6 text-center space-y-3">
            <div class="w-10 h-10 rounded-2xl bg-[#f8f9fa] text-zinc-500 border border-[#dcdde1] dark:bg-[#18181b] dark:text-[#a1a1aa] dark:border-[#27272a] mx-auto flex items-center justify-center">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h5l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div class="space-y-1">
              <p class="text-xs font-medium text-zinc-900 dark:text-white">No matching resources</p>
              <p class="text-[11px] text-zinc-500 dark:text-[#a1a1aa] max-w-[220px] mx-auto">
                No accessible files or folders matched this mention.
              </p>
            </div>
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
  activeTab: 'all' | 'folders' | 'docs' | 'data' = 'all';
  MentionResourceType = MentionResourceType;

  get filteredOptions(): IMentionOption[] {
    if (this.activeTab === 'folders') {
      return this.options.filter((o) => o.type === MentionResourceType.FOLDER);
    }
    if (this.activeTab === 'docs') {
      return this.options.filter((o) => o.type === MentionResourceType.DOCUMENT);
    }
    if (this.activeTab === 'data') {
      return this.options.filter((o) => o.type === MentionResourceType.DATASET);
    }
    return this.options;
  }

  isAi(opt: IMentionOption): boolean {
    return (opt.type as any) === 'ai' || opt.id === 'syntra-ai';
  }

  isUser(opt: IMentionOption): boolean {
    return (opt.type as any) === 'user';
  }

  isFolder(opt: IMentionOption): boolean {
    return opt.type === MentionResourceType.FOLDER;
  }

  isDocument(opt: IMentionOption): boolean {
    return opt.type === MentionResourceType.DOCUMENT;
  }

  getBadge(opt: IMentionOption): string {
    if (this.isAi(opt)) return 'AI';
    if (this.isUser(opt)) return opt.status === 'online' ? 'Online' : 'Offline';
    if (this.isFolder(opt)) return 'Folder';
    return opt.fileType || 'Doc';
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

    const list = this.filteredOptions;
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
      const listEl = this.elementRef?.nativeElement?.querySelector('ul');
      if (listEl && listEl.children && listEl.children[this.selectedIndex]) {
        const selectedEl = listEl.children[this.selectedIndex] as HTMLElement;
        selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 0);
  }
}

