import { Component, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalDialogService } from '../../../core/services/modal-dialog.service';

@Component({
  selector: 'app-modal-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (modal.isOpen()) {
      <div
        class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
        role="dialog"
        aria-modal="true"
        (click)="modal.closeWithCancel()"
      >
        <div
          class="w-full max-w-md bg-[#111114] border border-[#27272a] rounded-2xl overflow-hidden p-6 space-y-4 text-zinc-200 animate-scale-up"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-zinc-900 border border-zinc-800 text-zinc-200">
              @if (modal.activeModal()?.type === 'danger') {
                <svg class="w-5 h-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              } @else if (modal.activeModal()?.type === 'prompt') {
                <svg class="w-5 h-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              } @else {
                <svg class="w-5 h-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            </div>

            <div class="flex-1 truncate">
              <h3 class="text-sm font-semibold text-white truncate">
                {{ modal.activeModal()?.title || 'Notice' }}
              </h3>
              <span class="text-[10px] text-zinc-500 font-mono">Syntra Enterprise Security</span>
            </div>

            <button
              (click)="modal.closeWithCancel()"
              class="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              &times;
            </button>
          </div>

          <!-- Body Message -->
          <div class="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {{ modal.activeModal()?.message }}
          </div>

          <!-- Prompt Input if Type == Prompt -->
          @if (modal.activeModal()?.type === 'prompt') {
            <div>
              <input
                type="text"
                [(ngModel)]="promptValue"
                (keydown.enter)="submitPrompt()"
                [placeholder]="modal.activeModal()?.placeholder || 'Enter value...'"
                autofocus
                class="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] focus:border-white focus:outline-none rounded-xl text-xs text-white placeholder:text-zinc-600 font-mono transition-colors"
              />
            </div>
          }

          <!-- Footer Actions -->
          <div class="flex items-center justify-end gap-2 pt-2 border-t border-[#27272a]">
            @if (modal.activeModal()?.type !== 'alert') {
              <button
                type="button"
                (click)="modal.closeWithCancel()"
                class="px-3.5 py-1.5 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-xs font-medium text-zinc-300 hover:text-white transition-colors border border-[#27272a]"
              >
                {{ modal.activeModal()?.cancelText || 'Cancel' }}
              </button>
            }

            <button
              type="button"
              (click)="submitConfirm()"
              class="px-4 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-zinc-200 text-black transition-colors"
            >
              {{ modal.activeModal()?.confirmText || 'OK' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ModalDialogComponent {
  readonly modal = inject(ModalDialogService);
  promptValue = '';

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.modal.isOpen()) {
      this.modal.closeWithCancel();
    }
  }

  submitConfirm(): void {
    if (this.modal.activeModal()?.type === 'prompt') {
      this.submitPrompt();
    } else {
      this.modal.closeWithConfirm(true);
    }
  }

  submitPrompt(): void {
    const val = this.promptValue.trim();
    this.modal.closeWithConfirm(val);
    this.promptValue = '';
  }
}
