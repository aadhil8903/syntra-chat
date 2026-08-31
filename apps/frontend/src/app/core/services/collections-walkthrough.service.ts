import { Injectable, signal, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';

export interface ICollectionsWalkthroughStepDef {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
}

@Injectable({
  providedIn: 'root',
})
export class CollectionsWalkthroughService {
  private readonly authService = inject(AuthService);

  private readonly steps: ICollectionsWalkthroughStepDef[] = [
    {
      id: 'collections-intro',
      title: 'Keep related chats together',
      description:
        'Collections group chats that belong to the same topic or project. Chats can stay in Recent Chats or be organized into a Collection whenever you need more structure.',
      targetSelector: '[data-tour="collections-section"]',
    },
    {
      id: 'collections-create',
      title: 'Create a collection',
      description:
        "Create a Collection from the sidebar and give it a name that matches the project or topic you're working on. You can rename or delete it later.",
      targetSelector: '[data-tour="create-collection-btn"]',
    },
    {
      id: 'collections-memory',
      title: 'Your chats can share context',
      description:
        'Chats inside the same Collection share a compact memory of useful facts and decisions from those conversations. A chat outside the Collection cannot use that shared context.',
      targetSelector: '[data-tour="collections-list"]',
    },
    {
      id: 'collections-drag-drop',
      title: 'File a chat into a collection',
      description:
        'Drag a chat from Recent Chats onto a Collection to move it there. The move happens immediately, and you can undo it from the confirmation message.',
      targetSelector: '[data-tour="recent-chats-list"], [data-tour="collections-section"]',
    },
  ];

  private isRunningSignal = signal<boolean>(false);
  private currentStepIndexSignal = signal<number>(0);

  readonly isRunning = computed(() => this.isRunningSignal());
  readonly currentStepIndex = computed(() => this.currentStepIndexSignal());
  readonly currentStep = computed(() => {
    const idx = this.currentStepIndexSignal();
    return this.steps[idx] || this.steps[0];
  });
  readonly totalSteps = computed(() => this.steps.length);

  private getStorageKey(userId?: string): string {
    return `syntra_chat_seen_collections_walkthrough_${userId || this.authService.currentUser()?.id || 'guest'}`;
  }

  hasSeenWalkthrough(): boolean {
    const user = this.authService.currentUser();
    if (!user) return false;
    const key = this.getStorageKey(user.id);
    return localStorage.getItem(key) === 'true';
  }

  checkAndTrigger(): void {
    const user = this.authService.currentUser();
    if (!user) return;

    if (!this.hasSeenWalkthrough() && !this.isRunningSignal()) {
      setTimeout(() => this.start(), 400);
    }
  }

  start(stepIndex = 0): void {
    const safeIdx = Math.max(0, Math.min(stepIndex, this.steps.length - 1));
    this.currentStepIndexSignal.set(safeIdx);
    this.isRunningSignal.set(true);
  }

  next(): void {
    const nextIdx = this.currentStepIndexSignal() + 1;
    if (nextIdx < this.steps.length) {
      this.currentStepIndexSignal.set(nextIdx);
    } else {
      this.finish();
    }
  }

  previous(): void {
    const prevIdx = this.currentStepIndexSignal() - 1;
    if (prevIdx >= 0) {
      this.currentStepIndexSignal.set(prevIdx);
    }
  }

  skip(): void {
    this.completeWalkthrough();
  }

  finish(): void {
    this.completeWalkthrough();
  }

  private completeWalkthrough(): void {
    this.isRunningSignal.set(false);
    const user = this.authService.currentUser();
    if (user) {
      localStorage.setItem(this.getStorageKey(user.id), 'true');
    }
  }
}
