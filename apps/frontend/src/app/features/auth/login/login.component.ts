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
    <div class="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-[#111114] border border-[#27272a] rounded-2xl p-8">
        <div class="text-center mb-8">
          <div class="inline-flex w-14 h-14 rounded-2xl bg-[#18181b] border border-[#27272a] p-2.5 items-center justify-center mb-4">
            <img src="/logo-icon.png" alt="Syntra Chat Logo" class="w-full h-full object-contain" />
          </div>
          <h1 class="text-2xl font-bold text-white tracking-tight">Welcome to Syntra Chat</h1>
          <p class="text-sm text-[#a1a1aa] mt-1">Sign in to your private knowledge workspace</p>
        </div>

        @if (errorMessage) {
          <div class="mb-4 p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs">
            {{ errorMessage }}
          </div>
        }

        <form (ngSubmit)="onSubmit()" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-[#a1a1aa] mb-1.5">Email Address</label>
            <input
              type="email"
              [(ngModel)]="email"
              name="email"
              required
              class="w-full px-3.5 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white text-sm focus:outline-none focus:border-white transition-colors"
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-[#a1a1aa] mb-1.5">Password</label>
            <input
              type="password"
              [(ngModel)]="password"
              name="password"
              required
              class="w-full px-3.5 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white text-sm focus:outline-none focus:border-white transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            [disabled]="isLoading"
            class="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-[#e4e4e7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
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
