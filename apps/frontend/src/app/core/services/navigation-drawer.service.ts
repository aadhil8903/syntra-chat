import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class NavigationDrawerService {
  private readonly _isOpen = signal<boolean>(false);

  readonly isOpen = this._isOpen.asReadonly();

  constructor() {
    effect(() => {
      if (typeof document !== 'undefined') {
        if (this._isOpen()) {
          document.body.classList.add('overflow-hidden');
        } else {
          document.body.classList.remove('overflow-hidden');
        }
      }
    });
  }

  open(): void {
    this._isOpen.set(true);
  }

  close(): void {
    this._isOpen.set(false);
  }

  toggle(): void {
    this._isOpen.update((v) => !v);
  }
}
