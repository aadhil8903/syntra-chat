import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { WalkthroughService } from '../../core/services/walkthrough.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { IUser } from '@enter-chat/shared-types';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10 animate-fade-in text-zinc-900 dark:text-zinc-200">
      <!-- Settings Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1 class="text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-white tracking-tight">Platform Settings</h1>
          <p class="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Review your account profile, manage password security, and check active AI infrastructure.
          </p>
        </div>
        <button
          type="button"
          (click)="replayWalkthrough()"
          class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors shadow-2xs flex-shrink-0 self-start sm:self-auto min-h-[38px]"
          title="Replay guided onboarding tour"
        >
          <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Replay Walkthrough</span>
        </button>
      </div>

      <!-- Section 1: Account Profile -->
      <section class="space-y-4">
        <div>
          <h2 class="text-xs font-semibold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase">Account</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Profile information and workspace role.</p>
        </div>

        @if (user(); as u) {
          <div class="divide-y divide-zinc-200/70 dark:divide-zinc-800/80 border-y border-zinc-200/70 dark:border-zinc-800/80 text-xs">
            <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span class="text-zinc-500 dark:text-zinc-400 font-medium w-48">Full Name</span>
              <span class="text-zinc-900 dark:text-white font-medium text-sm sm:text-right">{{ u.firstName }} {{ u.lastName }}</span>
            </div>
            <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span class="text-zinc-500 dark:text-zinc-400 font-medium w-48">Email Address (Login ID)</span>
              <span class="text-zinc-900 dark:text-white font-mono sm:text-right">{{ u.email }}</span>
            </div>
            <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span class="text-zinc-500 dark:text-zinc-400 font-medium w-48">User Role</span>
              <span class="text-zinc-700 dark:text-zinc-300 font-mono text-xs sm:text-right">
                {{ u.role }}
              </span>
            </div>
            <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span class="text-zinc-500 dark:text-zinc-400 font-medium w-48">Departments</span>
              <span class="text-zinc-700 dark:text-zinc-300 font-mono sm:text-right">{{ u.departments && u.departments.length ? u.departments.join(', ') : 'None' }}</span>
            </div>
          </div>
        }
      </section>

      <!-- Section 2: Appearance Theme Selector -->
      <section data-tour="settings-theme" class="space-y-4 pt-2">
        <div>
          <h2 class="text-xs font-semibold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase">Appearance</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Choose how Syntra Chat appears on your screen.</p>
        </div>

        <div
          role="radiogroup"
          aria-label="Theme selection"
          class="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <!-- 1. Dark Theme Option -->
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="themeService.themePreference() === 'dark'"
            aria-label="Dark theme"
            tabindex="0"
            (click)="themeService.setTheme('dark')"
            (keydown.enter)="themeService.setTheme('dark')"
            (keydown.space)="themeService.setTheme('dark'); $event.preventDefault()"
            class="group text-left p-3 rounded-xl border transition-all flex flex-col gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48]"
            [ngClass]="themeService.themePreference() === 'dark' ? 'border-[#e11d48] bg-rose-50/20 dark:bg-zinc-900/90 ring-1 ring-[#e11d48]' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900/40'"
          >
            <!-- Compact Mini Preview (Dark) -->
            <div class="w-full h-14 rounded-lg overflow-hidden border border-[#27272a] bg-[#09090b] flex relative select-none pointer-events-none shadow-2xs">
              <div class="w-[26%] bg-[#0c0c0e] border-r border-[#27272a] p-1 flex flex-col justify-between">
                <div class="space-y-1">
                  <div class="w-2 h-0.5 bg-[#e11d48] rounded-full"></div>
                  <div class="w-full h-0.5 bg-zinc-600 rounded-full"></div>
                  <div class="w-3/4 h-0.5 bg-zinc-700 rounded-full"></div>
                </div>
                <div class="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
              </div>
              <div class="flex-1 flex flex-col justify-between bg-[#09090b] p-1.5">
                <div class="flex items-center justify-between">
                  <div class="w-6 h-0.5 bg-zinc-600 rounded-full"></div>
                  <div class="w-1.5 h-1.5 rounded-full bg-[#e11d48]"></div>
                </div>
                <div class="space-y-1">
                  <div class="self-end ml-auto px-1 py-0.5 bg-[#212124] border border-[#27272a] rounded-xs w-8 flex items-center">
                    <div class="w-5 h-0.5 bg-zinc-200 rounded-full"></div>
                  </div>
                  <div class="flex items-center gap-1">
                    <div class="w-1 h-1 rounded-xs bg-[#e11d48]"></div>
                    <div class="w-7 h-0.5 bg-zinc-400 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Label + Radio Circle -->
            <div class="flex items-center justify-between pt-0.5">
              <div>
                <div class="text-xs font-semibold text-zinc-900 dark:text-white">Dark</div>
                <div class="text-[11px] text-zinc-500 dark:text-zinc-400">Dark theme</div>
              </div>
              <div
                class="w-4 h-4 rounded-full border flex items-center justify-center transition-colors"
                [ngClass]="themeService.themePreference() === 'dark' ? 'border-[#e11d48] bg-[#e11d48]' : 'border-zinc-400 dark:border-zinc-600 bg-transparent'"
              >
                @if (themeService.themePreference() === 'dark') {
                  <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
                }
              </div>
            </div>
          </button>

          <!-- 2. Light Theme Option -->
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="themeService.themePreference() === 'light'"
            aria-label="Light theme"
            tabindex="0"
            (click)="themeService.setTheme('light')"
            (keydown.enter)="themeService.setTheme('light')"
            (keydown.space)="themeService.setTheme('light'); $event.preventDefault()"
            class="group text-left p-3 rounded-xl border transition-all flex flex-col gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48]"
            [ngClass]="themeService.themePreference() === 'light' ? 'border-[#e11d48] bg-rose-50/20 dark:bg-zinc-900/90 ring-1 ring-[#e11d48]' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900/40'"
          >
            <!-- Compact Mini Preview (Light) -->
            <div class="w-full h-14 rounded-lg overflow-hidden border border-[#dcdde1] bg-[#f7f8fa] flex relative select-none pointer-events-none shadow-2xs">
              <div class="w-[26%] bg-[#ffffff] border-r border-[#dcdde1] p-1 flex flex-col justify-between">
                <div class="space-y-1">
                  <div class="w-2 h-0.5 bg-[#e11d48] rounded-full"></div>
                  <div class="w-full h-0.5 bg-zinc-400 rounded-full"></div>
                  <div class="w-3/4 h-0.5 bg-zinc-300 rounded-full"></div>
                </div>
                <div class="w-1.5 h-1.5 rounded-full bg-zinc-400"></div>
              </div>
              <div class="flex-1 flex flex-col justify-between bg-[#f7f8fa] p-1.5">
                <div class="flex items-center justify-between">
                  <div class="w-6 h-0.5 bg-zinc-400 rounded-full"></div>
                  <div class="w-1.5 h-1.5 rounded-full bg-[#e11d48]"></div>
                </div>
                <div class="space-y-1">
                  <div class="self-end ml-auto px-1 py-0.5 bg-[#eef0f3] rounded-xs w-8 flex items-center">
                    <div class="w-5 h-0.5 bg-zinc-700 rounded-full"></div>
                  </div>
                  <div class="flex items-center gap-1">
                    <div class="w-1 h-1 rounded-xs bg-[#e11d48]"></div>
                    <div class="w-7 h-0.5 bg-zinc-600 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Label + Radio Circle -->
            <div class="flex items-center justify-between pt-0.5">
              <div>
                <div class="text-xs font-semibold text-zinc-900 dark:text-white">Light</div>
                <div class="text-[11px] text-zinc-500 dark:text-zinc-400">Light theme</div>
              </div>
              <div
                class="w-4 h-4 rounded-full border flex items-center justify-center transition-colors"
                [ngClass]="themeService.themePreference() === 'light' ? 'border-[#e11d48] bg-[#e11d48]' : 'border-zinc-400 dark:border-zinc-600 bg-transparent'"
              >
                @if (themeService.themePreference() === 'light') {
                  <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
                }
              </div>
            </div>
          </button>

          <!-- 3. System Preference Option -->
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="themeService.themePreference() === 'system'"
            aria-label="System preference theme"
            tabindex="0"
            (click)="themeService.setTheme('system')"
            (keydown.enter)="themeService.setTheme('system')"
            (keydown.space)="themeService.setTheme('system'); $event.preventDefault()"
            class="group text-left p-3 rounded-xl border transition-all flex flex-col gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48]"
            [ngClass]="themeService.themePreference() === 'system' ? 'border-[#e11d48] bg-rose-50/20 dark:bg-zinc-900/90 ring-1 ring-[#e11d48]' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900/40'"
          >
            <!-- Compact Mini Preview (System Split) -->
            <div class="w-full h-14 rounded-lg overflow-hidden border border-zinc-300 dark:border-[#27272a] flex relative select-none pointer-events-none shadow-2xs">
              <!-- Dark Left Split -->
              <div class="w-1/2 bg-[#09090b] flex flex-col justify-between border-r border-[#27272a] p-1.5">
                <div class="flex items-center gap-1">
                  <div class="w-1.5 h-1.5 rounded-full bg-[#e11d48]"></div>
                  <div class="w-4 h-0.5 bg-zinc-600 rounded-full"></div>
                </div>
                <div class="space-y-0.5">
                  <div class="flex items-center gap-0.5">
                    <div class="w-1 h-1 rounded-xs bg-[#e11d48]"></div>
                    <div class="w-4 h-0.5 bg-zinc-400 rounded-full"></div>
                  </div>
                  <div class="self-end ml-auto px-0.5 py-0.5 bg-[#212124] rounded-xs w-4">
                    <div class="w-full h-0.5 bg-zinc-300 rounded-full"></div>
                  </div>
                </div>
              </div>
              <!-- Light Right Split -->
              <div class="w-1/2 bg-[#f7f8fa] flex flex-col justify-between p-1.5">
                <div class="flex items-center justify-end gap-1">
                  <div class="w-4 h-0.5 bg-zinc-400 rounded-full"></div>
                  <div class="w-1.5 h-1.5 rounded-full bg-[#e11d48]"></div>
                </div>
                <div class="space-y-0.5">
                  <div class="self-end ml-auto px-0.5 py-0.5 bg-[#eef0f3] rounded-xs w-4">
                    <div class="w-full h-0.5 bg-zinc-600 rounded-full"></div>
                  </div>
                  <div class="flex items-center gap-0.5">
                    <div class="w-1 h-1 rounded-xs bg-[#e11d48]"></div>
                    <div class="w-4 h-0.5 bg-zinc-500 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Label + Radio Circle -->
            <div class="flex items-center justify-between pt-0.5">
              <div>
                <div class="text-xs font-semibold text-zinc-900 dark:text-white">System Preference</div>
                <div class="text-[11px] text-zinc-500 dark:text-zinc-400">Use device setting</div>
              </div>
              <div
                class="w-4 h-4 rounded-full border flex items-center justify-center transition-colors"
                [ngClass]="themeService.themePreference() === 'system' ? 'border-[#e11d48] bg-[#e11d48]' : 'border-zinc-400 dark:border-zinc-600 bg-transparent'"
              >
                @if (themeService.themePreference() === 'system') {
                  <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
                }
              </div>
            </div>
          </button>
        </div>
      </section>

      <!-- Section 3: Security & Password -->
      <section class="space-y-4 pt-2">
        <div>
          <h2 class="text-xs font-semibold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase">Security</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Change your account login password.</p>
        </div>

        @if (passwordSuccess) {
          <div class="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <span>{{ passwordSuccess }}</span>
            <button (click)="passwordSuccess = ''" class="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-white font-bold ml-2">×</button>
          </div>
        }
        @if (passwordError) {
          <div class="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{{ passwordError }}</span>
            <button (click)="passwordError = ''" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-white font-bold ml-2">×</button>
          </div>
        }

        <div class="space-y-3 max-w-xl text-xs">
          <!-- Current Password -->
          <div>
            <label class="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">Current Password *</label>
            <div class="relative">
              <input
                [type]="showCurrentPassword ? 'text' : 'password'"
                [(ngModel)]="currentPassword"
                placeholder="Enter your current password"
                class="w-full pl-3 pr-10 py-2 rounded-lg bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-colors"
              />
              <button
                type="button"
                (click)="showCurrentPassword = !showCurrentPassword"
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
                [title]="showCurrentPassword ? 'Hide password' : 'Show password'"
                aria-label="Toggle current password visibility"
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

          <!-- New & Confirm Passwords -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">New Password *</label>
              <div class="relative">
                <input
                  [type]="showNewPassword ? 'text' : 'password'"
                  [(ngModel)]="newPassword"
                  placeholder="Min 8 chars, 1 uppercase, 1 symbol/digit"
                  class="w-full pl-3 pr-10 py-2 rounded-lg bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-colors"
                />
                <button
                  type="button"
                  (click)="showNewPassword = !showNewPassword"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
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
              <label class="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">Confirm New Password *</label>
              <div class="relative">
                <input
                  [type]="showConfirmPassword ? 'text' : 'password'"
                  [(ngModel)]="confirmPassword"
                  placeholder="Re-enter new password"
                  class="w-full pl-3 pr-10 py-2 rounded-lg bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-colors"
                />
                <button
                  type="button"
                  (click)="showConfirmPassword = !showConfirmPassword"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
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

          <div class="pt-1">
            <button
              (click)="updatePassword()"
              [disabled]="updatingPassword || !currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()"
              class="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-900 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 shadow-2xs"
            >
              {{ updatingPassword ? 'Verifying & Saving...' : 'Update Password' }}
            </button>
          </div>
        </div>
      </section>

      <!-- Section 4: Master Admin Password (Admin Only) -->
      @if (isAdmin()) {
        <section class="space-y-4 pt-2">
          <div class="flex items-center gap-2">
            <h2 class="text-xs font-semibold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase">Master Admin Password</h2>
            <span class="text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-400">Admin Only</span>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400 -mt-2">Separate high-privilege secret required to create or promote users to Administrator.</p>

          @if (masterPasswordSuccess) {
            <div class="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
              <span>{{ masterPasswordSuccess }}</span>
              <button (click)="masterPasswordSuccess = ''" class="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-white font-bold ml-2">×</button>
            </div>
          }
          @if (masterPasswordError) {
            <div class="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
              <span>{{ masterPasswordError }}</span>
              <button (click)="masterPasswordError = ''" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-white font-bold ml-2">×</button>
            </div>
          }

          <div class="space-y-3 max-w-xl text-xs">
            <div>
              <label class="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">Current Master Password *</label>
              <div class="relative">
                <input
                  [type]="showCurrentMasterPassword ? 'text' : 'password'"
                  [(ngModel)]="currentMasterPassword"
                  placeholder="Enter current master admin password"
                  class="w-full pl-3 pr-10 py-2 rounded-lg bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-mono transition-colors"
                />
                <button
                  type="button"
                  (click)="showCurrentMasterPassword = !showCurrentMasterPassword"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
                  [title]="showCurrentMasterPassword ? 'Hide password' : 'Show password'"
                  aria-label="Toggle current master password visibility"
                >
                  @if (showCurrentMasterPassword) {
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

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">New Master Password *</label>
                <div class="relative">
                  <input
                    [type]="showNewMasterPassword ? 'text' : 'password'"
                    [(ngModel)]="newMasterPassword"
                    placeholder="Min 10 chars, uppercase, digit, symbol"
                    class="w-full pl-3 pr-10 py-2 rounded-lg bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-mono transition-colors"
                  />
                  <button
                    type="button"
                    (click)="showNewMasterPassword = !showNewMasterPassword"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
                    [title]="showNewMasterPassword ? 'Hide password' : 'Show password'"
                    aria-label="Toggle new master password visibility"
                  >
                    @if (showNewMasterPassword) {
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
                <label class="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">Confirm New Master Password *</label>
                <div class="relative">
                  <input
                    [type]="showConfirmMasterPassword ? 'text' : 'password'"
                    [(ngModel)]="confirmMasterPassword"
                    placeholder="Re-enter new master password"
                    class="w-full pl-3 pr-10 py-2 rounded-lg bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-mono transition-colors"
                  />
                  <button
                    type="button"
                    (click)="showConfirmMasterPassword = !showConfirmMasterPassword"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
                    [title]="showConfirmMasterPassword ? 'Hide password' : 'Show password'"
                    aria-label="Toggle confirm master password visibility"
                  >
                    @if (showConfirmMasterPassword) {
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

            <div class="pt-1">
              <button
                (click)="updateMasterPassword()"
                [disabled]="updatingMasterPassword || !currentMasterPassword.trim() || !newMasterPassword.trim() || !confirmMasterPassword.trim()"
                class="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-900 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 shadow-2xs"
              >
                {{ updatingMasterPassword ? 'Verifying & Updating...' : 'Update Master Password' }}
              </button>
            </div>
          </div>
        </section>
      }

      <!-- Section 5: AI & Infrastructure -->
      <section class="space-y-4 pt-2">
        <div>
          <h2 class="text-xs font-semibold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase">AI & Infrastructure</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Active database, reasoning model, and embedding service status.</p>
        </div>

        <div class="divide-y divide-zinc-200/70 dark:divide-zinc-800/80 border-y border-zinc-200/70 dark:border-zinc-800/80 text-xs">
          <!-- Database Row -->
          <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="space-y-0.5">
              <div class="flex items-center gap-2">
                <span class="font-medium text-zinc-900 dark:text-white text-sm">MongoDB Atlas Cluster</span>
                <span class="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 font-medium">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Connected
                </span>
              </div>
              <p class="text-zinc-500 dark:text-zinc-400 text-[11px]">Encrypted cloud storage for user accounts, ACL rules, and chat history.</p>
            </div>
            <span class="text-zinc-400 dark:text-zinc-500 text-[11px] font-mono sm:text-right">Database</span>
          </div>

          <!-- LLM Provider Row -->
          <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="space-y-0.5">
              <div class="flex items-center gap-2">
                <span class="font-medium text-zinc-900 dark:text-white text-sm">Gemini Flash (Google)</span>
                <span class="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 font-medium">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active
                </span>
              </div>
              <p class="text-zinc-500 dark:text-zinc-400 text-[11px]">High-performance neural reasoning with dataset calculation capability.</p>
            </div>
            <span class="text-zinc-400 dark:text-zinc-500 text-[11px] font-mono sm:text-right">LLM Provider</span>
          </div>

          <!-- Embedding Model Row -->
          <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="space-y-0.5">
              <div class="flex items-center gap-2">
                <span class="font-medium text-zinc-900 dark:text-white text-sm">BGE Base (768 Dim)</span>
                <span class="inline-flex items-center text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                  Local
                </span>
              </div>
              <p class="text-zinc-500 dark:text-zinc-400 text-[11px]">Running locally with sentence-transformers for RAG chunk retrieval.</p>
            </div>
            <span class="text-zinc-400 dark:text-zinc-500 text-[11px] font-mono sm:text-right">Embedding Model</span>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private walkthrough = inject(WalkthroughService);
  readonly themeService = inject(ThemeService);

  user = this.auth.currentUser;
  isAdmin = this.auth.isAdmin;

  ngOnInit(): void {
    this.auth.fetchCurrentUserProfile().subscribe({ error: () => {} });
  }

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;
  updatingPassword = false;
  passwordSuccess = '';
  passwordError = '';

  // Master Password State
  currentMasterPassword = '';
  newMasterPassword = '';
  confirmMasterPassword = '';
  showCurrentMasterPassword = false;
  showNewMasterPassword = false;
  showConfirmMasterPassword = false;
  updatingMasterPassword = false;
  masterPasswordSuccess = '';
  masterPasswordError = '';

  replayWalkthrough(): void {
    this.walkthrough.reset();
  }

  updatePassword(): void {
    if (!this.currentPassword.trim()) {
      this.passwordError = 'Please enter your current password.';
      return;
    }
    if (!this.newPassword.trim()) {
      this.passwordError = 'Please enter a new password.';
      return;
    }
    if (this.newPassword.length < 8) {
      this.passwordError = 'New password must be at least 8 characters long.';
      return;
    }
    const complexityRegex = /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/;
    if (!complexityRegex.test(this.newPassword)) {
      this.passwordError = 'New password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'New passwords do not match.';
      return;
    }
    if (this.currentPassword === this.newPassword) {
      this.passwordError = 'New password cannot be the same as your current password.';
      return;
    }

    this.updatingPassword = true;
    this.passwordError = '';
    this.passwordSuccess = '';

    this.api.changePassword({
      currentPassword: this.currentPassword,
      newPassword: this.newPassword,
    }).subscribe({
      next: (res) => {
        this.updatingPassword = false;
        this.passwordSuccess = res?.message || 'Password updated successfully! Other active sessions have been invalidated.';
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
      },
      error: (err) => {
        this.updatingPassword = false;
        const msg = err.error?.message;
        if (Array.isArray(msg)) {
          this.passwordError = msg.join(' ');
        } else {
          this.passwordError = msg || err.error?.error || 'Failed to update password. Please verify your current password.';
        }
      },
    });
  }

  updateMasterPassword(): void {
    if (!this.currentMasterPassword.trim()) {
      this.masterPasswordError = 'Please enter the current master admin password.';
      return;
    }
    if (!this.newMasterPassword.trim()) {
      this.masterPasswordError = 'Please enter a new master admin password.';
      return;
    }
    if (this.newMasterPassword.length < 8) {
      this.masterPasswordError = 'New master password must be at least 8 characters long.';
      return;
    }
    if (this.newMasterPassword !== this.confirmMasterPassword) {
      this.masterPasswordError = 'New master passwords do not match.';
      return;
    }
    if (this.currentMasterPassword === this.newMasterPassword) {
      this.masterPasswordError = 'New master password cannot be the same as the current master password.';
      return;
    }

    this.updatingMasterPassword = true;
    this.masterPasswordError = '';
    this.masterPasswordSuccess = '';

    this.api.changeMasterPassword({
      currentMasterPassword: this.currentMasterPassword,
      newMasterPassword: this.newMasterPassword,
    }).subscribe({
      next: (res) => {
        this.updatingMasterPassword = false;
        this.masterPasswordSuccess = res?.message || 'Master admin password updated successfully!';
        this.currentMasterPassword = '';
        this.newMasterPassword = '';
        this.confirmMasterPassword = '';
      },
      error: (err) => {
        this.updatingMasterPassword = false;
        const msg = err.error?.message;
        if (Array.isArray(msg)) {
          this.masterPasswordError = msg.join(' ');
        } else {
          this.masterPasswordError = msg || err.error?.error || 'Failed to update master password. Please verify your current master password.';
        }
      },
    });
  }
}
