import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ElementRef,
  ViewChild,
  HostListener,
  AfterViewInit,
  signal,
  computed,
  ChangeDetectorRef,
  NgZone,
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
            <!-- Marker for Animated SVG Guide Arrow during collections demo -->
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

        <!-- Hand-drawn style animated arrow curve during drag demonstration -->
        @if (walkthrough.demoDragAnimation() && curvedArrowPath()) {
          <g class="transition-opacity duration-300">
            <path
              [attr.d]="curvedArrowPath()"
              fill="none"
              stroke="#e11d48"
              stroke-width="2.25"
              stroke-dasharray="6 4"
              marker-end="url(#arrow-accent)"
              class="animated-guide-dash"
            />
          </g>
        }
      </svg>

      <!-- 60 FPS GPU-Accelerated Floating Drag Ghost Pill -->
      <div
        #ghostPill
        id="tour-ghost-pill"
        class="absolute pointer-events-none z-40 select-none will-change-transform rounded-xl border border-rose-500/90 bg-white dark:bg-[#18181b] px-3.5 py-2 flex items-center gap-2 text-xs text-zinc-900 dark:text-white max-w-[260px] truncate shadow-2xl shadow-rose-500/25 ring-1 ring-rose-500/30"
        style="top: 0; left: 0; transform: translate3d(-9999px, -9999px, 0); opacity: 0;"
      >
        <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse select-none flex-shrink-0"></span>
        <span class="truncate font-semibold">{{ walkthrough.demoDragAnimation()?.sourceTitle || 'Sprint Planning & Milestones' }}</span>
        <span class="text-[10px] text-rose-500 dark:text-rose-400 font-mono font-medium flex-shrink-0">➔ {{ walkthrough.demoDragAnimation()?.targetName || 'Project Titan' }}</span>
      </div>

      <!-- Contextual Compact Tour Card -->
      <div
        #tourCard
        class="absolute z-10 w-84 sm:w-[390px] max-w-[calc(100vw-2rem)] bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl overflow-hidden flex flex-col p-4 sm:p-5 space-y-3.5 shadow-2xl shadow-black/20 dark:shadow-black/50 transition-all duration-300 ease-out focus:outline-none"
        [style.top.px]="cardPosition().top"
        [style.left.px]="cardPosition().left"
        tabindex="0"
      >
        <!-- Card Header: Title & Step counter -->
        <div class="flex items-start justify-between gap-3">
          <h3 class="text-sm sm:text-base font-bold text-zinc-900 dark:text-white tracking-tight leading-snug">
            {{ currentStep().title }}
          </h3>
          <span class="text-[11px] font-mono font-medium px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] text-zinc-600 dark:text-[#a1a1aa] flex-shrink-0">
            {{ walkthrough.currentStepIndex() + 1 }}/{{ walkthrough.totalSteps() }}
          </span>
        </div>

        <!-- Card Body: Description & Optional Tip -->
        <div class="space-y-2.5 text-xs leading-relaxed">
          <p class="text-[12px] sm:text-[13px] text-zinc-600 dark:text-zinc-300 leading-normal">
            {{ currentStep().description }}
          </p>

          @if (currentStep().tip) {
            <div class="p-3 rounded-xl bg-zinc-50 dark:bg-[#0c0c0e] border border-[#e7e9ed] dark:border-[#27272a]/80 text-[11px] sm:text-[12px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <span class="font-semibold text-zinc-900 dark:text-white">Tip:</span> {{ currentStep().tip }}
            </div>
          }
        </div>

        <!-- Card Footer Actions: Skip, Back, Next / Finish -->
        <div class="pt-3 border-t border-[#e7e9ed] dark:border-[#27272a] flex items-center justify-between">
          <button
            type="button"
            (click)="skip()"
            class="text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors px-2.5 py-1 rounded-lg"
            aria-label="Skip walkthrough tour"
          >
            Skip
          </button>

          <div class="flex items-center gap-2">
            @if (walkthrough.currentStepIndex() > 0) {
              <button
                type="button"
                (click)="previous()"
                class="px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-black dark:text-zinc-300 dark:hover:text-white bg-zinc-100 hover:bg-zinc-200 dark:bg-[#18181b] dark:hover:bg-[#27272a] rounded-xl border border-[#dcdde1] dark:border-[#27272a] transition-colors"
                aria-label="Previous step"
              >
                Back
              </button>
            }

            @if (walkthrough.currentStepIndex() < walkthrough.totalSteps() - 1) {
              <button
                type="button"
                (click)="next()"
                class="px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 bg-zinc-900 dark:text-black dark:bg-white dark:hover:bg-zinc-200 rounded-xl transition-colors shadow-xs"
                aria-label="Next step"
              >
                Next &rarr;
              </button>
            } @else {
              <button
                type="button"
                (click)="finish()"
                class="px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 bg-zinc-900 dark:text-black dark:bg-white dark:hover:bg-zinc-200 rounded-xl transition-colors shadow-xs"
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
    @keyframes dashFlow {
      from {
        stroke-dashoffset: 20;
      }
      to {
        stroke-dashoffset: 0;
      }
    }
    .animated-guide-dash {
      animation: dashFlow 0.8s linear infinite !important;
    }
  `,
],
})
export class OnboardingWalkthroughComponent implements OnInit, OnDestroy, AfterViewInit {
  readonly walkthrough = inject(WalkthroughService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  @ViewChild('tourCard', { static: false }) tourCardRef?: ElementRef<HTMLDivElement>;
  @ViewChild('ghostPill', { static: false }) ghostPillRef?: ElementRef<HTMLDivElement>;

  currentStep = this.walkthrough.currentStep;

  viewportWidth = signal<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  viewportHeight = signal<number>(typeof window !== 'undefined' ? window.innerHeight : 768);

  spotlight = signal<ISpotlightRect | null>(null);
  cardPosition = signal<ICardPosition>({ top: 100, left: 100, placement: 'bottom' });
  curvedArrowPath = signal<string>('');

  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private updateTimer?: any;
  private rafId: number | null = null;
  private animStartTime: number | null = null;

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
    this.stop60FpsAnimationLoop();
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
    this.stop60FpsAnimationLoop();
    this.walkthrough.skip();
  }

  finish(): void {
    this.stop60FpsAnimationLoop();
    this.walkthrough.finish();
  }

  scheduleUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    this.updateTargetAndCard();
    this.updateTimer = setTimeout(() => {
      this.updateTargetAndCard();
    }, 120);
  }

  updateTargetAndCard(): void {
    if (typeof document === 'undefined') return;

    const step = this.currentStep();
    if (!step) return;

    const targetEl = document.querySelector(step.targetSelector) as HTMLElement | null;

    if (targetEl && targetEl.offsetParent !== null) {
      const initialRect = targetEl.getBoundingClientRect();
      const needsScroll = initialRect.top < 70 || initialRect.bottom > window.innerHeight - 70;
      if (needsScroll) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      const rect = targetEl.getBoundingClientRect();
      const padding = 8;

      const spot: ISpotlightRect = {
        top: Math.max(0, rect.top - padding),
        left: Math.max(0, rect.left - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      };

      this.spotlight.set(spot);
      this.calculateCardPosition(spot);

      if (step.id === 'collections-memory') {
        const startX = spot.left + spot.width * 0.48;
        const endX = spot.left + spot.width * 0.48;
        const endY = spot.top + 45;
        const startY = Math.min(spot.top + spot.height - 35, endY + 140);
        const controlX = startX - 30;
        const controlY = (startY + endY) / 2;

        this.curvedArrowPath.set(`M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`);
        this.start60FpsAnimationLoop(startX, startY, controlX, controlY, endX, endY);
      } else {
        this.curvedArrowPath.set('');
        this.stop60FpsAnimationLoop();
      }
    } else {
      this.spotlight.set(null);
      this.curvedArrowPath.set('');
      this.stop60FpsAnimationLoop();
      this.calculateFallbackCenterCard();
    }

    this.cdr.detectChanges();
  }

  private start60FpsAnimationLoop(
    startX: number,
    startY: number,
    controlX: number,
    controlY: number,
    endX: number,
    endY: number
  ): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.animStartTime = null;

    this.ngZone.runOutsideAngular(() => {
      const cycleDuration = 2200; // 2.2s seamless loop

      const stepFrame = (timestamp: number) => {
        if (!this.walkthrough.isRunning() || this.currentStep()?.id !== 'collections-memory') {
          this.stop60FpsAnimationLoop();
          return;
        }

        if (!this.animStartTime) {
          this.animStartTime = timestamp;
        }

        const elapsed = (timestamp - this.animStartTime) % cycleDuration;
        const pillEl = this.ghostPillRef?.nativeElement || (typeof document !== 'undefined' ? (document.getElementById('tour-ghost-pill') as HTMLDivElement | null) : null);

        if (pillEl) {
          let x = startX;
          let y = startY;
          let scale = 1.0;
          let opacity = 0;
          let rotate = 0;

          if (elapsed < 300) {
            // Phase 1: Grab (0ms - 300ms) - Fade in and scale up smoothly
            const p = elapsed / 300;
            opacity = p;
            scale = 0.92 + 0.13 * p;
            rotate = -1.5 * p;
            x = startX;
            y = startY;
          } else if (elapsed < 1650) {
            // Phase 2: Flight along quadratic Bezier curve (300ms - 1650ms)
            const u = (elapsed - 300) / 1350;
            // High precision ease-in-out cubic curve
            const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

            const inv = 1 - ease;
            x = inv * inv * startX + 2 * inv * ease * controlX + ease * ease * endX;
            y = inv * inv * startY + 2 * inv * ease * controlY + ease * ease * endY;
            opacity = 1;
            scale = 1.04;
            rotate = -1.5 * (1 - ease * 0.5);
          } else if (elapsed < 1950) {
            // Phase 3: Drop into target collection folder (1650ms - 1950ms)
            const p = (elapsed - 1650) / 300;
            x = endX;
            y = endY;
            scale = 1.04 - 0.08 * p;
            opacity = 1 - 0.6 * p;
            rotate = -0.75 * (1 - p);
          } else {
            // Phase 4: Reset seamlessly for next loop cycle
            x = endX;
            y = endY;
            opacity = 0;
            scale = 0.95;
            rotate = 0;
          }

          pillEl.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg)`;
          pillEl.style.opacity = `${opacity}`;
        }

        this.rafId = requestAnimationFrame(stepFrame);
      };

      this.rafId = requestAnimationFrame(stepFrame);
    });
  }

  private stop60FpsAnimationLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.animStartTime = null;
    const pillEl = this.ghostPillRef?.nativeElement || (typeof document !== 'undefined' ? (document.getElementById('tour-ghost-pill') as HTMLDivElement | null) : null);
    if (pillEl) {
      pillEl.style.transform = 'translate3d(-9999px, -9999px, 0)';
      pillEl.style.opacity = '0';
    }
  }

  private calculateCardPosition(spot: ISpotlightRect): void {
    const cardEl = this.tourCardRef?.nativeElement;
    const actualHeight = cardEl ? cardEl.offsetHeight : 0;
    const cardHeight = Math.max(actualHeight, 280);
    const cardWidth = Math.min(390, window.innerWidth - 32);
    const margin = 16;

    const vWidth = window.innerWidth;
    const vHeight = window.innerHeight;

    let top = 0;
    let left = 0;
    let placement: ICardPosition['placement'] = 'bottom';

    // 1. Try placing to the right if target is in left sidebar (narrow target on the left side)
    if (spot.width < vWidth * 0.45 && spot.left + spot.width + cardWidth + margin < vWidth) {
      placement = 'right';
      left = spot.left + spot.width + margin;
      top = Math.max(margin, Math.min(spot.top, vHeight - cardHeight - margin));
    }
    // 2. Try placing on top if target has enough clearance above
    else if (spot.top - cardHeight - margin >= 16) {
      placement = 'top';
      top = spot.top - cardHeight - margin;
      left = Math.max(margin, Math.min(spot.left, vWidth - cardWidth - margin));
    }
    // 3. Try placing below if target has clearance below
    else if (spot.top + spot.height + cardHeight + margin <= vHeight - 16) {
      placement = 'bottom';
      top = spot.top + spot.height + margin;
      left = Math.max(margin, Math.min(spot.left, vWidth - cardWidth - margin));
    }
    // 4. Try placing on left
    else if (spot.left - cardWidth - margin >= 16) {
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
    const cardEl = this.tourCardRef?.nativeElement;
    const actualHeight = cardEl ? cardEl.offsetHeight : 0;
    const cardHeight = Math.max(actualHeight, 280);
    const cardWidth = Math.min(390, window.innerWidth - 32);
    const vWidth = window.innerWidth;
    const vHeight = window.innerHeight;

    this.cardPosition.set({
      top: Math.max(16, (vHeight - cardHeight) / 2),
      left: Math.max(16, (vWidth - cardWidth) / 2),
      placement: 'center',
    });
  }
}
