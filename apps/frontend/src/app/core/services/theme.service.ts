import { Injectable, signal, inject, PLATFORM_ID, NgZone, DestroyRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'dark' | 'light' | 'system';

export const THEME_STORAGE_KEY = 'syntra_theme_mode';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef, { optional: true });
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // User-selected preference ('dark' | 'light' | 'system')
  readonly themePreference = signal<ThemeMode>(this.getInitialThemePreference());

  // Effective active theme ('dark' | 'light')
  readonly effectiveTheme = signal<'dark' | 'light'>(this.computeInitialEffectiveTheme());

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

  getSystemTheme(): 'dark' | 'light' {
    if (!this.isBrowser) return 'dark';
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch {
      // Fallback
    }
    return 'dark';
  }

  private computeInitialEffectiveTheme(): 'dark' | 'light' {
    const pref = this.getInitialThemePreference();
    if (pref === 'dark') return 'dark';
    if (pref === 'light') return 'light';
    return this.getSystemTheme();
  }

  private initTheme(): void {
    if (!this.isBrowser) return;

    if (typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
      
      this.mediaQueryListener = (event: MediaQueryListEvent) => {
        this.ngZone.run(() => {
          if (this.themePreference() === 'system') {
            const systemTheme: 'dark' | 'light' =
              event && typeof event.matches === 'boolean'
                ? (event.matches ? 'dark' : 'light')
                : this.getSystemTheme();
            this.effectiveTheme.set(systemTheme);
            this.applyThemeToDom(systemTheme);
          }
        });
      };

      if (this.mediaQueryList.addEventListener) {
        this.mediaQueryList.addEventListener('change', this.mediaQueryListener);
      } else if ((this.mediaQueryList as any).addListener) {
        (this.mediaQueryList as any).addListener(this.mediaQueryListener);
      }

      this.destroyRef?.onDestroy(() => {
        this.cleanupListener();
      });
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
    let activeTheme: 'dark' | 'light';

    if (pref === 'dark') {
      activeTheme = 'dark';
    } else if (pref === 'light') {
      activeTheme = 'light';
    } else {
      // System preference: dynamically check matchMedia
      activeTheme = this.getSystemTheme();
    }

    this.effectiveTheme.set(activeTheme);

    if (this.isBrowser) {
      this.applyThemeToDom(activeTheme);
    }
  }

  private applyThemeToDom(theme: 'dark' | 'light'): void {
    if (!this.isBrowser || typeof document === 'undefined') return;

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

  private cleanupListener(): void {
    if (this.mediaQueryList && this.mediaQueryListener) {
      if (this.mediaQueryList.removeEventListener) {
        this.mediaQueryList.removeEventListener('change', this.mediaQueryListener);
      } else if ((this.mediaQueryList as any).removeListener) {
        (this.mediaQueryList as any).removeListener(this.mediaQueryListener);
      }
      this.mediaQueryListener = null;
      this.mediaQueryList = null;
    }
  }
}
