import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { WalkthroughService } from '../../core/services/walkthrough.service';
import { IUser } from '@enter-chat/shared-types';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-4 sm:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-white tracking-tight">Platform Settings</h1>
          <p class="text-xs sm:text-sm text-[#a1a1aa] mt-1">
            Review your account profile, manage password security, and check active AI infrastructure.
          </p>
        </div>
        <button
          type="button"
          (click)="replayWalkthrough()"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-white border border-[#27272a] hover:border-zinc-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors flex-shrink-0 self-start sm:self-auto"
          title="Replay guided onboarding tour"
        >
          <svg class="w-4 h-4 text-zinc-300" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Replay Walkthrough</span>
        </button>
      </div>

      <!-- Account Info Card -->
      <div class="bg-[#111114] border border-[#27272a] rounded-2xl p-6 space-y-4">
        <h2 class="text-base font-semibold text-white">Account Profile</h2>
        @if (user(); as u) {
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div class="p-3 bg-[#0c0c0e] rounded-xl border border-[#27272a]">
              <span class="text-xs text-[#71717a] block">Full Name</span>
              <span class="font-medium text-white">{{ u.firstName }} {{ u.lastName }}</span>
            </div>
            <div class="p-3 bg-[#0c0c0e] rounded-xl border border-[#27272a]">
              <span class="text-xs text-[#71717a] block">Email Address (Login ID)</span>
              <span class="font-medium text-white font-mono text-xs">{{ u.email }}</span>
            </div>
            <div class="p-3 bg-[#0c0c0e] rounded-xl border border-[#27272a]">
              <span class="text-xs text-[#71717a] block">User Role</span>
              <span class="font-mono text-xs text-white uppercase font-bold">{{ u.role }}</span>
            </div>
            <div class="p-3 bg-[#0c0c0e] rounded-xl border border-[#27272a]">
              <span class="text-xs text-[#71717a] block">Departments</span>
              <span class="font-mono text-xs text-zinc-300">{{ u.departments && u.departments.length ? u.departments.join(', ') : 'None' }}</span>
            </div>
          </div>
        }
      </div>

      <!-- Security: Change Password Card -->
      <div class="bg-[#111114] border border-[#27272a] rounded-2xl p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-base font-semibold text-white">Account Security & Password</h2>
            <p class="text-xs text-[#a1a1aa] mt-0.5">Change your login password (requires current password verification)</p>
          </div>
        </div>

        @if (passwordSuccess) {
          <div class="p-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-zinc-200 flex items-center justify-between">
            <span>{{ passwordSuccess }}</span>
            <button (click)="passwordSuccess = ''" class="text-zinc-400 hover:text-white font-bold">×</button>
          </div>
        }
        @if (passwordError) {
          <div class="p-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-zinc-200 flex items-center justify-between">
            <span>{{ passwordError }}</span>
            <button (click)="passwordError = ''" class="text-zinc-400 hover:text-white font-bold">×</button>
          </div>
        }

        <div class="space-y-4 text-xs">
          <!-- 1. Current Password -->
          <div>
            <label class="block text-[#a1a1aa] font-medium mb-1">Current Password *</label>
            <input
              type="password"
              [(ngModel)]="currentPassword"
              placeholder="Enter your current password"
              class="w-full px-3 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white focus:outline-none focus:border-white placeholder:text-zinc-600"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- 2. New Password -->
            <div>
              <label class="block text-[#a1a1aa] font-medium mb-1">New Password *</label>
              <input
                type="password"
                [(ngModel)]="newPassword"
                placeholder="Min 8 chars, 1 uppercase, 1 digit/symbol"
                class="w-full px-3 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white focus:outline-none focus:border-white placeholder:text-zinc-600"
              />
            </div>
            <!-- 3. Confirm New Password -->
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
        </div>

        <div class="flex justify-end pt-2">
          <button
            (click)="updatePassword()"
            [disabled]="updatingPassword || !currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()"
            class="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-semibold rounded-xl transition-colors disabled:opacity-40"
          >
            {{ updatingPassword ? 'Verifying & Saving...' : 'Update Password' }}
          </button>
        </div>
      </div>

      <!-- Admin Only: Master Password Rotation Card -->
      @if (isAdmin()) {
        <div class="bg-[#111114] border border-zinc-800 rounded-2xl p-6 space-y-4 animate-fade-in">
          <div class="flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-semibold text-white">Master Admin Password</h2>
                <span class="px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-200 font-mono text-[10px] uppercase font-bold border border-zinc-700">Admin Only</span>
              </div>
              <p class="text-xs text-[#a1a1aa] mt-0.5">Separate high-privilege secret required to create or promote users to Administrator</p>
            </div>
          </div>

          @if (masterPasswordSuccess) {
            <div class="p-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-zinc-200 flex items-center justify-between">
              <span>{{ masterPasswordSuccess }}</span>
              <button (click)="masterPasswordSuccess = ''" class="text-zinc-400 hover:text-white font-bold">×</button>
            </div>
          }
          @if (masterPasswordError) {
            <div class="p-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-zinc-200 flex items-center justify-between">
              <span>{{ masterPasswordError }}</span>
              <button (click)="masterPasswordError = ''" class="text-zinc-400 hover:text-white font-bold">×</button>
            </div>
          }

          <div class="space-y-4 text-xs">
            <div>
              <label class="block text-[#a1a1aa] font-medium mb-1">Current Master Password *</label>
              <input
                type="password"
                [(ngModel)]="currentMasterPassword"
                placeholder="Enter current master admin password"
                class="w-full px-3 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white focus:outline-none focus:border-white placeholder:text-zinc-600 font-mono"
              />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-[#a1a1aa] font-medium mb-1">New Master Password *</label>
                <input
                  type="password"
                  [(ngModel)]="newMasterPassword"
                  placeholder="Min 10 chars, uppercase, digit, symbol"
                  class="w-full px-3 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white focus:outline-none focus:border-white placeholder:text-zinc-600 font-mono"
                />
              </div>
              <div>
                <label class="block text-[#a1a1aa] font-medium mb-1">Confirm New Master Password *</label>
                <input
                  type="password"
                  [(ngModel)]="confirmMasterPassword"
                  placeholder="Re-enter new master password"
                  class="w-full px-3 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-white focus:outline-none focus:border-white placeholder:text-zinc-600 font-mono"
                />
              </div>
            </div>
          </div>

          <div class="flex justify-end pt-2">
            <button
              (click)="updateMasterPassword()"
              [disabled]="updatingMasterPassword || !currentMasterPassword.trim() || !newMasterPassword.trim() || !confirmMasterPassword.trim()"
              class="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-semibold rounded-xl transition-colors disabled:opacity-40"
            >
              {{ updatingMasterPassword ? 'Verifying & Updating...' : 'Update Master Password' }}
            </button>
          </div>
        </div>
      }

      <!-- AI Infrastructure Info Card -->
      <div class="bg-[#111114] border border-[#27272a] rounded-2xl p-6 space-y-4">
        <h2 class="text-base font-semibold text-white">Cloud Database & AI Infrastructure</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div class="p-4 bg-[#0c0c0e] rounded-xl border border-[#27272a] space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-[#71717a]">Database</span>
              <span class="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-200 font-bold border border-zinc-800">
                <svg class="w-3 h-3 text-zinc-300" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                Connected
              </span>
            </div>
            <div class="font-semibold text-white text-xs">MongoDB Atlas Cluster</div>
            <p class="text-[11px] text-[#71717a]">Encrypted cloud storage for user accounts, ACL rules, and chat history.</p>
          </div>

          <div class="p-4 bg-[#0c0c0e] rounded-xl border border-[#27272a] space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-[#71717a]">LLM Provider</span>
              <span class="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-200 font-bold border border-zinc-800">
                <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                Active
              </span>
            </div>
            <div class="font-semibold text-white text-xs">Gemini Flash (Google)</div>
            <p class="text-[11px] text-[#71717a]">High-performance neural reasoning with dataset calculation capability.</p>
          </div>

          <div class="p-4 bg-[#0c0c0e] rounded-xl border border-[#27272a] space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-[#71717a]">Embedding Model</span>
              <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-[#18181b] text-white border border-[#3f3f46]">Local</span>
            </div>
            <div class="font-semibold text-white text-xs">BGE Base (768 Dim)</div>
            <p class="text-[11px] text-[#71717a]">Running locally with sentence-transformers for RAG chunk retrieval.</p>
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

  user = this.auth.currentUser;
  isAdmin = this.auth.isAdmin;

  ngOnInit(): void {
    this.auth.fetchCurrentUserProfile().subscribe({ error: () => {} });
  }

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  updatingPassword = false;
  passwordSuccess = '';
  passwordError = '';

  // Master Password State
  currentMasterPassword = '';
  newMasterPassword = '';
  confirmMasterPassword = '';
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
