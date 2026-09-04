import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  HostListener,
  AfterViewInit,
  signal,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CollectionsWalkthroughService } from '../../../core/services/collections-walkthrough.service';

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
  selector: 'app-collections-walkthrough',
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
            <mask id="collections-spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
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
            <!-- Marker for Animated SVG Guide Arrow -->
            <marker id="arrow-accent" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#e11d48" />
            </marker>
          </defs>

          <!-- Dimmed Dark Backdrop -->
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.72)"
            mask="url(#collections-spotlight-mask)"
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
              stroke="#e11d48"
              stroke-width="1.75"
              stroke-dasharray="6 3"
              class="animate-pulse"
            />
          }

          <!-- Hand-drawn style animated arrow curve during drag demonstration -->
          @if (walkthrough.demoDragAnimation()) {
            <g class="transition-opacity duration-300">
              <path
                [attr.d]="getCurvedGuideArrowPath()"
                fill="none"
                stroke="#e11d48"
                stroke-width="2.25"
                stroke-dasharray="6 4"
                marker-end="url(#arrow-accent)"
                class="animate-[dash_1.2s_linear_infinite]"
              />
            </g>
          }
        </svg>

        <!-- Simulated Floating Drag Ghost Pill -->
        @if (walkthrough.demoDragAnimation(); as dragAnim) {
          <div
            class="absolute pointer-events-none z-30 transition-transform duration-75 ease-out shadow-2xl rounded-xl border border-rose-500/80 bg-[#18181b] px-3 py-2 flex items-center gap-2 text-xs text-white max-w-[240px] truncate"
            [style.top.px]="getGhostPillPosition().y"
            [style.left.px]="getGhostPillPosition().x"
            [style.transform]="'translate(-50%, -50%) scale(' + (dragAnim.phase === 'dropped' ? 0.95 : 1.05) + ')'"
          >
            <span class="w-[2px] h-3.5 rounded-full bg-rose-400 select-none flex-shrink-0"></span>
            <span class="truncate font-medium">{{ dragAnim.sourceTitle }}</span>
            <span class="text-[10px] text-zinc-400 font-mono">➔ {{ dragAnim.targetName }}</span>
          </div>
        }

        <!-- Contextual Compact Tour Card -->
        <div
          #tourCard
          class="absolute z-10 w-80 sm:w-88 max-w-[calc(100vw-2rem)] bg-[#111114] border border-[#27272a] rounded-2xl overflow-hidden flex flex-col p-4 space-y-3 transition-all duration-300 ease-out focus:outline-none shadow-2xl"
          [style.top.px]="cardPosition().top"
          [style.left.px]="cardPosition().left"
          tabindex="0"
        >
          <!-- Card Header: Title & Step counter -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-[#e11d48]"></span>
              <h3 class="text-sm font-bold text-white tracking-tight leading-snug">
                {{ currentStep().title }}
              </h3>
            </div>
            <span class="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#18181b] border border-[#27272a] text-[#a1a1aa] flex-shrink-0">
              {{ walkthrough.currentStepIndex() + 1 }}/{{ walkthrough.totalSteps() }}
            </span>
          </div>

          <!-- Card Body: Description -->
          <div class="space-y-2 text-xs text-zinc-300 leading-relaxed">
            <p class="text-[12px] text-zinc-300">
              {{ currentStep().description }}
            </p>
          </div>

          <!-- Card Footer Actions: Skip, Back, Next / Finish -->
          <div class="pt-2 border-t border-[#27272a] flex items-center justify-between">
            <button
              type="button"
              (click)="skip()"
              class="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white font-medium transition-colors px-2.5 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
                  class="px-3.5 py-1 text-xs font-semibold text-black bg-white hover:bg-zinc-200 rounded-xl transition-colors"
                  aria-label="Next step"
                >
                  Next &rarr;
                </button>
              } @else {
                <button
                  type="button"
                  (click)="finish()"
                  class="px-3.5 py-1 text-xs font-semibold text-black bg-white hover:bg-zinc-200 rounded-xl transition-colors"
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
export class CollectionsWalkthroughComponent implements OnInit, OnDestroy, AfterViewInit {
  readonly walkthrough = inject(CollectionsWalkthroughService);
  private readonly cdr = inject(ChangeDetectorRef);

  currentStep = this.walkthrough.currentStep;

  viewportWidth = signal<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  viewportHeight = signal<number>(typeof window !== 'undefined' ? window.innerHeight : 768);

  spotlight = signal<ISpotlightRect | null>(null);
  cardPosition = signal<ICardPosition>({ top: 100, left: 100, placement: 'bottom' });

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
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
  }

  @HostListener('window:keydown', ['\$event'])
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
      this.spotlight.set(null);
      this.calculateFallbackCenterCard();
    }

    this.cdr.detectChanges();
  }

  private calculateCardPosition(spot: ISpotlightRect): void {
    const cardWidth = Math.min(352, window.innerWidth - 32);
    const cardHeight = 200;
    const margin = 12;

    const vWidth = window.innerWidth;
    const vHeight = window.innerHeight;

    let top = 0;
    let left = 0;
    let placement: ICardPosition['placement'] = 'bottom';

    if (spot.left + spot.width + cardWidth + margin < vWidth) {
      placement = 'right';
      left = spot.left + spot.width + margin;
      top = Math.max(margin, Math.min(spot.top, vHeight - cardHeight - margin));
    } else if (spot.top - cardHeight - margin > 0) {
      placement = 'top';
      top = spot.top - cardHeight - margin;
      left = Math.max(margin, Math.min(spot.left, vWidth - cardWidth - margin));
    } else if (spot.top + spot.height + cardHeight + margin < vHeight) {
      placement = 'bottom';
      top = spot.top + spot.height + margin;
      left = Math.max(margin, Math.min(spot.left, vWidth - cardWidth - margin));
    } else {
      placement = 'center';
      top = Math.max(margin, (vHeight - cardHeight) / 2);
      left = Math.max(margin, (vWidth - cardWidth) / 2);
    }

    this.cardPosition.set({ top, left, placement });
  }

  private calculateFallbackCenterCard(): void {
    const cardWidth = Math.min(352, window.innerWidth - 32);
    const cardHeight = 200;
    const vWidth = window.innerWidth;
    const vHeight = window.innerHeight;

    this.cardPosition.set({
      top: Math.max(16, (vHeight - cardHeight) / 2),
      left: Math.max(16, (vWidth - cardWidth) / 2),
      placement: 'center',
    });
  }

  getCurvedGuideArrowPath(): string {
    const spot = this.spotlight();
    const startX = spot ? spot.left + spot.width * 0.45 : 140;
    const startY = spot ? spot.top + spot.height - 20 : 360;
    const endX = spot ? spot.left + spot.width * 0.55 : 160;
    const endY = spot ? spot.top + 50 : 180;
    const controlX = startX - 45;
    const controlY = (startY + endY) / 2;

    return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
  }

  getGhostPillPosition(): { x: number; y: number } {
    const anim = this.walkthrough.demoDragAnimation();
    const spot = this.spotlight();
    const startX = spot ? spot.left + spot.width * 0.45 : 140;
    const startY = spot ? spot.top + spot.height - 20 : 360;
    const endX = spot ? spot.left + spot.width * 0.55 : 160;
    const endY = spot ? spot.top + 50 : 180;

    const progress = anim ? anim.progress : 0;
    const controlX = startX - 45;
    const controlY = (startY + endY) / 2;

    // Quadratic Bezier interpolation: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
    const t = Math.min(1, Math.max(0, progress));
    const invT = 1 - t;
    const x = invT * invT * startX + 2 * invT * t * controlX + t * t * endX;
    const y = invT * invT * startY + 2 * invT * t * controlY + t * t * endY;

    return { x: Math.round(x), y: Math.round(y) };
  }
}
