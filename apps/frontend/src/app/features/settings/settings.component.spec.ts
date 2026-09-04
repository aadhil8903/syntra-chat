import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsComponent } from './settings.component';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { WalkthroughService } from '../../core/services/walkthrough.service';
import { ThemeService } from '../../core/services/theme.service';
import { of } from 'rxjs';
import { signal } from '@angular/core';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let themeService: ThemeService;

  const mockUser = {
    id: '1',
    firstName: 'Rayyan',
    lastName: 'Al-Sayed',
    email: 'rayyan@company.com',
    role: 'ADMIN',
    departments: ['Engineering'],
  };

  const authServiceMock = {
    currentUser: signal(mockUser),
    isAdmin: signal(true),
    fetchCurrentUserProfile: jest.fn().mockReturnValue(of(mockUser)),
  };

  const apiServiceMock = {
    changePassword: jest.fn().mockReturnValue(of({ success: true })),
    updateMasterPassword: jest.fn().mockReturnValue(of({ success: true })),
  };

  const walkthroughServiceMock = {
    reset: jest.fn(),
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: ApiService, useValue: apiServiceMock },
        { provide: WalkthroughService, useValue: walkthroughServiceMock },
        ThemeService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    themeService = TestBed.inject(ThemeService);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create settings component', () => {
    expect(component).toBeTruthy();
  });

  it('should render appearance theme section with 3 options', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const radiogroup = compiled.querySelector('[role="radiogroup"]');
    expect(radiogroup).toBeTruthy();

    const buttons = compiled.querySelectorAll('[role="radio"]');
    expect(buttons.length).toBe(3);
  });

  it('should switch theme when preview cards are clicked', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll<HTMLButtonElement>('[role="radio"]');

    // Button 0: Dark
    buttons[0].click();
    fixture.detectChanges();
    expect(themeService.themePreference()).toBe('dark');
    expect(buttons[0].getAttribute('aria-checked')).toBe('true');

    // Button 1: Light
    buttons[1].click();
    fixture.detectChanges();
    expect(themeService.themePreference()).toBe('light');
    expect(buttons[1].getAttribute('aria-checked')).toBe('true');

    // Button 2: System preference
    buttons[2].click();
    fixture.detectChanges();
    expect(themeService.themePreference()).toBe('system');
    expect(buttons[2].getAttribute('aria-checked')).toBe('true');
  });
});
