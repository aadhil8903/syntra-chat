import { environment } from '../../../environments/environment';

export interface AppConfig {
  apiBaseUrl?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: AppConfig;
  }
}

/**
 * Normalizes an API URL ensuring the correct `/api` suffix and handling Docker internal hostnames.
 */
function normalizeApiUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '/api';
  }

  // Handle internal Docker Compose hostname when accessed from a host browser
  if (trimmed.includes('://backend:') || trimmed.includes('://backend/')) {
    return '/api';
  }

  // If it's a relative path, ensure it starts with /
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  // Absolute URL (e.g. https://syntra-chat-backend.onrender.com)
  if (!trimmed.endsWith('/api')) {
    return `${trimmed}/api`;
  }

  return trimmed;
}

/**
 * Returns the resolved API base URL.
 * Resolution priority:
 * 1. Runtime window.__APP_CONFIG__.apiBaseUrl (injected dynamically via /config.js)
 * 2. Runtime localStorage override ('SYNTRA_API_BASE_URL' or 'API_BASE_URL')
 * 3. Compile-time environment configuration (Render production backend URL in prod, localhost:3000 in dev)
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    // In local development (localhost and not production mode), strictly use the local development backend
    if (isLocalhost && !environment.production) {
      // Clear any obsolete remote Render URL from localStorage if present
      const stored =
        localStorage.getItem('SYNTRA_API_BASE_URL') ||
        localStorage.getItem('API_BASE_URL');
      if (stored && (stored.includes('onrender.com') || stored.includes('trycloudflare.com'))) {
        localStorage.removeItem('SYNTRA_API_BASE_URL');
        localStorage.removeItem('API_BASE_URL');
      }
      return normalizeApiUrl(environment.apiBaseUrl || 'http://localhost:3000/api');
    }

    // 1. Runtime window configuration (from /config.js)
    const windowConfig = window.__APP_CONFIG__;
    if (windowConfig && typeof windowConfig.apiBaseUrl === 'string') {
      const candidate = windowConfig.apiBaseUrl.trim();
      if (candidate.length > 0) {
        return normalizeApiUrl(candidate);
      }
    }

    // 2. Runtime localStorage override (ignore stale localhost values on production domains)
    const stored =
      localStorage.getItem('SYNTRA_API_BASE_URL') ||
      localStorage.getItem('API_BASE_URL');
    if (stored && stored.trim()) {
      const candidate = stored.trim();
      if (!isLocalhost && (candidate.includes('localhost') || candidate.includes('127.0.0.1'))) {
        localStorage.removeItem('SYNTRA_API_BASE_URL');
        localStorage.removeItem('API_BASE_URL');
      } else {
        return normalizeApiUrl(candidate);
      }
    }

    // 3. If running on a public domain or in production, use production backend URL
    if (!isLocalhost || environment.production) {
      return normalizeApiUrl(environment.apiBaseUrl || 'https://syntra-chat-backend.onrender.com/api');
    }
  }

  // 4. Default fallback using environment.apiBaseUrl (dev: localhost:3000, prod: Render backend)
  return normalizeApiUrl(environment.apiBaseUrl || '/api');
}


