import { environment } from '../../../environments/environment';

/**
 * Returns the resolved API base URL.
 * Resolution priority:
 * 1. Runtime window.__APP_CONFIG__.apiBaseUrl (injected dynamically via /config.js)
 * 2. Runtime localStorage override ('SYNTRA_API_BASE_URL' or 'API_BASE_URL')
 * 3. Relative '/api' when accessed from public domain or in production
 * 4. Localhost fallback for local development with ng serve (http://localhost:3000/api)
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // 1. Runtime window configuration (from /config.js or entrypoint script)
    const windowConfig = (window as any).__APP_CONFIG__;
    if (windowConfig && typeof windowConfig.apiBaseUrl === 'string') {
      const trimmed = windowConfig.apiBaseUrl.trim();
      if (trimmed.length > 0) {
        return trimmed.replace(/\/+$/, '');
      }
      // If explicitly empty in production, use relative /api
      return '/api';
    }

    // 2. Runtime localStorage override
    const stored = localStorage.getItem('SYNTRA_API_BASE_URL') || localStorage.getItem('API_BASE_URL');
    if (stored && stored.trim()) {
      return stored.trim().replace(/\/+$/, '');
    }

    // 3. If running on a public domain (non-localhost) or in production, always use relative /api
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalhost || environment.production) {
      return '/api';
    }
  }

  // 4. Default for local development with ng serve on localhost
  return (environment.apiBaseUrl || '/api').trim().replace(/\/+$/, '') || '/api';
}
