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
    <div class="p-4 sm:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in text-zinc-900 dark:text-zinc-200">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Platform Settings</h1>
          <p class="text-xs sm:text-sm text-zinc-500 dark:text-[#a1a1aa] mt-1">
            Review your account profile, manage password security, and check active AI infrastructure.
          </p>
        </div>
        <button
          type="button"
          (click)="replayWalkthrough()"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-zinc-50 text-zinc-800 dark:bg-[#18181b] dark:hover:bg-[#212124] dark:text-zinc-200 border border-[#dcdde1] dark:border-[#27272a] hover:border-zinc-300 dark:hover:border-zinc-600 text-xs font-semibold flex items-center justify-center gap-2 transition-colors flex-shrink-0 self-start sm:self-auto shadow-xs"
          title="Replay guided onboarding tour"
        >
          <svg class="w-4 h-4 text-zinc-600 dark:text-zinc-300" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Replay Walkthrough</span>
        </button>
      </div>

      <!-- Account Info Card -->
      <div class="bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl p-6 space-y-4 shadow-xs">
        <h2 class="text-base font-semibold text-zinc-900 dark:text-white">Account Profile</h2>
        @if (user(); as u) {
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div class="p-3 bg-[#f8f9fa] dark:bg-[#18181b] rounded-xl border border-[#e7e9ed] dark:border-[#27272a]">
              <span class="text-xs text-zinc-500 dark:text-[#71717a] block">Full Name</span>
              <span class="font-medium text-zinc-900 dark:text-white">{{ u.firstName }} {{ u.lastName }}</span>
            </div>
            <div class="p-3 bg-[#f8f9fa] dark:bg-[#18181b] rounded-xl border border-[#e7e9ed] dark:border-[#27272a]">
              <span class="text-xs text-zinc-500 dark:text-[#71717a] block">Email Address (Login ID)</span>
              <span class="font-medium text-zinc-900 dark:text-white font-mono text-xs">{{ u.email }}</span>
            </div>
            <div class="p-3 bg-[#f8f9fa] dark:bg-[#18181b] rounded-xl border border-[#e7e9ed] dark:border-[#27272a]">
              <span class="text-xs text-zinc-500 dark:text-[#71717a] block">User Role</span>
              <span class="font-mono text-xs text-zinc-900 dark:text-white uppercase font-bold">{{ u.role }}</span>
            </div>
            <div class="p-3 bg-[#f8f9fa] dark:bg-[#18181b] rounded-xl border border-[#e7e9ed] dark:border-[#27272a]">
              <span class="text-xs text-zinc-500 dark:text-[#71717a] block">Departments</span>
              <span class="font-mono text-xs text-zinc-700 dark:text-zinc-300">{{ u.departments && u.departments.length ? u.departments.join(', ') : 'None' }}</span>
            </div>
          </div>
        }
      </div>

      <!-- Appearance Theme Selector Card -->
      <div data-tour="settings-theme" class="bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl p-6 space-y-4 shadow-xs">
        <div>
          <h2 class="text-base font-semibold text-zinc-900 dark:text-white">Appearance</h2>
          <p class="text-xs text-zinc-500 dark:text-[#a1a1aa] mt-0.5">Customize your interface theme and visual preferences.</p>
        </div>

        <div
          role="radiogroup"
          aria-label="Theme selection"
          class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-2xl"
        >
          <!-- 1. Dark Theme Card -->
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="themeService.themePreference() === 'dark'"
            aria-label="Dark theme"
            tabindex="0"
            (click)="themeService.setTheme('dark')"
            (keydown.enter)="themeService.setTheme('dark')"
            (keydown.space)="themeService.setTheme('dark'); $event.preventDefault()"
            class="group text-left p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48] min-h-[44px]"
            [ngClass]="themeService.themePreference() === 'dark' ? 'border-[#e11d48] bg-rose-50/40 dark:bg-[#18181b] ring-1 ring-[#e11d48]' : 'border-[#dcdde1] hover:border-zinc-300 bg-[#f8f9fa] dark:border-[#27272a] dark:hover:border-zinc-600 dark:bg-[#18181b]'"
          >
            <!-- Miniature Preview Thumbnail (Dark: Original Syntra Dark) -->
            <div class="theme-preview-card w-full h-16 sm:h-20 rounded-lg overflow-hidden border border-[#27272a] bg-[#09090b] flex relative select-none shadow-sm pointer-events-none">
              <!-- Mini Sidebar -->
              <div class="w-[24%] bg-[#0c0c0e] border-r border-[#27272a] p-1 flex flex-col justify-between">
                <div class="space-y-1">
                  <div class="w-2.5 h-1 bg-[#e11d48] rounded-full"></div>
                  <div class="w-full h-0.5 bg-zinc-600 rounded-full"></div>
                  <div class="w-3/4 h-0.5 bg-zinc-700 rounded-full"></div>
                  <div class="w-4/5 h-0.5 bg-zinc-700 rounded-full"></div>
                </div>
                <div class="w-2 h-2 rounded-full bg-zinc-700"></div>
              </div>
              <!-- Mini Main Area -->
              <div class="flex-1 flex flex-col justify-between bg-[#09090b]">
                <!-- Mini Header -->
                <div class="h-3 bg-[#0c0c0e] border-b border-[#27272a] px-1.5 flex items-center justify-between">
                  <div class="w-8 h-1 bg-zinc-600 rounded-full"></div>
                  <div class="w-1.5 h-1.5 rounded-full bg-[#e11d48]"></div>
                </div>
                <!-- Mini Messages -->
                <div class="p-1.5 space-y-1 flex-1 flex flex-col justify-center">
                  <!-- User Message -->
                  <div class="self-end px-1.5 py-0.5 bg-[#212124] border border-[#27272a] rounded-sm max-w-[70%] flex items-center">
                    <div class="w-7 h-1 bg-zinc-200 rounded-full"></div>
                  </div>
                  <!-- AI Message -->
                  <div class="self-start flex items-center gap-1 max-w-[85%]">
                    <div class="w-1.5 h-1.5 rounded-xs bg-[#e11d48] flex-shrink-0"></div>
                    <div class="w-10 h-1 bg-zinc-400 rounded-full"></div>
                  </div>
                </div>
                <!-- Mini Composer -->
                <div class="p-1 bg-[#09090b]">
                  <div class="h-2 bg-[#111114] border border-[#27272a] rounded-sm px-1 flex items-center justify-between">
                    <div class="w-6 h-0.5 bg-zinc-500 rounded-full"></div>
                    <div class="w-1 h-1 rounded-full bg-white"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Label & Subtitle & Selected State Indicator -->
            <div class="flex items-start justify-between gap-1 w-full">
              <div>
                <div class="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <span>Dark</span>
                </div>
                <div class="text-[11px] text-zinc-500 dark:text-[#71717a] mt-0.5 leading-tight">Dark theme</div>
              </div>
              <div
                class="w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                [ngClass]="themeService.themePreference() === 'dark' ? 'border-[#e11d48] bg-[#e11d48]' : 'border-zinc-400 dark:border-zinc-600 bg-transparent'"
              >
                @if (themeService.themePreference() === 'dark') {
                  <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
                }
              </div>
            </div>
          </button>

          <!-- 2. Light Theme Card -->
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="themeService.themePreference() === 'light'"
            aria-label="Light theme"
            tabindex="0"
            (click)="themeService.setTheme('light')"
            (keydown.enter)="themeService.setTheme('light')"
            (keydown.space)="themeService.setTheme('light'); $event.preventDefault()"
            class="group text-left p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48] min-h-[44px]"
            [ngClass]="themeService.themePreference() === 'light' ? 'border-[#e11d48] bg-rose-50/40 dark:bg-[#18181b] ring-1 ring-[#e11d48]' : 'border-[#dcdde1] hover:border-zinc-300 bg-[#f8f9fa] dark:border-[#27272a] dark:hover:border-zinc-600 dark:bg-[#18181b]'"
          >
            <!-- Miniature Preview Thumbnail (Light: Clean off-white & white) -->
            <div class="theme-preview-card w-full h-16 sm:h-20 rounded-lg overflow-hidden border border-[#dcdde1] bg-[#f7f8fa] flex relative select-none shadow-sm pointer-events-none">
              <!-- Mini Sidebar -->
              <div class="w-[24%] bg-[#ffffff] border-r border-[#dcdde1] p-1 flex flex-col justify-between">
                <div class="space-y-1">
                  <div class="w-2.5 h-1 bg-[#e11d48] rounded-full"></div>
                  <div class="w-full h-0.5 bg-zinc-400 rounded-full"></div>
                  <div class="w-3/4 h-0.5 bg-zinc-300 rounded-full"></div>
                  <div class="w-4/5 h-0.5 bg-zinc-300 rounded-full"></div>
                </div>
                <div class="w-2 h-2 rounded-full bg-zinc-400"></div>
              </div>
              <!-- Mini Main Area -->
              <div class="flex-1 flex flex-col justify-between bg-[#f7f8fa]">
                <!-- Mini Header -->
                <div class="h-3 bg-[#ffffff] border-b border-[#dcdde1] px-1.5 flex items-center justify-between">
                  <div class="w-8 h-1 bg-zinc-400 rounded-full"></div>
                  <div class="w-1.5 h-1.5 rounded-full bg-[#e11d48]"></div>
                </div>
                <!-- Mini Messages -->
                <div class="p-1.5 space-y-1 flex-1 flex flex-col justify-center">
                  <!-- User Message -->
                  <div class="self-end px-1.5 py-0.5 bg-[#eef0f3] rounded-sm max-w-[70%] flex items-center">
                    <div class="w-7 h-1 bg-zinc-700 rounded-full"></div>
                  </div>
                  <!-- AI Message -->
                  <div class="self-start flex items-center gap-1 max-w-[85%]">
                    <div class="w-1.5 h-1.5 rounded-xs bg-[#e11d48] flex-shrink-0"></div>
                    <div class="w-10 h-1 bg-zinc-600 rounded-full"></div>
                  </div>
                </div>
                <!-- Mini Composer -->
                <div class="p-1 bg-[#f7f8fa]">
                  <div class="h-2 bg-[#ffffff] border border-[#dcdde1] rounded-sm px-1 flex items-center justify-between">
                    <div class="w-6 h-0.5 bg-zinc-400 rounded-full"></div>
                    <div class="w-1 h-1 rounded-full bg-[#e11d48]"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Label & Subtitle & Selected State Indicator -->
            <div class="flex items-start justify-between gap-1 w-full">
              <div>
                <div class="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <span>Light</span>
                </div>
                <div class="text-[11px] text-zinc-500 dark:text-[#71717a] mt-0.5 leading-tight">Light theme</div>
              </div>
              <div
                class="w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                [ngClass]="themeService.themePreference() === 'light' ? 'border-[#e11d48] bg-[#e11d48]' : 'border-zinc-400 dark:border-zinc-600 bg-transparent'"
              >
                @if (themeService.themePreference() === 'light') {
                  <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
                }
              </div>
            </div>
          </button>

          <!-- 3. System Preference Card -->
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="themeService.themePreference() === 'system'"
            aria-label="System preference theme"
            tabindex="0"
            (click)="themeService.setTheme('system')"
            (keydown.enter)="themeService.setTheme('system')"
            (keydown.space)="themeService.setTheme('system'); $event.preventDefault()"
            class="group text-left p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48] min-h-[44px]"
            [ngClass]="themeService.themePreference() === 'system' ? 'border-[#e11d48] bg-rose-50/40 dark:bg-[#18181b] ring-1 ring-[#e11d48]' : 'border-[#dcdde1] hover:border-zinc-300 bg-[#f8f9fa] dark:border-[#27272a] dark:hover:border-zinc-600 dark:bg-[#18181b]'"
          >
            <!-- Miniature Preview Thumbnail (System: Split Original Dark/Light) -->
            <div class="theme-preview-card w-full h-16 sm:h-20 rounded-lg overflow-hidden border border-zinc-300 dark:border-[#27272a] flex relative select-none shadow-sm pointer-events-none">
              <!-- Left Split: Dark -->
              <div class="w-1/2 bg-[#09090b] flex flex-col justify-between border-r border-[#27272a]">
                <!-- Mini Dark Header -->
                <div class="h-3 bg-[#0c0c0e] border-b border-[#27272a] px-1 flex items-center gap-1">
                  <div class="w-1.5 h-1.5 rounded-full bg-[#e11d48]"></div>
                  <div class="w-4 h-1 bg-zinc-600 rounded-full"></div>
                </div>
                <!-- Mini Dark Content -->
                <div class="p-1 space-y-1 flex-1 flex flex-col justify-center">
                  <div class="self-start flex items-center gap-1">
                    <div class="w-1.5 h-1.5 rounded-xs bg-[#e11d48]"></div>
                    <div class="w-6 h-1 bg-zinc-400 rounded-full"></div>
                  </div>
                  <div class="self-end px-1 py-0.5 bg-[#212124] rounded-sm w-6">
                    <div class="w-full h-0.5 bg-zinc-300 rounded-full"></div>
                  </div>
                </div>
                <!-- Mini Dark Composer -->
                <div class="p-0.5 bg-[#09090b]">
                  <div class="h-1.5 bg-[#111114] border border-[#27272a] rounded-xs px-0.5 flex items-center justify-between">
                    <div class="w-3 h-0.5 bg-zinc-500 rounded-full"></div>
                    <div class="w-0.5 h-0.5 rounded-full bg-white"></div>
                  </div>
                </div>
              </div>

              <!-- Right Split: Light -->
              <div class="w-1/2 bg-[#f7f8fa] flex flex-col justify-between">
                <!-- Mini Light Header -->
                <div class="h-3 bg-[#ffffff] border-b border-[#dcdde1] px-1 flex items-center justify-end gap-1">
                  <div class="w-4 h-1 bg-zinc-400 rounded-full"></div>
                  <div class="w-1.5 h-1.5 rounded-full bg-[#e11d48]"></div>
                </div>
                <!-- Mini Light Content -->
                <div class="p-1 space-y-1 flex-1 flex flex-col justify-center">
                  <div class="self-end px-1 py-0.5 bg-[#eef0f3] rounded-sm w-6">
                    <div class="w-full h-0.5 bg-zinc-600 rounded-full"></div>
                  </div>
                  <div class="self-start flex items-center gap-1">
                    <div class="w-1.5 h-1.5 rounded-xs bg-[#e11d48]"></div>
                    <div class="w-6 h-1 bg-zinc-500 rounded-full"></div>
                  </div>
                </div>
                <!-- Mini Light Composer -->
                <div class="p-0.5 bg-[#f7f8fa]">
                  <div class="h-1.5 bg-[#ffffff] border border-[#dcdde1] rounded-xs px-0.5 flex items-center justify-between">
                    <div class="w-3 h-0.5 bg-zinc-400 rounded-full"></div>
                    <div class="w-0.5 h-0.5 rounded-full bg-[#e11d48]"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Label & Subtitle & Selected State Indicator -->
            <div class="flex items-start justify-between gap-1 w-full">
              <div>
                <div class="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <span>System preference</span>
                </div>
                <div class="text-[11px] text-zinc-500 dark:text-[#71717a] mt-0.5 leading-tight">Use your device setting</div>
              </div>
              <div
                class="w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                [ngClass]="themeService.themePreference() === 'system' ? 'border-[#e11d48] bg-[#e11d48]' : 'border-zinc-400 dark:border-zinc-600 bg-transparent'"
              >
                @if (themeService.themePreference() === 'system') {
                  <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
                }
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Security: Change Password Card -->
      <div class="bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl p-6 space-y-4 shadow-xs">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-base font-semibold text-zinc-900 dark:text-white">Account Security & Password</h2>
            <p class="text-xs text-zinc-500 dark:text-[#a1a1aa] mt-0.5">Change your login password (requires current password verification)</p>
          </div>
        </div>

        @if (passwordSuccess) {
          <div class="p-3 bg-emerald-50 dark:bg-[#18181b] border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <span>{{ passwordSuccess }}</span>
            <button (click)="passwordSuccess = ''" class="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-white font-bold">×</button>
          </div>
        }
        @if (passwordError) {
          <div class="p-3 bg-red-50 dark:bg-[#18181b] border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{{ passwordError }}</span>
            <button (click)="passwordError = ''" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-white font-bold">×</button>
          </div>
        }

        <div class="space-y-4 text-xs">
          <!-- 1. Current Password -->
          <div>
            <label class="block text-zinc-700 dark:text-[#a1a1aa] font-medium mb-1">Current Password *</label>
            <div class="relative">
              <input
                [type]="showCurrentPassword ? 'text' : 'password'"
                [(ngModel)]="currentPassword"
                placeholder="Enter your current password"
                class="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-colors"
              />
              <button
                type="button"
                (click)="showCurrentPassword = !showCurrentPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
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

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- 2. New Password -->
            <div>
              <label class="block text-zinc-700 dark:text-[#a1a1aa] font-medium mb-1">New Password *</label>
              <div class="relative">
                <input
                  [type]="showNewPassword ? 'text' : 'password'"
                  [(ngModel)]="newPassword"
                  placeholder="Min 8 chars, 1 uppercase, 1 digit/symbol"
                  class="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-colors"
                />
                <button
                  type="button"
                  (click)="showNewPassword = !showNewPassword"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
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
            <!-- 3. Confirm New Password -->
            <div>
              <label class="block text-zinc-700 dark:text-[#a1a1aa] font-medium mb-1">Confirm New Password *</label>
              <div class="relative">
                <input
                  [type]="showConfirmPassword ? 'text' : 'password'"
                  [(ngModel)]="confirmPassword"
                  placeholder="Re-enter new password"
                  class="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-colors"
                />
                <button
                  type="button"
                  (click)="showConfirmPassword = !showConfirmPassword"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
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
        </div>

        <div class="flex justify-end pt-2">
          <button
            (click)="updatePassword()"
            [disabled]="updatingPassword || !currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()"
            class="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-semibold rounded-xl transition-colors disabled:opacity-40 shadow-sm"
          >
            {{ updatingPassword ? 'Verifying & Saving...' : 'Update Password' }}
          </button>
        </div>
      </div>

      <!-- Admin Only: Master Password Rotation Card -->
      @if (isAdmin()) {
        <div class="bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl p-6 space-y-4 animate-fade-in shadow-xs">
          <div class="flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-semibold text-zinc-900 dark:text-white">Master Admin Password</h2>
                <span class="px-2 py-0.5 rounded-md bg-[#f8f9fa] dark:bg-[#18181b] text-zinc-700 dark:text-zinc-200 font-mono text-[10px] uppercase font-bold border border-[#dcdde1] dark:border-[#27272a]">Admin Only</span>
              </div>
              <p class="text-xs text-zinc-500 dark:text-[#a1a1aa] mt-0.5">Separate high-privilege secret required to create or promote users to Administrator</p>
            </div>
          </div>

          @if (masterPasswordSuccess) {
            <div class="p-3 bg-emerald-50 dark:bg-[#18181b] border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
              <span>{{ masterPasswordSuccess }}</span>
              <button (click)="masterPasswordSuccess = ''" class="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-white font-bold">×</button>
            </div>
          }
          @if (masterPasswordError) {
            <div class="p-3 bg-red-50 dark:bg-[#18181b] border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
              <span>{{ masterPasswordError }}</span>
              <button (click)="masterPasswordError = ''" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-white font-bold">×</button>
            </div>
          }

          <div class="space-y-4 text-xs">
            <div>
              <label class="block text-zinc-700 dark:text-[#a1a1aa] font-medium mb-1">Current Master Password *</label>
              <div class="relative">
                <input
                  [type]="showCurrentMasterPassword ? 'text' : 'password'"
                  [(ngModel)]="currentMasterPassword"
                  placeholder="Enter current master admin password"
                  class="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-mono transition-colors"
                />
                <button
                  type="button"
                  (click)="showCurrentMasterPassword = !showCurrentMasterPassword"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
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

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-zinc-700 dark:text-[#a1a1aa] font-medium mb-1">New Master Password *</label>
                <div class="relative">
                  <input
                    [type]="showNewMasterPassword ? 'text' : 'password'"
                    [(ngModel)]="newMasterPassword"
                    placeholder="Min 10 chars, uppercase, digit, symbol"
                    class="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-mono transition-colors"
                  />
                  <button
                    type="button"
                    (click)="showNewMasterPassword = !showNewMasterPassword"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
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
                <label class="block text-zinc-700 dark:text-[#a1a1aa] font-medium mb-1">Confirm New Master Password *</label>
                <div class="relative">
                  <input
                    [type]="showConfirmMasterPassword ? 'text' : 'password'"
                    [(ngModel)]="confirmMasterPassword"
                    placeholder="Re-enter new master password"
                    class="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-mono transition-colors"
                  />
                  <button
                    type="button"
                    (click)="showConfirmMasterPassword = !showConfirmMasterPassword"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors focus:outline-none p-1"
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
          </div>

          <div class="flex justify-end pt-2">
            <button
              (click)="updateMasterPassword()"
              [disabled]="updatingMasterPassword || !currentMasterPassword.trim() || !newMasterPassword.trim() || !confirmMasterPassword.trim()"
              class="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-semibold rounded-xl transition-colors disabled:opacity-40 shadow-sm"
            >
              {{ updatingMasterPassword ? 'Verifying & Updating...' : 'Update Master Password' }}
            </button>
          </div>
        </div>
      }

      <!-- AI Infrastructure Info Card -->
      <div class="bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-2xl p-6 space-y-4 shadow-xs">
        <h2 class="text-base font-semibold text-zinc-900 dark:text-white">Cloud Database & AI Infrastructure</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div class="p-4 bg-[#f8f9fa] dark:bg-[#18181b] rounded-xl border border-[#e7e9ed] dark:border-[#27272a] space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-zinc-500 dark:text-[#71717a]">Database</span>
              <span class="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-[#e7e9ed] dark:bg-[#1c1f23] text-zinc-800 dark:text-zinc-200 font-bold border border-[#dcdde1] dark:border-[#2a2e34]">
                <svg class="w-3 h-3 text-zinc-700 dark:text-zinc-300" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                Connected
              </span>
            </div>
            <div class="font-semibold text-zinc-900 dark:text-white text-xs">MongoDB Atlas Cluster</div>
            <p class="text-[11px] text-zinc-500 dark:text-[#71717a]">Encrypted cloud storage for user accounts, ACL rules, and chat history.</p>
          </div>

          <div class="p-4 bg-[#f8f9fa] dark:bg-[#18181b] rounded-xl border border-[#e7e9ed] dark:border-[#27272a] space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-zinc-500 dark:text-[#71717a]">LLM Provider</span>
              <span class="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-[#e7e9ed] dark:bg-[#1c1f23] text-zinc-800 dark:text-zinc-200 font-bold border border-[#dcdde1] dark:border-[#2a2e34]">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse"></span>
                Active
              </span>
            </div>
            <div class="font-semibold text-zinc-900 dark:text-white text-xs">Gemini Flash (Google)</div>
            <p class="text-[11px] text-zinc-500 dark:text-[#71717a]">High-performance neural reasoning with dataset calculation capability.</p>
          </div>

          <div class="p-4 bg-[#f8f9fa] dark:bg-[#18181b] rounded-xl border border-[#e7e9ed] dark:border-[#27272a] space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-zinc-500 dark:text-[#71717a]">Embedding Model</span>
              <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-[#e7e9ed] dark:bg-[#1c1f23] text-zinc-800 dark:text-zinc-200 border border-[#dcdde1] dark:border-[#2a2e34]">Local</span>
            </div>
            <div class="font-semibold text-zinc-900 dark:text-white text-xs">BGE Base (768 Dim)</div>
            <p class="text-[11px] text-zinc-500 dark:text-[#71717a]">Running locally with sentence-transformers for RAG chunk retrieval.</p>
          </div>
        </div>
      </div>
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
