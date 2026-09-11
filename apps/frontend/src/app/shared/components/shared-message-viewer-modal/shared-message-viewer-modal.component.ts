import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IMessageShare } from '@enter-chat/shared-types';
import { PresenceService } from '../../../core/services/presence.service';

@Component({
  selector: 'app-shared-message-viewer-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen && shareData) {
      <div
        class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
        role="dialog"
        aria-modal="true"
        (click)="close()"
      >
        <div
          class="w-full max-w-xl bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl overflow-hidden p-6 space-y-4 text-zinc-800 dark:text-zinc-200 animate-scale-up shadow-2xl flex flex-col max-h-[85vh]"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div class="flex items-center justify-between gap-3 border-b border-[#e7e9ed] dark:border-[#27272a] pb-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#f8f9fa] dark:bg-zinc-900 border border-[#dcdde1] dark:border-zinc-800 text-zinc-700 dark:text-zinc-200">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </div>
              <div class="min-w-0">
                <h3 class="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                  Shared Message
                </h3>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  @if (shareData.sharedByUser) {
                    Shared by {{ shareData.sharedByUser.firstName }} {{ shareData.sharedByUser.lastName }}
                  } @else {
                    Shared message insight
                  }
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

          <!-- Message Content Area -->
          <div class="space-y-3 flex-1 overflow-y-auto pr-1">
            <!-- Author / Role Info -->
            <div class="flex items-center justify-between p-3 rounded-xl bg-[#f8f9fa] dark:bg-[#18181b] border border-[#e7e9ed] dark:border-[#27272a]">
              <div class="flex items-center gap-2.5">
                <div class="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {{ shareData.message?.role === 'assistant' ? 'AI' : (shareData.message?.author?.firstName?.charAt(0) || 'U') }}
                </div>
                <div>
                  <span class="text-xs font-semibold text-zinc-900 dark:text-white block">
                    {{ shareData.message?.role === 'assistant' ? 'Syntra AI' : (shareData.message?.author?.firstName ? shareData.message?.author?.firstName + ' ' + shareData.message?.author?.lastName : 'User') }}
                  </span>
                  <span class="text-[10px] text-zinc-400 dark:text-zinc-500">
                    {{ shareData.message?.createdAt | date:'medium' }}
                  </span>
                </div>
              </div>

              <button
                type="button"
                (click)="copyMessageContent()"
                class="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-[#dcdde1] dark:border-[#27272a] bg-white dark:bg-[#111114] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>{{ isCopied ? 'Copied!' : 'Copy' }}</span>
              </button>
            </div>

            <!-- Content -->
            <div class="p-4 rounded-xl bg-[#f8f9fa] dark:bg-[#18181b] border border-[#e7e9ed] dark:border-[#27272a] text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap select-text font-sans">
              {{ shareData.message?.content }}
            </div>

            <!-- Citations if any -->
            @if (shareData.message?.citations && shareData.message!.citations!.length > 0) {
              <div class="space-y-1.5 pt-2">
                <span class="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
                  Citations ({{ shareData.message!.citations!.length }})
                </span>
                <div class="space-y-1.5">
                  @for (c of shareData.message!.citations!; track $index) {
                    <div class="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-[#e7e9ed] dark:border-[#27272a] text-[11px] text-zinc-600 dark:text-zinc-300">
                      <div class="font-medium text-zinc-900 dark:text-white">{{ c.filename }}</div>
                      <div class="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">"{{ c.textSnippet }}"</div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between gap-2 pt-3 border-t border-[#e7e9ed] dark:border-[#27272a]">
            <span class="text-[11px] text-zinc-400">
              Shared securely within organization
            </span>

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
export class SharedMessageViewerModalComponent {
  @Input() isOpen = false;
  @Input() shareData: IMessageShare | null = null;

  @Output() closed = new EventEmitter<void>();

  readonly presenceService = inject(PresenceService);
  isCopied = false;

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.isOpen) {
      this.close();
    }
  }

  copyMessageContent(): void {
    if (!this.shareData?.message?.content) return;
    navigator.clipboard.writeText(this.shareData.message.content).then(() => {
      this.isCopied = true;
      setTimeout(() => {
        this.isCopied = false;
      }, 2000);
    });
  }

  close(): void {
    this.closed.emit();
  }
}
