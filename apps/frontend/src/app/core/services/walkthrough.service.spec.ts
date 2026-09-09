import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { WalkthroughService, IWalkthroughStepDef } from './walkthrough.service';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

describe('WalkthroughService', () => {
  let service: WalkthroughService;
  let routerMock: any;
  let authServiceMock: any;
  let apiServiceMock: any;

  beforeEach(() => {
    localStorage.clear();

    routerMock = {
      url: '/dashboard',
      navigateByUrl: jest.fn(),
    };

    authServiceMock = {
      currentUser: jest.fn().mockReturnValue({
        id: 'u1',
        email: 'employee@syntra.com',
        role: 'user',
        onboardingCompleted: false,
      }),
      isAdmin: jest.fn().mockReturnValue(false),
      updateCurrentUser: jest.fn(),
    };

    apiServiceMock = {
      completeOnboarding: jest.fn().mockReturnValue(of({ id: 'u1', onboardingCompleted: true })),
    };

    TestBed.configureTestingModule({
      providers: [
        WalkthroughService,
        { provide: Router, useValue: routerMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: ApiService, useValue: apiServiceMock },
      ],
    });

    service = TestBed.inject(WalkthroughService);
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('should initialize with correct default non-admin step count (11 steps)', () => {
    expect(service.isRunning()).toBe(false);
    expect(service.totalSteps()).toBe(11);
    const steps = service.activeSteps();
    expect(steps.map((s) => s.id)).toEqual([
      'dashboard',
      'documents',
      'chat',
      'collections',
      'collections-memory',
      'archived',
      'mentions',
      'data-analysis',
      'citations',
      'settings',
      'theme',
    ]);
  });

  it('should include admin step when user has admin role (12 steps)', () => {
    authServiceMock.isAdmin.mockReturnValue(true);
    expect(service.totalSteps()).toBe(12);
    const stepIds = service.activeSteps().map((s) => s.id);
    expect(stepIds).toContain('admin');
  });

  it('should start walkthrough and navigate to initial step route', () => {
    service.start(0);
    expect(service.isRunning()).toBe(true);
    expect(service.currentStepIndex()).toBe(0);
    expect(service.currentStep().id).toBe('dashboard');
    expect(service.currentStep().title).toBe('Your workspace at a glance');
  });

  it('should progress to next step and navigate to /documents route', () => {
    service.start(0);
    service.next();
    expect(service.currentStepIndex()).toBe(1);
    expect(service.currentStep().id).toBe('documents');
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/documents');
  });

  it('should support previous step navigation', () => {
    service.start(1);
    service.previous();
    expect(service.currentStepIndex()).toBe(0);
    expect(service.currentStep().id).toBe('dashboard');
  });

  it('should finish walkthrough, persist locally, and notify backend API', () => {
    service.start(0);
    service.finish();

    expect(service.isRunning()).toBe(false);
    expect(localStorage.getItem('syntra_chat_walkthrough_completed')).toBe('true');
    expect(authServiceMock.updateCurrentUser).toHaveBeenCalledWith({ onboardingCompleted: true });
    expect(apiServiceMock.completeOnboarding).toHaveBeenCalled();
  });

  it('should skip walkthrough, persist completion, and close overlay', () => {
    service.start(2);
    service.skip();

    expect(service.isRunning()).toBe(false);
    expect(localStorage.getItem('syntra_chat_walkthrough_completed')).toBe('true');
  });

  it('should reset walkthrough and restart from step 0', () => {
    localStorage.setItem('syntra_chat_walkthrough_completed', 'true');
    service.reset();

    expect(localStorage.getItem('syntra_chat_walkthrough_completed')).toBeNull();
    expect(service.isRunning()).toBe(true);
    expect(service.currentStepIndex()).toBe(0);
  });
});
