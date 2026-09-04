import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

// Defensive cleanup: Ensure no stale service workers or caches from prior builds remain active
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(() => {});
}

// Log non-intrusive build diagnostic information to developer console
if (typeof window !== 'undefined') {
  (window as any).__SYNTRA_VERSION__ = environment.version;
  console.info(`%c[Syntra Chat] v${environment.version} (Build: ${environment.buildTimestamp})`, 'color: #e11d48; font-weight: bold;');
}

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));

