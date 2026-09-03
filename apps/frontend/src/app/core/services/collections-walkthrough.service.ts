import { Injectable, signal, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { ICollection, IConversation } from '@enter-chat/shared-types';

export interface ICollectionsWalkthroughStepDef {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
}

export const INITIAL_DEMO_COLLECTIONS: ICollection[] = [
  {
    id: 'demo-col-titan',
    name: 'Project Titan',
    userId: 'demo-user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-col-marketing',
    name: 'Q4 Marketing',
    userId: 'demo-user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const INITIAL_DEMO_CONVERSATIONS: IConversation[] = [
  {
    id: 'demo-conv-1',
    title: 'Sprint Planning & Milestones',
    collectionId: null,
    attachedResourceIds: [],
    userId: 'demo-user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-conv-2',
    title: 'Customer Feedback Analysis',
    collectionId: null,
    attachedResourceIds: [],
    userId: 'demo-user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-conv-3',
    title: 'Titan Architecture Review',
    collectionId: 'demo-col-titan',
    attachedResourceIds: [],
    userId: 'demo-user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export interface IDemoDragAnimationState {
  sourceTitle: string;
  targetName: string;
  progress: number;
  phase: 'idle' | 'grabbing' | 'dragging' | 'dropped';
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
      id: 'collections-drag-drop',
      title: 'Drag a chat into a collection',
      description:
        'Grab any chat from Recent Chats and drag it directly onto a Collection to file it. Notice how the target collection highlights upon hover.',
      targetSelector: '[data-tour="collections-section"]',
    },
    {
      id: 'collections-reorganize',
      title: 'Reorganize or drag back out',
      description:
        'You can freely drag a chat between collections, or drag it back down onto Recent Chats to remove it from all collections at any time.',
      targetSelector: '[data-tour="recent-chats-list"], [data-tour="collections-section"]',
    },
    {
      id: 'collections-memory',
      title: 'Shared contextual memory',
      description:
        'Chats inside the same Collection share contextual memory of facts, uploaded documents, and key decisions. Everything outside the collection remains separate.',
      targetSelector: '[data-tour="collections-list"]',
    },
  ];

  private isRunningSignal = signal<boolean>(false);
  private isDemoModeSignal = signal<boolean>(false);
  private currentStepIndexSignal = signal<number>(0);

  // In-memory Ephemeral Demo Data
  private demoCollectionsSignal = signal<ICollection[]>(JSON.parse(JSON.stringify(INITIAL_DEMO_COLLECTIONS)));
  private demoConversationsSignal = signal<IConversation[]>(JSON.parse(JSON.stringify(INITIAL_DEMO_CONVERSATIONS)));
  private demoDragAnimationSignal = signal<IDemoDragAnimationState | null>(null);

  readonly isRunning = computed(() => this.isRunningSignal());
  readonly isDemoMode = computed(() => this.isDemoModeSignal());
  readonly currentStepIndex = computed(() => this.currentStepIndexSignal());
  readonly currentStep = computed(() => {
    const idx = this.currentStepIndexSignal();
    return this.steps[idx] || this.steps[0];
  });
  readonly totalSteps = computed(() => this.steps.length);

  readonly demoCollections = computed(() => this.demoCollectionsSignal());
  readonly demoConversations = computed(() => this.demoConversationsSignal());
  readonly demoDragAnimation = computed(() => this.demoDragAnimationSignal());

  private animTimer: any = null;

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
    this.resetDemoData();
    this.isDemoModeSignal.set(true);
    this.currentStepIndexSignal.set(safeIdx);
    this.isRunningSignal.set(true);
    this.triggerStepAnimation(safeIdx);
  }

  next(): void {
    const nextIdx = this.currentStepIndexSignal() + 1;
    if (nextIdx < this.steps.length) {
      this.currentStepIndexSignal.set(nextIdx);
      this.triggerStepAnimation(nextIdx);
    } else {
      this.finish();
    }
  }

  previous(): void {
    const prevIdx = this.currentStepIndexSignal() - 1;
    if (prevIdx >= 0) {
      this.currentStepIndexSignal.set(prevIdx);
      this.triggerStepAnimation(prevIdx);
    }
  }

  skip(): void {
    this.completeWalkthrough();
  }

  finish(): void {
    this.completeWalkthrough();
  }

  private completeWalkthrough(): void {
    if (this.animTimer) {
      clearInterval(this.animTimer);
      this.animTimer = null;
    }
    this.demoDragAnimationSignal.set(null);
    this.isDemoModeSignal.set(false);
    this.isRunningSignal.set(false);
    this.resetDemoData();

    const user = this.authService.currentUser();
    if (user) {
      localStorage.setItem(this.getStorageKey(user.id), 'true');
    }
  }

  resetDemoData(): void {
    this.demoCollectionsSignal.set(JSON.parse(JSON.stringify(INITIAL_DEMO_COLLECTIONS)));
    this.demoConversationsSignal.set(JSON.parse(JSON.stringify(INITIAL_DEMO_CONVERSATIONS)));
  }

  moveDemoConversation(convId: string, targetColId: string | null): void {
    const convs = this.demoConversationsSignal().map((c) => {
      if (c.id === convId) {
        return { ...c, collectionId: targetColId };
      }
      return c;
    });
    this.demoConversationsSignal.set(convs);
  }

  private triggerStepAnimation(stepIndex: number): void {
    if (this.animTimer) {
      clearInterval(this.animTimer);
      this.animTimer = null;
    }

    if (stepIndex === 1) {
      // Step 2: Animate moving Recent Chat -> Project Titan
      this.runSimulatedDragSequence('Sprint Planning & Milestones', 'Project Titan', 'demo-conv-1', 'demo-col-titan');
    } else if (stepIndex === 2) {
      // Step 3: Animate moving Titan Architecture Review -> Q4 Marketing
      this.runSimulatedDragSequence('Titan Architecture Review', 'Q4 Marketing', 'demo-conv-3', 'demo-col-marketing');
    } else {
      this.demoDragAnimationSignal.set(null);
    }
  }

  private runSimulatedDragSequence(sourceTitle: string, targetName: string, convId: string, colId: string): void {
    let progress = 0;
    this.demoDragAnimationSignal.set({
      sourceTitle,
      targetName,
      progress: 0,
      phase: 'grabbing',
    });

    this.animTimer = setInterval(() => {
      progress += 0.05;
      if (progress <= 0.85) {
        this.demoDragAnimationSignal.set({
          sourceTitle,
          targetName,
          progress,
          phase: 'dragging',
        });
      } else if (progress <= 1.0) {
        this.demoDragAnimationSignal.set({
          sourceTitle,
          targetName,
          progress: 1,
          phase: 'dropped',
        });
        this.moveDemoConversation(convId, colId);
      } else {
        // Loop simulation
        progress = 0;
        this.demoDragAnimationSignal.set({
          sourceTitle,
          targetName,
          progress: 0,
          phase: 'grabbing',
        });
      }
    }, 120);
  }
}
