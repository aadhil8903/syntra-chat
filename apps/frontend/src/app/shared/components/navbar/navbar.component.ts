import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { NavigationDrawerService } from '../../../core/services/navigation-drawer.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <header class="h-14 border-b border-[#27272a] bg-[#0d0d10] px-3 sm:px-5 flex items-center justify-between sticky top-0 z-30 flex-shrink-0 pt-[env(safe-area-inset-top)]">
      <!-- Left side: Hamburger (mobile only) + Logo / Brand -->
      <div class="flex items-center gap-2 sm:gap-3">
        <!-- Hamburger Button (Visible only on <768px) -->
        <button
          (click)="drawerService.toggle()"
          type="button"
          aria-label="Open Navigation Drawer"
          class="md:hidden min-w-[44px] min-h-[44px] -ml-1 rounded-xl text-zinc-300 hover:text-white hover:bg-[#18181b] flex items-center justify-center transition-colors"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <a routerLink="/dashboard" class="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
          <div class="w-8 h-8 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center p-1.5 flex-shrink-0">
            <img src="/logo-icon.png" alt="Syntra" class="w-full h-full object-contain" onerror="this.style.display='none'" />
          </div>
          <span class="font-bold tracking-tight text-[#fafafa] text-base truncate">Syntra Chat</span>
        </a>
      </div>

      <!-- Right side -->
      <div class="flex items-center gap-2 sm:gap-4">
        <!-- Mobile Action: + New Chat Button (Visible only on <768px) -->
        <a
          routerLink="/chat"
          class="md:hidden min-h-[44px] px-3.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors flex items-center gap-1.5 flex-shrink-0 shadow-sm"
          title="Start fresh new chat"
        >
          <svg class="w-3.5 h-3.5 text-black" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>New Chat</span>
        </a>

        <!-- Desktop User Profile & Logout (Visible only on >=768px) -->
        @if (user(); as u) {
          <div class="hidden md:flex items-center gap-3">
            <div class="text-right">
              <div class="text-sm font-medium text-[#fafafa]">{{ u.firstName }} {{ u.lastName }}</div>
              <div class="text-xs text-[#71717a]">{{ u.email }}</div>
            </div>
            <div class="w-9 h-9 rounded-full bg-[#18181b] border border-[#3f3f46] flex items-center justify-center text-sm font-semibold text-white">
              {{ u.firstName.charAt(0) }}{{ u.lastName.charAt(0) }}
            </div>
            <button
              (click)="logout()"
              title="Logout"
              aria-label="Logout"
              class="min-w-[44px] min-h-[44px] p-2 rounded-lg text-[#a1a1aa] hover:text-white hover:bg-[#1f1f23] transition-colors border border-transparent hover:border-[#3f3f46] flex items-center justify-center"
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
  readonly drawerService = inject(NavigationDrawerService);
  user = this.authService.currentUser;

  logout(): void {
    this.authService.logout();
  }
}
