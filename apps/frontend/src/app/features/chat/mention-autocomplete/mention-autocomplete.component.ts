import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  OnChanges,
  SimpleChanges,
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
        class="absolute bottom-full left-0 mb-3 w-96 max-w-[calc(100vw-2rem)] bg-[#111114] border border-[#27272a] rounded-2xl overflow-hidden z-50 animate-fade-in"
      >
        <!-- Header & Tabs -->
        <div class="p-3 bg-[#141417] border-b border-[#27272a] flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-white flex items-center gap-1.5">
              <span class="text-white font-bold">&#64;</span>
              <span>Mention File or Folder</span>
            </span>
          </div>
          <div class="flex items-center gap-1 text-[11px]">
            <button
              (click)="activeTab = 'all'"
              [ngClass]="activeTab === 'all' ? 'bg-white text-black font-semibold' : 'text-[#a1a1aa] hover:text-white'"
              class="px-2 py-0.5 rounded-md transition-colors"
            >
              All ({{ options.length }})
            </button>
            <button
              (click)="activeTab = 'folders'"
              [ngClass]="activeTab === 'folders' ? 'bg-white text-black font-semibold' : 'text-[#a1a1aa] hover:text-white'"
              class="px-2 py-0.5 rounded-md transition-colors"
            >
              Folders
            </button>
            <button
              (click)="activeTab = 'docs'"
              [ngClass]="activeTab === 'docs' ? 'bg-white text-black font-semibold' : 'text-[#a1a1aa] hover:text-white'"
              class="px-2 py-0.5 rounded-md transition-colors"
            >
              Docs
            </button>
            <button
              (click)="activeTab = 'data'"
              [ngClass]="activeTab === 'data' ? 'bg-white text-black font-semibold' : 'text-[#a1a1aa] hover:text-white'"
              class="px-2 py-0.5 rounded-md transition-colors"
            >
              Datasets
            </button>
          </div>
        </div>

        <!-- Options List -->
        @if (filteredOptions.length > 0) {
          <ul class="max-h-64 overflow-y-auto divide-y divide-[#27272a] p-1">
            @for (opt of filteredOptions; track opt.id; let idx = $index) {
              <li
                (click)="selectOption(opt)"
                (mouseenter)="selectedIndex = idx"
                [ngClass]="{ 'bg-[#1f1f23] text-white': selectedIndex === idx }"
                class="px-3 py-2.5 rounded-xl cursor-pointer hover:bg-[#18181b] transition-colors flex items-center justify-between gap-2.5"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  @if (opt.type === MentionResourceType.FOLDER) {
                    <div class="w-7 h-7 rounded-lg bg-[#18181b] text-white border border-[#3f3f46] flex items-center justify-center flex-shrink-0">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                  } @else if (opt.type === MentionResourceType.DOCUMENT) {
                    <div class="w-7 h-7 rounded-lg bg-[#18181b] text-white border border-[#3f3f46] flex items-center justify-center flex-shrink-0">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  } @else {
                    <div class="w-7 h-7 rounded-lg bg-[#18181b] text-white border border-[#3f3f46] flex items-center justify-center flex-shrink-0">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                    </div>
                  }
                  <div class="truncate">
                    <div class="text-xs font-medium text-white truncate">{{ opt.name }}</div>
                    @if (opt.detail) {
                      <div class="text-[10px] text-[#a1a1aa] truncate mt-0.5">{{ opt.detail }}</div>
                    }
                  </div>
                </div>

                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <span class="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#141417] border border-[#27272a] text-[#a1a1aa]">
                    {{ opt.type === MentionResourceType.FOLDER ? 'Folder' : opt.fileType }}
                  </span>
                </div>
              </li>
            }
          </ul>
        } @else {
          <!-- Empty State with guidance -->
          <div class="p-6 text-center space-y-3">
            <div class="w-10 h-10 rounded-xl bg-[#18181b] text-[#a1a1aa] mx-auto flex items-center justify-center border border-[#27272a]">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h5l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div class="space-y-1">
              <p class="text-xs font-medium text-white">No matching resources</p>
              <p class="text-[11px] text-[#a1a1aa] max-w-[220px] mx-auto">
                No accessible files or folders matched this mention.
              </p>
            </div>
          </div>
        }

        <!-- Footer Navigation hint -->
        <div class="px-3 py-2 bg-[#0c0c0e] border-t border-[#27272a] text-[10px] text-[#71717a] flex items-center justify-between">
          <span><kbd class="px-1 py-0.5 rounded bg-[#18181b] text-zinc-300 font-mono">↑</kbd> <kbd class="px-1 py-0.5 rounded bg-[#18181b] text-zinc-300 font-mono">↓</kbd> Navigate</span>
          <span><kbd class="px-1 py-0.5 rounded bg-[#18181b] text-zinc-300 font-mono">Enter</kbd> Select</span>
          <span><kbd class="px-1 py-0.5 rounded bg-[#18181b] text-zinc-300 font-mono">Esc</kbd> Close</span>
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options'] || changes['isOpen']) {
      this.selectedIndex = 0;
    }
  }

  selectOption(opt: IMentionOption): void {
    this.optionSelected.emit(opt);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.isOpen) return;

    const list = this.filteredOptions;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (list.length > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % list.length;
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.length > 0) {
        this.selectedIndex = (this.selectedIndex - 1 + list.length) % list.length;
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
}

