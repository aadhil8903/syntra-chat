import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { ICollection, IConversation } from '@enter-chat/shared-types';

export interface IWalkthroughStepDef {
  id: string;
  title: string;
  description: string;
  tip?: string;
  targetSelector: string;
  route?: string;
  adminOnly?: boolean;
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
}

@Injectable({
  providedIn: 'root',
})
export class WalkthroughService {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly apiService = inject(ApiService);

  private readonly STORAGE_KEY = 'syntra_chat_walkthrough_completed';

  private readonly allSteps: IWalkthroughStepDef[] = [
    {
      id: 'dashboard',
      title: 'Your workspace at a glance',
      description:
        'Start here to see your recent activity and workspace overview. Use the Dashboard as your starting point before jumping into documents, conversations, or analysis.',
      targetSelector: '[data-tour="nav-dashboard"]',
      route: '/dashboard',
    },
    {
      id: 'documents',
      title: 'Explore Enterprise Files',
      description:
        'Browse authorized company documents, PDFs, datasets, and spreadsheets. Only administrators can upload or manage files, ensuring secure and centralized knowledge governance.',
      tip: 'Need access to restricted files? Click the "Request Access" button on any locked document to notify your administrator.',
      targetSelector: '[data-tour="nav-documents"]',
      route: '/documents',
    },
    {
      id: 'chat',
      title: 'Ask questions about your data',
      description:
        'Use natural language to ask questions about your authorized documents and datasets. Syntra Chat can help summarize, compare, calculate, and explain information without requiring you to search through files manually.',
      tip: 'Try asking for a summary, comparison, or specific value from a document.',
      targetSelector: '[data-tour="nav-chat"]',
      route: '/chat',
    },
    {
      id: 'collections',
      title: 'Organize Chats with Collections',
      description:
        'Group related conversations into dedicated project folders (e.g. Project Titan, Q4 Marketing). Instead of letting important discussions get lost in Recent Chats, Collections keep your workspace structured and organized.',
      tip: 'Click the + icon in the Collections header to create a new collection, or click the folder arrow to expand and collapse project threads.',
      targetSelector: '[data-tour="collections-section"]',
      route: '/chat',
    },
    {
      id: 'collections-memory',
      title: 'Drag & Drop Filing & Shared Memory',
      description:
        'Grab any chat from Recent Chats and drag it directly onto a Collection to file it. Chats inside the same Collection automatically share contextual memory of verified data, uploaded files, and key decisions across threads.',
      tip: 'Watch the animated demo: drag chats between collections or drag them back out to Recent Chats at any time.',
      targetSelector: '[data-tour="collections-section"]',
      route: '/chat',
    },
    {
      id: 'archived',
      title: 'Clean Workspace with Archived Chats',
      description:
        'Keep your active workspace focused and clutter-free by archiving past conversations. Archived chats preserve all message history, RAG grounding citations, and analytical insights so you can search or restore them at any time.',
      tip: 'Click "Archived" in the sidebar to view past records, search historical threads, or unarchive sessions back to your active list.',
      targetSelector: '[data-tour="nav-archived"]',
      route: '/chat',
    },
    {
      id: 'mentions',
      title: 'Point the AI to a specific file',
      description:
        'Type @ in Chat to select a document or dataset you want to use as a source. This is useful when you want your question to focus on one specific resource instead of your entire workspace.',
      tip: 'Try: @Sales.xlsx — then ask for the monthly trend.',
      targetSelector: '[data-tour="chat-mention-btn"], [data-tour="chat-input-area"]',
      route: '/chat',
    },
    {
      id: 'data-analysis',
      title: 'Turn datasets into insights',
      description:
        'Ask questions about CSV or Excel data and explore calculations, trends, tables, and visualizations. You can describe what you want in natural language instead of manually performing every calculation.',
      tip: 'Try asking: Which month had the highest revenue?',
      targetSelector: '[data-tour="chat-input-area"]',
      route: '/chat',
    },
    {
      id: 'citations',
      title: 'See where the answer came from',
      description:
        'When an answer uses your uploaded sources, check the referenced document or data location to understand what supports the result. This makes important answers easier to verify.',
      targetSelector: '[data-tour="chat-mention-btn"], [data-tour="chat-input-area"]',
      route: '/chat',
    },
    {
      id: 'settings',
      title: 'Control your account',
      description:
        'Use Settings to manage your account preferences and available options. The settings available to you depend on your account and role.',
      targetSelector: '[data-tour="nav-settings"]',
      route: '/settings',
    },
    {
      id: 'theme',
      title: 'Appearance & Themes',
      description:
        'Customize your visual experience by switching between Dark Mode, Light Mode, or matching your System preferences at any time.',
      tip: 'Toggle between themes instantly to match your work environment.',
      targetSelector: '[data-tour="settings-theme"]',
      route: '/settings',
    },
    {
      id: 'admin',
      title: 'Manage your workspace',
      description:
        'Admin tools let authorized administrators manage users, roles, departments, permissions, and workspace-level controls. These controls affect what users can access, so use them carefully.',
      targetSelector: '[data-tour="nav-admin"]',
      route: '/admin',
      adminOnly: true,
    },
  ];

  readonly activeSteps = computed(() => {
    const isAdmin = this.authService.isAdmin();
    return this.allSteps.filter((s) => !s.adminOnly || isAdmin);
  });

  private isRunningSignal = signal<boolean>(false);
  private isDemoModeSignal = signal<boolean>(false);
  private currentStepIndexSignal = signal<number>(0);

  // In-memory Ephemeral Demo Data for Collections Animation
  private demoCollectionsSignal = signal<ICollection[]>(JSON.parse(JSON.stringify(INITIAL_DEMO_COLLECTIONS)));
  private demoConversationsSignal = signal<IConversation[]>(JSON.parse(JSON.stringify(INITIAL_DEMO_CONVERSATIONS)));
  private demoDragAnimationSignal = signal<IDemoDragAnimationState | null>(null);

  readonly isRunning = computed(() => this.isRunningSignal());
  readonly isDemoMode = computed(() => this.isDemoModeSignal());
  readonly currentStepIndex = computed(() => this.currentStepIndexSignal());
  readonly currentStep = computed(() => {
    const steps = this.activeSteps();
    const idx = this.currentStepIndexSignal();
    return steps[idx] || steps[0];
  });
  readonly totalSteps = computed(() => this.activeSteps().length);

  readonly demoCollections = computed(() => this.demoCollectionsSignal());
  readonly demoConversations = computed(() => this.demoConversationsSignal());
  readonly demoDragAnimation = computed(() => this.demoDragAnimationSignal());

  private animTimer: any = null;

  private getStorageKey(userId?: string): string {
    return `syntra_chat_walkthrough_completed_${userId || this.authService.currentUser()?.id || 'guest'}`;
  }

  checkAndAutoStart(): void {
    const user = this.authService.currentUser();
    if (!user) return;

    const userKey = this.getStorageKey(user.id);
    const localCompleted = localStorage.getItem(userKey) === 'true';
    const userCompleted = !!user.onboardingCompleted;

    if (!localCompleted && !userCompleted && !this.isRunningSignal()) {
      // Delay slightly to ensure target elements are rendered in DOM
      setTimeout(() => this.start(), 300);
    }
  }

  start(stepIndex = 0): void {
    const steps = this.activeSteps();
    const safeIdx = Math.max(0, Math.min(stepIndex, steps.length - 1));
    this.currentStepIndexSignal.set(safeIdx);
    this.isRunningSignal.set(true);
    this.handleStepNavigation(safeIdx);
  }

  next(): void {
    const steps = this.activeSteps();
    const nextIdx = this.currentStepIndexSignal() + 1;
    if (nextIdx < steps.length) {
      this.currentStepIndexSignal.set(nextIdx);
      this.handleStepNavigation(nextIdx);
    } else {
      this.finish();
    }
  }

  previous(): void {
    const prevIdx = this.currentStepIndexSignal() - 1;
    if (prevIdx >= 0) {
      this.currentStepIndexSignal.set(prevIdx);
      this.handleStepNavigation(prevIdx);
    }
  }

  goToStep(index: number): void {
    const steps = this.activeSteps();
    if (index >= 0 && index < steps.length) {
      this.currentStepIndexSignal.set(index);
      this.handleStepNavigation(index);
    }
  }

  skip(): void {
    this.completeWalkthrough();
  }

  finish(): void {
    this.completeWalkthrough();
  }

  reset(): void {
    this.stopAnimationAndDemo();
    const user = this.authService.currentUser();
    if (user) {
      localStorage.removeItem(this.getStorageKey(user.id));
    }
    localStorage.removeItem(this.STORAGE_KEY);
    this.authService.updateCurrentUser({ onboardingCompleted: false });
    this.start(0);
  }

  private completeWalkthrough(): void {
    this.stopAnimationAndDemo();
    this.isRunningSignal.set(false);
    const user = this.authService.currentUser();
    if (user) {
      localStorage.setItem(this.getStorageKey(user.id), 'true');
    }
    localStorage.setItem(this.STORAGE_KEY, 'true');
    this.authService.updateCurrentUser({ onboardingCompleted: true });

    this.apiService.completeOnboarding().subscribe({
      next: (user) => {
        if (user) {
          this.authService.updateCurrentUser(user);
        }
      },
      error: () => {
        // Backend failure gracefully ignored - local persistence already updated
      },
    });
  }

  private handleStepNavigation(stepIdx: number): void {
    const steps = this.activeSteps();
    const step = steps[stepIdx];
    if (step && step.route) {
      const currentUrl = this.router.url;
      if (!currentUrl.startsWith(step.route)) {
        this.router.navigateByUrl(step.route);
      }
    }

    if (step && step.id === 'collections-memory') {
      this.resetDemoData();
      this.isDemoModeSignal.set(true);
      this.demoDragAnimationSignal.set({
        sourceTitle: 'Sprint Planning & Milestones',
        targetName: 'Project Titan',
      });
    } else {
      this.stopAnimationAndDemo();
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

  private stopAnimationAndDemo(): void {
    this.demoDragAnimationSignal.set(null);
    this.isDemoModeSignal.set(false);
    this.resetDemoData();
  }
}
