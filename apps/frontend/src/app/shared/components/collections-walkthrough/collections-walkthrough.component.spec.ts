import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CollectionsWalkthroughComponent } from './collections-walkthrough.component';
import { CollectionsWalkthroughService } from '../../../core/services/collections-walkthrough.service';
import { signal } from '@angular/core';

describe('CollectionsWalkthroughComponent (Spec Round 28 Demo & Drag Animations)', () => {
  let component: CollectionsWalkthroughComponent;
  let fixture: ComponentFixture<CollectionsWalkthroughComponent>;
  let walkthroughMock: any;

  const mockStep = {
    id: 'collections-drag-drop',
    title: 'Drag a chat into a collection',
    description: 'Grab any chat from Recent Chats and drag it directly onto a Collection to file it.',
    targetSelector: '[data-tour="collections-section"]',
  };

  beforeEach(async () => {
    const isRunningSignal = signal<boolean>(true);
    const isDemoModeSignal = signal<boolean>(true);
    const currentStepIndexSignal = signal<number>(1);
    const totalStepsSignal = signal<number>(4);
    const currentStepSignal = signal<any>(mockStep);
    const demoDragAnimationSignal = signal<any>({
      sourceTitle: 'Sprint Planning & Milestones',
      targetName: 'Project Titan',
      progress: 0.5,
      phase: 'dragging',
    });

    walkthroughMock = {
      isRunning: isRunningSignal,
      isDemoMode: isDemoModeSignal,
      currentStepIndex: currentStepIndexSignal,
      totalSteps: totalStepsSignal,
      currentStep: currentStepSignal,
      demoDragAnimation: demoDragAnimationSignal,
      next: jest.fn(),
      previous: jest.fn(),
      skip: jest.fn(),
      finish: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CollectionsWalkthroughComponent],
      providers: [{ provide: CollectionsWalkthroughService, useValue: walkthroughMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectionsWalkthroughComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render dialog, card header, and animated drag ghost pill', () => {
    expect(component).toBeTruthy();
    const dialogEl = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialogEl).toBeTruthy();
    expect(dialogEl.textContent).toContain('Drag a chat into a collection');
    expect(dialogEl.textContent).toContain('Sprint Planning & Milestones');
    expect(dialogEl.textContent).toContain('Project Titan');
  });

  it('should calculate curved SVG guide arrow path and ghost pill position', () => {
    const arrowPath = component.getCurvedGuideArrowPath();
    expect(arrowPath).toMatch(/^M \d+ \d+ Q \d+ \d+ \d+ \d+$/);

    const ghostPos = component.getGhostPillPosition();
    expect(ghostPos.x).toBeGreaterThan(0);
    expect(ghostPos.y).toBeGreaterThan(0);
  });

  it('should handle keyboard navigation (Escape to skip, ArrowRight to next, ArrowLeft to previous)', () => {
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onKeyDown(escEvent);
    expect(walkthroughMock.skip).toHaveBeenCalled();

    const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    component.onKeyDown(rightEvent);
    expect(walkthroughMock.next).toHaveBeenCalled();

    const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    component.onKeyDown(leftEvent);
    expect(walkthroughMock.previous).toHaveBeenCalled();
  });
});
