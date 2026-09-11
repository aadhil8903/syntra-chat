import { TestBed } from '@angular/core/testing';
import { ThemeService, THEME_STORAGE_KEY } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let listeners: ((e: any) => void)[] = [];
  let currentMatches = false;

  const mockMatchMedia = (matches: boolean) => {
    currentMatches = matches;
    listeners = [];
    return (query: string) => ({
      matches: currentMatches,
      media: query,
      onchange: null,
      addEventListener: jest.fn((event: string, callback: any) => {
        if (event === 'change') {
          listeners.push(callback);
        }
      }),
      removeEventListener: jest.fn((event: string, callback: any) => {
        if (event === 'change') {
          listeners = listeners.filter((l) => l !== callback);
        }
      }),
      addListener: jest.fn((callback: any) => listeners.push(callback)),
      removeListener: jest.fn((callback: any) => {
        listeners = listeners.filter((l) => l !== callback);
      }),
      dispatchEvent: jest.fn(),
    });
  };

  const triggerSystemThemeChange = (matches: boolean) => {
    currentMatches = matches;
    listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
  };

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('light', 'dark');

    window.matchMedia = jest.fn().mockImplementation(mockMatchMedia(false));

    TestBed.configureTestingModule({
      providers: [ThemeService],
    });
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('light', 'dark');
  });

  it('should be created and default to system preference', () => {
    expect(service).toBeTruthy();
    expect(service.themePreference()).toBe('system');
  });

  it('should set theme to dark and update localStorage and DOM', () => {
    service.setTheme('dark');
    expect(service.themePreference()).toBe('dark');
    expect(service.effectiveTheme()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('should set theme to light and update localStorage and DOM', () => {
    service.setTheme('light');
    expect(service.themePreference()).toBe('light');
    expect(service.effectiveTheme()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should resolve system preference to dark when OS is dark', () => {
    window.matchMedia = jest.fn().mockImplementation(mockMatchMedia(true));
    const darkService = TestBed.runInInjectionContext(() => new ThemeService());
    expect(darkService.themePreference()).toBe('system');
    expect(darkService.effectiveTheme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should resolve system preference to light when OS is light', () => {
    window.matchMedia = jest.fn().mockImplementation(mockMatchMedia(false));
    const lightService = TestBed.runInInjectionContext(() => new ThemeService());
    expect(lightService.themePreference()).toBe('system');
    expect(lightService.effectiveTheme()).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should dynamically update effective theme when OS theme changes in system mode without refresh', () => {
    service.setTheme('system');
    expect(service.themePreference()).toBe('system');
    expect(service.effectiveTheme()).toBe('light');

    // Simulate OS switching to dark
    triggerSystemThemeChange(true);
    expect(service.themePreference()).toBe('system'); // Selected remains 'system'
    expect(service.effectiveTheme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system'); // Persistence remains 'system'

    // Simulate OS switching back to light
    triggerSystemThemeChange(false);
    expect(service.themePreference()).toBe('system'); // Selected remains 'system'
    expect(service.effectiveTheme()).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('should NOT update effective theme on OS change when explicit dark or light is selected', () => {
    service.setTheme('dark');
    expect(service.effectiveTheme()).toBe('dark');

    // OS changes to light
    triggerSystemThemeChange(false);
    expect(service.themePreference()).toBe('dark');
    expect(service.effectiveTheme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    service.setTheme('light');
    expect(service.effectiveTheme()).toBe('light');

    // OS changes to dark
    triggerSystemThemeChange(true);
    expect(service.themePreference()).toBe('light');
    expect(service.effectiveTheme()).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('should restore stored preference on initialization', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const newService = TestBed.runInInjectionContext(() => new ThemeService());
    expect(newService.themePreference()).toBe('light');
    expect(newService.effectiveTheme()).toBe('light');
  });

  it('should persist "system" when selected and not overwrite with effective value', () => {
    service.setTheme('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');

    triggerSystemThemeChange(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');

    triggerSystemThemeChange(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });
});
