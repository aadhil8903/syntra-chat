import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ElementRef,
  HostListener,
  AfterViewInit,
  signal,
  computed,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { WalkthroughService, IWalkthroughStepDef } from '../../../core/services/walkthrough.service';

interface ISpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ICardPosition {
  top: number;
  left: number;
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

@Component({
  selector: 'app-onboarding-walkthrough',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (walkthrough.isRunning()) {
      <div
        class="fixed inset-0 z-[9999] pointer-events-auto select-none"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="currentStep().title"
        (keydown)="onKeyDown($event)"
        tabindex="-1"
      >
        <!-- Overlay Canvas Backdrop with SVG Cutout Spotlight -->
        <svg
          class="absolute inset-0 w-full h-full pointer-events-none transition-all duration-300 ease-out"
          [attr.width]="viewportWidth()"
          [attr.height]="viewportHeight()"
        >
          <defs>
            <mask id="tour-spotlight-mask">
              <!-- White fills entire screen (opaque overlay) -->
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <!-- Black cuts out the spotlight area (transparent hole) -->
              @if (spotlight()) {
                <rect
                  [attr.x]="spotlight()!.left"
                  [attr.y]="spotlight()!.top"
                  [attr.width]="spotlight()!.width"
                  [attr.height]="spotlight()!.height"
                  rx="10"
                  ry="10"
                  fill="black"
                />
              }
            </mask>
          </defs>

          <!-- Dimmed Dark Backdrop -->
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.72)"
            mask="url(#tour-spotlight-mask)"
          />

          <!-- Glowing Outline around target -->
          @if (spotlight()) {
            <rect
              [attr.x]="spotlight()!.left"
              [attr.y]="spotlight()!.top"
              [attr.width]="spotlight()!.width"
              [attr.height]="spotlight()!.height"
              rx="10"
              ry="10"
              fill="none"
              stroke="#ffffff"
              stroke-width="1.75"
              stroke-dasharray="6 3"
              class="animate-pulse"
            />
          }
        </svg>

        <!-- Contextual Compact Tour Card -->
        <div
          #tourCard
          class="absolute z-10 w-80 sm:w-88 max-w-[calc(100vw-2rem)] bg-[#111114] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col p-4 space-y-3 transition-all duration-300 ease-out focus:outline-none"
          [style.top.px]="cardPosition().top"
          [style.left.px]="cardPosition().left"
          tabindex="0"
        >
          <!-- Card Header: Title & Step counter -->
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-sm font-bold text-white tracking-tight leading-snug">
              {{ currentStep().title }}
            </h3>
            <span class="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#18181b] border border-[#27272a] text-[#a1a1aa] flex-shrink-0">
              {{ walkthrough.currentStepIndex() + 1 }}/{{ walkthrough.totalSteps() }}
            </span>
          </div>

          <!-- Card Body: Description & Optional Tip -->
          <div class="space-y-2 text-xs text-zinc-300 leading-relaxed">
            <p class="text-[12px] text-zinc-300">
              {{ currentStep().description }}
            </p>

            @if (currentStep().tip) {
              <div class="p-2.5 rounded-xl bg-[#0c0c0e] border border-[#27272a]/80 text-[11px] text-zinc-400">
                <span class="font-semibold text-white">Tip:</span> {{ currentStep().tip }}
              </div>
            }
          </div>

          <!-- Card Footer Actions: Skip, Back, Next / Finish -->
          <div class="pt-2 border-t border-[#27272a] flex items-center justify-between">
            <button
              type="button"
              (click)="skip()"
              class="text-xs text-[#a1a1aa] hover:text-white font-medium transition-colors px-1.5 py-1 rounded-lg hover:bg-zinc-900"
              aria-label="Skip walkthrough tour"
            >
              Skip
            </button>

            <div class="flex items-center gap-2">
              @if (walkthrough.currentStepIndex() > 0) {
                <button
                  type="button"
                  (click)="previous()"
                  class="px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white bg-[#18181b] hover:bg-[#27272a] rounded-xl border border-[#27272a] transition-colors"
                  aria-label="Previous step"
                >
                  Back
                </button>
              }

              @if (walkthrough.currentStepIndex() < walkthrough.totalSteps() - 1) {
                <button
                  type="button"
                  (click)="next()"
                  class="px-3.5 py-1 text-xs font-semibold text-black bg-white hover:bg-zinc-200 rounded-xl transition-colors shadow-sm"
                  aria-label="Next step"
                >
                  Next &rarr;
                </button>
              } @else {
                <button
                  type="button"
                  (click)="finish()"
                  class="px-3.5 py-1 text-xs font-semibold text-black bg-white hover:bg-zinc-200 rounded-xl transition-colors shadow-sm"
                  aria-label="Finish walkthrough tour"
                >
                  Finish
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
})
export class OnboardingWalkthroughComponent implements OnInit, OnDestroy, AfterViewInit {
  readonly walkthrough = inject(WalkthroughService);
  private readonly cdr = inject(ChangeDetectorRef);

  currentStep = this.walkthrough.currentStep;

  viewportWidth = signal<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  viewportHeight = signal<number>(typeof window !== 'undefined' ? window.innerHeight : 768);

  spotlight = signal<ISpotlightRect | null>(null);
  cardPosition = signal<ICardPosition>({ top: 100, left: 100, placement: 'bottom' });

  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private updateTimer?: any;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onWindowResize);
      window.addEventListener('scroll', this.onWindowScroll, true);
    }
  }

  ngAfterViewInit(): void {
    this.scheduleUpdate();
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onWindowResize);
      window.removeEventListener('scroll', this.onWindowScroll, true);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.walkthrough.isRunning()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.skip();
    } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.previous();
    }
  }

  private onWindowResize = (): void => {
    this.viewportWidth.set(window.innerWidth);
    this.viewportHeight.set(window.innerHeight);
    this.updateTargetAndCard();
  };

  private onWindowScroll = (): void => {
    this.updateTargetAndCard();
  };

  next(): void {
    this.walkthrough.next();
    this.scheduleUpdate();
  }

  previous(): void {
    this.walkthrough.previous();
    this.scheduleUpdate();
  }

  skip(): void {
    this.walkthrough.skip();
  }

  finish(): void {
    this.walkthrough.finish();
  }

  scheduleUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    // Attempt fast update, and second pass after DOM stabilizes
    this.updateTargetAndCard();
    this.updateTimer = setTimeout(() => {
      this.updateTargetAndCard();
    }, 150);
  }

  updateTargetAndCard(): void {
    if (typeof document === 'undefined') return;

    const step = this.currentStep();
    if (!step) return;

    const targetEl = document.querySelector(step.targetSelector) as HTMLElement | null;

    if (targetEl && targetEl.offsetParent !== null) {
      const rect = targetEl.getBoundingClientRect();
      const padding = 6;

      const spot: ISpotlightRect = {
        top: Math.max(0, rect.top - padding),
        left: Math.max(0, rect.left - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      };

      this.spotlight.set(spot);
      this.calculateCardPosition(spot);
    } else {
      // Target element is not currently in the viewport/DOM (e.g. collapsed or conditional)
      this.spotlight.set(null);
      this.calculateFallbackCenterCard();
    }

    this.cdr.detectChanges();
  }

  private calculateCardPosition(spot: ISpotlightRect): void {
    const cardWidth = Math.min(352, window.innerWidth - 32);
    const cardHeight = 220; // Estimated max height
    const margin = 12;

    const vWidth = window.innerWidth;
    const vHeight = window.innerHeight;

    let top = 0;
    let left = 0;
    let placement: ICardPosition['placement'] = 'bottom';

    // 1. Try placing to the right if target is in left sidebar
    if (spot.left + spot.width + cardWidth + margin < vWidth) {
      placement = 'right';
      left = spot.left + spot.width + margin;
      top = Math.max(margin, Math.min(spot.top, vHeight - cardHeight - margin));
    }
    // 2. Try placing on top if target is near the bottom (e.g. chat input bar)
    else if (spot.top - cardHeight - margin > 0) {
      placement = 'top';
      top = spot.top - cardHeight - margin;
      left = Math.max(margin, Math.min(spot.left, vWidth - cardWidth - margin));
    }
    // 3. Try placing below
    else if (spot.top + spot.height + cardHeight + margin < vHeight) {
      placement = 'bottom';
      top = spot.top + spot.height + margin;
      left = Math.max(margin, Math.min(spot.left, vWidth - cardWidth - margin));
    }
    // 4. Try placing on left
    else if (spot.left - cardWidth - margin > 0) {
      placement = 'left';
      left = spot.left - cardWidth - margin;
      top = Math.max(margin, Math.min(spot.top, vHeight - cardHeight - margin));
    }
    // 5. Fallback centered
    else {
      placement = 'center';
      top = Math.max(margin, (vHeight - cardHeight) / 2);
      left = Math.max(margin, (vWidth - cardWidth) / 2);
    }

    this.cardPosition.set({ top, left, placement });
  }

  private calculateFallbackCenterCard(): void {
    const cardWidth = Math.min(352, window.innerWidth - 32);
    const cardHeight = 220;
    const vWidth = window.innerWidth;
    const vHeight = window.innerHeight;

    this.cardPosition.set({
      top: Math.max(16, (vHeight - cardHeight) / 2),
      left: Math.max(16, (vWidth - cardWidth) / 2),
      placement: 'center',
    });
  }
}
