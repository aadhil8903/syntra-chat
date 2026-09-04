import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { WalkthroughService } from '../../../core/services/walkthrough.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="min-h-screen bg-[#f7f8fa] dark:bg-[#09090b] flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl p-8 shadow-sm dark:shadow-none">
        <div class="text-center mb-8">
          <div class="inline-flex w-14 h-14 rounded-2xl bg-[#f0f1f3] dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] p-2.5 items-center justify-center mb-4 shadow-lg shadow-rose-950/10 dark:shadow-rose-950/20">
            <img src="/logo-icon.svg" alt="Syntra Chat Logo" class="w-full h-full object-contain" onerror="this.src='/logo-icon.png'" />
          </div>
          <h1 class="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Welcome to Syntra Chat</h1>
          <p class="text-sm text-zinc-500 dark:text-[#a1a1aa] mt-1">Sign in to your private knowledge workspace</p>
        </div>

        @if (errorMessage) {
          <div class="mb-4 p-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs">
            {{ errorMessage }}
          </div>
        }

        <form (ngSubmit)="onSubmit()" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-zinc-700 dark:text-[#a1a1aa] mb-1.5">Email Address</label>
            <input
              type="email"
              [(ngModel)]="email"
              name="email"
              required
              class="w-full px-3.5 py-2.5 rounded-xl bg-[#f8f9fa] dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-zinc-900 dark:focus:border-white transition-colors"
              placeholder="aadil@company.com"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-700 dark:text-[#a1a1aa] mb-1.5">Password</label>
            <div class="relative">
              <input
                [type]="showPassword ? 'text' : 'password'"
                [(ngModel)]="password"
                name="password"
                required
                class="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#f8f9fa] dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-zinc-900 dark:focus:border-white transition-colors"
                placeholder="••••••••"
              />
              <button
                type="button"
                (click)="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors focus:outline-none p-1"
                [title]="showPassword ? 'Hide password' : 'Show password'"
                aria-label="Toggle password visibility"
              >
                @if (showPassword) {
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

          <button
            type="submit"
            [disabled]="isLoading"
            class="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-[#e4e4e7] dark:text-black font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-sm"
          >
            {{ isLoading ? 'Signing In...' : 'Sign In' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private authService = inject(AuthService);
  private walkthroughService = inject(WalkthroughService);
  private router = inject(Router);

  email = '';
  password = '';
  showPassword = false;
  errorMessage = '';
  isLoading = false;

  onSubmit(): void {
    if (!this.email || !this.password) {
      this.errorMessage = 'Please enter your email and password.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.user.mustChangePassword) {
          this.router.navigate(['/settings']);
        } else {
          this.router.navigate(['/dashboard']).then(() => {
            setTimeout(() => this.walkthroughService.checkAndAutoStart(), 400);
          });
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Invalid email or password.';
      },
    });
  }
}
