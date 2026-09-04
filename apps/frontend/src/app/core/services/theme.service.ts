import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'dark' | 'light' | 'system';

export const THEME_STORAGE_KEY = 'syntra_theme_mode';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // User-selected preference ('dark' | 'light' | 'system')
  readonly themePreference = signal<ThemeMode>(this.getInitialThemePreference());

  // Effective active theme ('dark' | 'light')
  readonly effectiveTheme = signal<'dark' | 'light'>('dark');

  private mediaQueryList: MediaQueryList | null = null;
  private mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

  constructor() {
    this.initTheme();
  }

  private getInitialThemePreference(): ThemeMode {
    if (!this.isBrowser) return 'system';
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        return stored;
      }
    } catch {
      // Fallback if localStorage access is restricted
    }
    return 'system';
  }

  private initTheme(): void {
    if (!this.isBrowser) return;

    if (window.matchMedia) {
      this.mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQueryListener = () => {
        if (this.themePreference() === 'system') {
          this.updateEffectiveTheme('system');
        }
      };

      if (this.mediaQueryList.addEventListener) {
        this.mediaQueryList.addEventListener('change', this.mediaQueryListener);
      } else if ((this.mediaQueryList as any).addListener) {
        (this.mediaQueryList as any).addListener(this.mediaQueryListener);
      }
    }

    this.updateEffectiveTheme(this.themePreference());
  }

  setTheme(mode: ThemeMode): void {
    this.themePreference.set(mode);
    this.updateEffectiveTheme(mode);

    if (this.isBrowser) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
      } catch {
        // Ignore storage errors
      }
    }
  }

  private updateEffectiveTheme(pref: ThemeMode): void {
    let activeTheme: 'dark' | 'light' = 'dark';

    if (pref === 'dark') {
      activeTheme = 'dark';
    } else if (pref === 'light') {
      activeTheme = 'light';
    } else {
      // System preference
      if (this.isBrowser && this.mediaQueryList) {
        activeTheme = this.mediaQueryList.matches ? 'dark' : 'light';
      } else {
        activeTheme = 'dark';
      }
    }

    this.effectiveTheme.set(activeTheme);

    if (this.isBrowser) {
      this.applyThemeToDom(activeTheme);
    }
  }

  private applyThemeToDom(theme: 'dark' | 'light'): void {
    const root = document.documentElement;
    const body = document.body;

    root.setAttribute('data-theme', theme);
    if (body) {
      body.setAttribute('data-theme', theme);
    }

    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
      if (body) {
        body.classList.remove('dark');
        body.classList.add('light');
      }
      root.style.colorScheme = 'light';
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      if (body) {
        body.classList.remove('light');
        body.classList.add('dark');
      }
      root.style.colorScheme = 'dark';
    }
  }
}
