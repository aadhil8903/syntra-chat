import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type SelectionActionType = 'ask' | 'explain' | 'summarize' | 'copy';

export interface ISelectionActionEvent {
  action: SelectionActionType;
  selectedText: string;
}

@Component({
  selector: 'app-text-selection-toolbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isVisible && selectedText) {
      <div
        #toolbar
        [style.top.px]="top"
        [style.left.px]="left"
        class="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-2 bg-[#18181b]/95 backdrop-blur-md border border-[#3f3f46] text-white shadow-2xl rounded-full px-1.5 py-1 flex items-center gap-0.5 text-xs font-medium animate-in fade-in zoom-in-95 duration-150 select-none"
        (mousedown)="$event.preventDefault()"
      >
        <!-- Ask AI Button (Primary Pill) -->
        <button
          (click)="triggerAction('ask')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-zinc-200 text-black font-semibold transition-colors shadow-sm"
          title="Ask AI about this selection"
        >
          <svg class="w-3.5 h-3.5 text-black" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>Ask AI</span>
        </button>

        <div class="h-4 w-[1px] bg-zinc-700 mx-1"></div>

        <!-- Explain -->
        <button
          (click)="triggerAction('explain')"
          class="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Explain this text in detail"
        >
          <svg class="w-3.5 h-3.5 text-amber-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span>Explain</span>
        </button>

        <!-- Summarize -->
        <button
          (click)="triggerAction('summarize')"
          class="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Summarize key points"
        >
          <svg class="w-3.5 h-3.5 text-blue-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          <span>Summarize</span>
        </button>

        <!-- Copy -->
        <button
          (click)="triggerAction('copy')"
          class="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          [title]="copied ? 'Copied to clipboard!' : 'Copy selection'"
        >
          @if (!copied) {
            <svg class="w-3.5 h-3.5 text-zinc-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          } @else {
            <svg class="w-3.5 h-3.5 text-emerald-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          }
          <span>{{ copied ? 'Copied' : 'Copy' }}</span>
        </button>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class TextSelectionToolbarComponent {
  @Input() targetContainer?: HTMLElement;
  @Output() actionTriggered = new EventEmitter<ISelectionActionEvent>();

  isVisible = false;
  selectedText = '';
  top = 0;
  left = 0;
  copied = false;

  constructor(private cdr: ChangeDetectorRef) {}

  @HostListener('document:selectionchange')
  onSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      if (this.isVisible) {
        this.isVisible = false;
        this.selectedText = '';
        this.cdr.markForCheck();
      }
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 3) {
      this.isVisible = false;
      return;
    }

    // Check if selection is inside target container (if provided)
    if (this.targetContainer && selection.anchorNode) {
      if (!this.targetContainer.contains(selection.anchorNode)) {
        this.isVisible = false;
        return;
      }
    }

    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (rect.width === 0 && rect.height === 0) {
        this.isVisible = false;
        return;
      }

      this.selectedText = text;
      this.top = Math.max(10, rect.top - 8);
      this.left = rect.left + rect.width / 2;
      this.isVisible = true;
      this.copied = false;
      this.cdr.markForCheck();
    } catch {
      this.isVisible = false;
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('app-text-selection-toolbar')) {
      // Delay slightly to check if user clicked outside
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          this.isVisible = false;
          this.cdr.markForCheck();
        }
      }, 100);
    }
  }

  triggerAction(action: SelectionActionType): void {
    if (action === 'copy') {
      navigator.clipboard.writeText(this.selectedText);
      this.copied = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.isVisible = false;
        this.copied = false;
        this.cdr.markForCheck();
      }, 800);
    } else {
      this.actionTriggered.emit({
        action,
        selectedText: this.selectedText,
      });
      this.isVisible = false;
      // Clear selection after action
      window.getSelection()?.removeAllRanges();
      this.cdr.markForCheck();
    }
  }
}

