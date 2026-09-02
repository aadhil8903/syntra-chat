import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-forced-password-change',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div class="w-full max-w-md bg-[#111114] border border-[#27272a] rounded-2xl p-6 space-y-4">
        
        <div class="border-b border-[#27272a] pb-3 space-y-1">
          <h2 class="text-base font-bold text-white tracking-tight">Set Your Personal Password</h2>
          <p class="text-xs text-[#a1a1aa] leading-relaxed">
            Your account was provisioned with a temporary password. For security, please choose a new private password to continue.
          </p>
        </div>

        @if (errorMessage) {
          <div class="p-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-zinc-200">
            {{ errorMessage }}
          </div>
        }

        <div class="space-y-3 text-xs">
          <div>
            <label class="block text-[#a1a1aa] font-medium mb-1">Temporary Password *</label>
            <input
              type="password"
              [(ngModel)]="currentPassword"
              placeholder="Enter the password from your welcome email"
              class="w-full px-3 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white focus:outline-none focus:border-white placeholder:text-zinc-600"
            />
          </div>

          <div>
            <label class="block text-[#a1a1aa] font-medium mb-1">New Password *</label>
            <input
              type="password"
              [(ngModel)]="newPassword"
              placeholder="Min 8 characters, mixed case, numbers/symbols"
              class="w-full px-3 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white focus:outline-none focus:border-white placeholder:text-zinc-600"
            />
          </div>

          <div>
            <label class="block text-[#a1a1aa] font-medium mb-1">Confirm New Password *</label>
            <input
              type="password"
              [(ngModel)]="confirmPassword"
              placeholder="Re-enter new password"
              class="w-full px-3 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white focus:outline-none focus:border-white placeholder:text-zinc-600"
            />
          </div>
        </div>

        <div class="pt-2">
          <button
            type="button"
            (click)="submitPasswordChange()"
            [disabled]="loading || !currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()"
            class="w-full py-2.5 bg-white hover:bg-zinc-200 text-black text-xs font-semibold rounded-xl transition-colors disabled:opacity-40"
          >
            {{ loading ? 'Updating Password...' : 'Save and Continue' }}
          </button>
        </div>

      </div>
    </div>
  `,
})
export class ForcedPasswordChangeComponent {
  @Output() passwordChanged = new EventEmitter<void>();

  private api = inject(ApiService);

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  loading = false;
  errorMessage = '';

  submitPasswordChange(): void {
    if (!this.currentPassword.trim()) {
      this.errorMessage = 'Please enter your temporary password.';
      return;
    }
    if (!this.newPassword.trim()) {
      this.errorMessage = 'Please enter a new password.';
      return;
    }
    if (this.newPassword.length < 8) {
      this.errorMessage = 'New password must be at least 8 characters long.';
      return;
    }
    const complexityRegex = /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/;
    if (!complexityRegex.test(this.newPassword)) {
      this.errorMessage = 'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }
    if (this.currentPassword === this.newPassword) {
      this.errorMessage = 'New password cannot be the same as your temporary password.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.api.changePassword({
      currentPassword: this.currentPassword,
      newPassword: this.newPassword,
    }).subscribe({
      next: () => {
        this.loading = false;
        this.passwordChanged.emit();
      },
      error: (err) => {
        this.loading = false;
        const msg = err.error?.error || err.error?.message;
        if (Array.isArray(msg)) {
          this.errorMessage = msg.join(' ');
        } else {
          this.errorMessage = msg || 'Failed to update password. Please verify your temporary password.';
        }
      },
    });
  }
}

