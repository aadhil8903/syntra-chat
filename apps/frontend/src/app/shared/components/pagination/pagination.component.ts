import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type PageSizeOption = number | 'all';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="px-4 py-3 bg-zinc-50 dark:bg-[#09090b] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400 select-none"
      [ngClass]="position === 'bottom' ? 'border-t border-zinc-200 dark:border-zinc-800' : 'border-b border-zinc-200 dark:border-zinc-800'"
    >
      <!-- Left: Range & Total count & Per-page selector -->
      <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start flex-wrap">
        <span class="font-normal pagination-summary">
          @if (totalItems === 0) {
            Showing 0 {{ itemLabel }}
          } @else if (startItem === endItem) {
            Showing <span class="font-medium text-zinc-900 dark:text-zinc-200">{{ startItem }}</span> of <span class="font-medium text-zinc-900 dark:text-zinc-200">{{ totalItems }}</span> {{ itemLabel }}
          } @else {
            Showing <span class="font-medium text-zinc-900 dark:text-zinc-200">{{ startItem }}–{{ endItem }}</span> of <span class="font-medium text-zinc-900 dark:text-zinc-200">{{ totalItems }}</span> {{ itemLabel }}
          }
        </span>

        <!-- Page Size Selector -->
        <div class="flex items-center gap-1.5 ml-0 sm:ml-2">
          <span class="text-[11px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">Per page:</span>
          <div class="inline-flex items-center rounded-lg bg-zinc-200/80 dark:bg-zinc-800/90 p-0.5 border border-zinc-300 dark:border-zinc-700/60">
            @for (opt of pageSizeOptions; track opt) {
              <button
                type="button"
                (click)="onPageSizeSelect(opt)"
                class="px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer page-size-btn"
                [ngClass]="pageSize === opt
                  ? 'bg-white text-zinc-900 font-semibold shadow-xs dark:bg-zinc-700 dark:text-white'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'"
                [attr.aria-label]="'Show ' + (opt === 'all' ? 'all' : opt) + ' items per page'"
                [attr.aria-pressed]="pageSize === opt"
              >
                {{ opt === 'all' ? 'All' : opt }}
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Right: Page buttons (Prev, Pages, Next) -->
      @if (totalPages > 1 || (pageSize !== 'all' && totalItems > 0)) {
        <div class="flex items-center gap-1 w-full sm:w-auto justify-center sm:justify-end">
          <!-- Previous -->
          <button
            type="button"
            (click)="onPrev()"
            [disabled]="currentPage <= 1"
            class="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-medium cursor-pointer prev-btn"
            aria-label="Previous page"
          >
            Previous
          </button>

          <!-- Page Numbers with Ellipsis -->
          <div class="flex items-center gap-1">
            @for (p of pages; track $index) {
              @if (p === '...') {
                <span class="w-7 h-7 flex items-center justify-center text-zinc-400 text-xs">...</span>
              } @else {
                <button
                  type="button"
                  (click)="onPageSelect(p)"
                  class="w-7 h-7 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-center page-num-btn"
                  [ngClass]="currentPage === p
                    ? 'bg-zinc-900 text-white font-semibold dark:bg-white dark:text-black shadow-xs active-page'
                    : 'bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'"
                  [attr.aria-label]="'Go to page ' + p"
                  [attr.aria-current]="currentPage === p ? 'page' : null"
                >
                  {{ p }}
                </button>
              }
            }
          </div>

          <!-- Next -->
          <button
            type="button"
            (click)="onNext()"
            [disabled]="currentPage >= totalPages"
            class="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-medium cursor-pointer next-btn"
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      }
    </div>
  `,
})
export class PaginationComponent {
  @Input() position: 'top' | 'bottom' = 'top';
  @Input() currentPage = 1;
  @Input() pageSize: PageSizeOption = 50;
  @Input() totalItems = 0;
  @Input() pageSizeOptions: PageSizeOption[] = [10, 50, 'all'];
  @Input() itemLabel = 'items';

  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<PageSizeOption>();

  get totalPages(): number {
    if (this.pageSize === 'all' || !this.pageSize || Number(this.pageSize) <= 0 || this.totalItems <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.totalItems / Number(this.pageSize)));
  }

  get startItem(): number {
    if (this.totalItems === 0) return 0;
    if (this.pageSize === 'all') return 1;
    return (this.currentPage - 1) * Number(this.pageSize) + 1;
  }

  get endItem(): number {
    if (this.totalItems === 0) return 0;
    if (this.pageSize === 'all') return this.totalItems;
    return Math.min(this.currentPage * Number(this.pageSize), this.totalItems);
  }

  get pages(): (number | string)[] {
    const total = this.totalPages;
    const current = this.currentPage;
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    if (current <= 4) {
      return [1, 2, 3, 4, 5, '...', total];
    }
    if (current >= total - 3) {
      return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
  }

  onPageSelect(page: number | string): void {
    if (typeof page === 'number' && page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.pageChange.emit(page);
    }
  }

  onPrev(): void {
    if (this.currentPage > 1) {
      this.pageChange.emit(this.currentPage - 1);
    }
  }

  onNext(): void {
    if (this.currentPage < this.totalPages) {
      this.pageChange.emit(this.currentPage + 1);
    }
  }

  onPageSizeSelect(size: PageSizeOption): void {
    if (size !== this.pageSize) {
      this.pageSizeChange.emit(size);
    }
  }
}
