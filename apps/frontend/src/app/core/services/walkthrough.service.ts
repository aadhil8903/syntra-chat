import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

export interface IWalkthroughStepDef {
  id: string;
  title: string;
  description: string;
  tip?: string;
  targetSelector: string;
  route?: string;
  adminOnly?: boolean;
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
  private currentStepIndexSignal = signal<number>(0);

  readonly isRunning = computed(() => this.isRunningSignal());
  readonly currentStepIndex = computed(() => this.currentStepIndexSignal());
  readonly currentStep = computed(() => {
    const steps = this.activeSteps();
    const idx = this.currentStepIndexSignal();
    return steps[idx] || steps[0];
  });
  readonly totalSteps = computed(() => this.activeSteps().length);

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
    const user = this.authService.currentUser();
    if (user) {
      localStorage.removeItem(this.getStorageKey(user.id));
    }
    localStorage.removeItem(this.STORAGE_KEY);
    this.authService.updateCurrentUser({ onboardingCompleted: false });
    this.start(0);
  }

  private completeWalkthrough(): void {
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
  }
}
