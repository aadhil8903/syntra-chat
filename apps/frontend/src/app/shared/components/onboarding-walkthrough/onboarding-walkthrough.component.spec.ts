import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OnboardingWalkthroughComponent } from './onboarding-walkthrough.component';
import { WalkthroughService } from '../../../core/services/walkthrough.service';
import { signal } from '@angular/core';

describe('OnboardingWalkthroughComponent', () => {
  let component: OnboardingWalkthroughComponent;
  let fixture: ComponentFixture<OnboardingWalkthroughComponent>;
  let walkthroughMock: any;

  const mockStep = {
    id: 'dashboard',
    title: 'Your workspace at a glance',
    description: 'Start here to see your recent activity and workspace overview.',
    tip: 'Use the dashboard to monitor files.',
    targetSelector: '[data-tour="nav-dashboard"]',
    route: '/dashboard',
  };

  beforeEach(async () => {
    const isRunningSignal = signal<boolean>(true);
    const currentStepIndexSignal = signal<number>(0);
    const totalStepsSignal = signal<number>(7);
    const currentStepSignal = signal<any>(mockStep);

    walkthroughMock = {
      isRunning: isRunningSignal,
      currentStepIndex: currentStepIndexSignal,
      totalSteps: totalStepsSignal,
      currentStep: currentStepSignal,
      demoDragAnimation: signal(null),
      next: jest.fn(),
      previous: jest.fn(),
      skip: jest.fn(),
      finish: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [OnboardingWalkthroughComponent],
      providers: [{ provide: WalkthroughService, useValue: walkthroughMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingWalkthroughComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create and render the walkthrough dialog when running', () => {
    expect(component).toBeTruthy();
    const dialogEl = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialogEl).toBeTruthy();
    expect(dialogEl.textContent).toContain('Your workspace at a glance');
    expect(dialogEl.textContent).toContain('Tip:');
  });

  it('should call walkthrough.next on Next button click', () => {
    const nextBtn = fixture.nativeElement.querySelector('button[aria-label="Next step"]');
    expect(nextBtn).toBeTruthy();
    nextBtn.click();
    expect(walkthroughMock.next).toHaveBeenCalled();
  });

  it('should call walkthrough.skip on Skip button click', () => {
    const skipBtn = fixture.nativeElement.querySelector('button[aria-label="Skip walkthrough tour"]');
    expect(skipBtn).toBeTruthy();
    skipBtn.click();
    expect(walkthroughMock.skip).toHaveBeenCalled();
  });

  it('should handle keyboard navigation (Escape, ArrowRight, ArrowLeft)', () => {
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onKeyDown(escapeEvent);
    expect(walkthroughMock.skip).toHaveBeenCalled();

    const arrowRightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    component.onKeyDown(arrowRightEvent);
    expect(walkthroughMock.next).toHaveBeenCalled();

    const arrowLeftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    component.onKeyDown(arrowLeftEvent);
    expect(walkthroughMock.previous).toHaveBeenCalled();
  });

  it('should compute viewport clamped positions properly in calculateTarget', () => {
    const dummySpot = { top: 50, left: 20, width: 100, height: 40 };
    component.spotlight.set(dummySpot);
    component.updateTargetAndCard();

    expect(component.cardPosition()).toBeDefined();
    expect(component.cardPosition().top).toBeGreaterThanOrEqual(0);
    expect(component.cardPosition().left).toBeGreaterThanOrEqual(0);
  });
});
