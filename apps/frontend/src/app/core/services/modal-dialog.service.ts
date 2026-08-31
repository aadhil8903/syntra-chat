import { Injectable, signal, computed } from '@angular/core';

export type ModalType = 'confirm' | 'alert' | 'prompt' | 'danger';

export interface IModalOptions {
  title?: string;
  message: string;
  type?: ModalType;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
  defaultValue?: string;
}

interface IActiveModal extends IModalOptions {
  id: string;
  resolve: (value: any) => void;
}

@Injectable({
  providedIn: 'root',
})
export class ModalDialogService {
  private activeModalSignal = signal<IActiveModal | null>(null);

  readonly activeModal = computed(() => this.activeModalSignal());
  readonly isOpen = computed(() => !!this.activeModalSignal());

  confirm(message: string, title: string = 'Confirm Action', confirmText: string = 'Confirm', type: ModalType = 'confirm'): Promise<boolean> {
    return new Promise((resolve) => {
      this.activeModalSignal.set({
        id: Math.random().toString(36).substring(2),
        title,
        message,
        type,
        confirmText,
        cancelText: 'Cancel',
        resolve,
      });
    });
  }

  confirmDanger(message: string, title: string = 'Permanent Deletion', confirmText: string = 'Delete Permanently'): Promise<boolean> {
    return this.confirm(message, title, confirmText, 'danger');
  }

  alert(message: string, title: string = 'Notice', confirmText: string = 'OK'): Promise<void> {
    return new Promise((resolve) => {
      this.activeModalSignal.set({
        id: Math.random().toString(36).substring(2),
        title,
        message,
        type: 'alert',
        confirmText,
        resolve: () => resolve(),
      });
    });
  }

  prompt(message: string, title: string = 'Input Required', defaultValue: string = '', placeholder: string = 'Enter text...'): Promise<string | null> {
    return new Promise((resolve) => {
      this.activeModalSignal.set({
        id: Math.random().toString(36).substring(2),
        title,
        message,
        type: 'prompt',
        defaultValue,
        placeholder,
        confirmText: 'Submit',
        cancelText: 'Cancel',
        resolve,
      });
    });
  }

  closeWithConfirm(value?: any): void {
    const current = this.activeModalSignal();
    if (current) {
      this.activeModalSignal.set(null);
      current.resolve(value !== undefined ? value : true);
    }
  }

  closeWithCancel(): void {
    const current = this.activeModalSignal();
    if (current) {
      this.activeModalSignal.set(null);
      current.resolve(current.type === 'prompt' ? null : false);
    }
  }
}
