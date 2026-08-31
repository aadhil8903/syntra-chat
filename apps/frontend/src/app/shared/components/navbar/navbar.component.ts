import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <header class="h-14 border-b border-[#27272a] bg-[#0d0d10] px-5 flex items-center justify-between sticky top-0 z-30 flex-shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center p-1.5 shadow-sm">
          <img src="/logo-icon.png" alt="Syntra" class="w-full h-full object-contain" onerror="this.style.display='none'" />
        </div>
        <span class="font-bold tracking-tight text-[#fafafa] text-base">Syntra Chat</span>
      </div>

      <div class="flex items-center gap-4">
        @if (user(); as u) {
          <div class="flex items-center gap-3">
            <div class="text-right hidden sm:block">
              <div class="text-sm font-medium text-[#fafafa]">{{ u.firstName }} {{ u.lastName }}</div>
              <div class="text-xs text-[#71717a]">{{ u.email }}</div>
            </div>
            <div class="w-9 h-9 rounded-full bg-[#18181b] border border-[#3f3f46] flex items-center justify-center text-sm font-semibold text-white">
              {{ u.firstName.charAt(0) }}{{ u.lastName.charAt(0) }}
            </div>
            <button
              (click)="logout()"
              title="Logout"
              class="p-2 rounded-lg text-[#a1a1aa] hover:text-white hover:bg-[#1f1f23] transition-colors border border-transparent hover:border-[#3f3f46]"
            >
              <svg class="w-5 h-5" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        }
      </div>
    </header>
  `,
})
export class NavbarComponent {
  private authService = inject(AuthService);
  user = this.authService.currentUser;

  logout(): void {
    this.authService.logout();
  }
}
