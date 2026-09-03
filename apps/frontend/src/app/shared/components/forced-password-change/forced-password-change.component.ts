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
            <div class="relative">
              <input
                [type]="showCurrentPassword ? 'text' : 'password'"
                [(ngModel)]="currentPassword"
                placeholder="Enter the password from your welcome email"
                class="w-full pl-3 pr-10 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white focus:outline-none focus:border-white placeholder:text-zinc-600"
              />
              <button
                type="button"
                (click)="showCurrentPassword = !showCurrentPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors focus:outline-none p-1"
                [title]="showCurrentPassword ? 'Hide password' : 'Show password'"
                aria-label="Toggle temporary password visibility"
              >
                @if (showCurrentPassword) {
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                } @else {
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                }
              </button>
            </div>
          </div>

          <div>
            <label class="block text-[#a1a1aa] font-medium mb-1">New Password *</label>
            <div class="relative">
              <input
                [type]="showNewPassword ? 'text' : 'password'"
                [(ngModel)]="newPassword"
                placeholder="Min 8 characters, mixed case, numbers/symbols"
                class="w-full pl-3 pr-10 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white focus:outline-none focus:border-white placeholder:text-zinc-600"
              />
              <button
                type="button"
                (click)="showNewPassword = !showNewPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors focus:outline-none p-1"
                [title]="showNewPassword ? 'Hide password' : 'Show password'"
                aria-label="Toggle new password visibility"
              >
                @if (showNewPassword) {
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                } @else {
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                }
              </button>
            </div>
          </div>

          <div>
            <label class="block text-[#a1a1aa] font-medium mb-1">Confirm New Password *</label>
            <div class="relative">
              <input
                [type]="showConfirmPassword ? 'text' : 'password'"
                [(ngModel)]="confirmPassword"
                placeholder="Re-enter new password"
                class="w-full pl-3 pr-10 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white focus:outline-none focus:border-white placeholder:text-zinc-600"
              />
              <button
                type="button"
                (click)="showConfirmPassword = !showConfirmPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors focus:outline-none p-1"
                [title]="showConfirmPassword ? 'Hide password' : 'Show password'"
                aria-label="Toggle confirm password visibility"
              >
                @if (showConfirmPassword) {
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                } @else {
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                }
              </button>
            </div>
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
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;
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

