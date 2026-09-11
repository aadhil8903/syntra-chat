import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ICitation } from '@enter-chat/shared-types';

interface IDedupedCitationFile {
  filename: string;
  sourceType?: string;
  pages: number[];
  textSnippets: string[];
}

@Component({
  selector: 'app-citation-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mt-2.5 pt-2 border-t border-zinc-200 dark:border-[#27272a]/60">
      <div class="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-[#71717a] font-medium mb-1.5 select-none">
        <svg class="w-3 h-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span>Referenced Sources</span>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        @for (file of uniqueSourceFiles; track file.filename; let idx = $index) {
          <div
            (click)="toggleExpand(idx)"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-[#111114] hover:bg-zinc-200 dark:hover:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] hover:border-zinc-400 dark:hover:border-zinc-500 text-xs text-zinc-800 dark:text-zinc-200 transition-all cursor-pointer select-none max-w-full truncate group"
            [title]="'Referenced: ' + file.filename"
          >
            @if (file.sourceType === 'tabular') {
              <svg class="w-3 h-3 text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-200 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 4h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            } @else {
              <svg class="w-3 h-3 text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-200 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            <span class="font-medium truncate text-zinc-700 group-hover:text-zinc-900 dark:text-zinc-300 dark:group-hover:text-white text-[11px]">{{ file.filename }}</span>
            @if (file.pages.length > 0) {
              <span class="text-[10px] text-zinc-500 dark:text-[#71717a] font-mono group-hover:text-zinc-700 dark:group-hover:text-zinc-400">
                p. {{ file.pages.join(', ') }}
              </span>
            }
          </div>
        }
      </div>

      @if (expandedIdx !== null && uniqueSourceFiles[expandedIdx]) {
        <div class="mt-2 p-2.5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] text-[11px] text-zinc-800 dark:text-zinc-300 space-y-1.5 animate-fade-in font-mono shadow-sm dark:shadow-none">
          <div class="font-semibold text-zinc-900 dark:text-white flex items-center justify-between text-xs font-sans pb-1 border-b border-zinc-200 dark:border-zinc-800">
            <span>{{ uniqueSourceFiles[expandedIdx].filename }}</span>
            <button (click)="expandedIdx = null" class="text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white text-xs">&times;</button>
          </div>
          @for (snippet of uniqueSourceFiles[expandedIdx].textSnippets; track $index) {
            <div class="text-zinc-700 dark:text-[#a1a1aa] leading-relaxed italic text-[11px] bg-zinc-50 dark:bg-black/40 p-1.5 rounded border border-zinc-200/60 dark:border-transparent">
              "{{ snippet }}"
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class CitationBadgeComponent {
  @Input() citations: ICitation[] = [];
  expandedIdx: number | null = null;

  get uniqueSourceFiles(): IDedupedCitationFile[] {
    const fileMap = new Map<string, IDedupedCitationFile>();

    for (const c of this.citations || []) {
      if (!c.filename) continue;
      const key = c.filename;
      if (!fileMap.has(key)) {
        fileMap.set(key, {
          filename: c.filename,
          sourceType: c.sourceType,
          pages: c.page ? [c.page] : [],
          textSnippets: c.textSnippet ? [c.textSnippet] : [],
        });
      } else {
        const item = fileMap.get(key)!;
        if (c.page && !item.pages.includes(c.page)) {
          item.pages.push(c.page);
          item.pages.sort((a, b) => a - b);
        }
        if (c.textSnippet && !item.textSnippets.includes(c.textSnippet)) {
          item.textSnippets.push(c.textSnippet);
        }
      }
    }

    return Array.from(fileMap.values());
  }

  toggleExpand(idx: number): void {
    this.expandedIdx = this.expandedIdx === idx ? null : idx;
  }
}

