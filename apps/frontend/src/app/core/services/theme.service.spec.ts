import { TestBed } from '@angular/core/testing';
import { ThemeService, THEME_STORAGE_KEY } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('light', 'dark');

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

  it('should restore stored preference on initialization', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const newService = TestBed.runInInjectionContext(() => new ThemeService());
    expect(newService.themePreference()).toBe('light');
    expect(newService.effectiveTheme()).toBe('light');
  });
});
