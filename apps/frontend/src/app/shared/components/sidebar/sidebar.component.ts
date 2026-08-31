import { Component, inject, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <aside
      [style.width.px]="isCollapsed ? 64 : width"
      class="relative border-r border-[#27272a] bg-[#0d0d10] flex flex-col justify-between p-3 h-full flex-shrink-0 select-none transition-[width] duration-75"
    >
      <div class="space-y-4">
        <!-- Collapse / Expand Toggle Button -->
        <div class="flex items-center" [ngClass]="isCollapsed ? 'justify-center' : 'justify-between px-2'">
          @if (!isCollapsed) {
            <span class="text-[10px] font-bold uppercase tracking-widest text-[#71717a]">Navigation</span>
          }
          <button
            (click)="toggleCollapse()"
            class="p-1.5 rounded-lg text-[#a1a1aa] hover:text-white hover:bg-[#1f1f23] transition-colors"
            [title]="isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          >
            <svg class="w-4 h-4" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              @if (isCollapsed) {
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              } @else {
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              }
            </svg>
          </button>
        </div>

        <!-- Primary Workspace Navigation -->
        <nav class="space-y-1">
          <a
            routerLink="/dashboard"
            routerLinkActive="bg-white text-black font-semibold"
            data-tour="nav-dashboard"
            class="flex items-center gap-3 px-3 py-2 rounded-xl text-[#a1a1aa] hover:text-white hover:bg-[#18181b] transition-colors text-sm"
            [title]="isCollapsed ? 'Home' : ''"
          >
            <svg class="w-5 h-5 flex-shrink-0" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            @if (!isCollapsed) {
              <span class="truncate">Home</span>
            }
          </a>

          <a
            routerLink="/chat"
            routerLinkActive="bg-white text-black font-semibold"
            data-tour="nav-chat"
            class="flex items-center gap-3 px-3 py-2 rounded-xl text-[#a1a1aa] hover:text-white hover:bg-[#18181b] transition-colors text-sm"
            [title]="isCollapsed ? 'Chat' : ''"
          >
            <svg class="w-5 h-5 flex-shrink-0" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            @if (!isCollapsed) {
              <span class="truncate">Chat</span>
            }
          </a>

          <a
            routerLink="/documents"
            routerLinkActive="bg-white text-black font-semibold"
            data-tour="nav-documents"
            class="flex items-center gap-3 px-3 py-2 rounded-xl text-[#a1a1aa] hover:text-white hover:bg-[#18181b] transition-colors text-sm"
            [title]="isCollapsed ? 'Knowledge' : ''"
          >
            <svg class="w-5 h-5 flex-shrink-0" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            @if (!isCollapsed) {
              <span class="truncate">Knowledge</span>
            }
          </a>
        </nav>
      </div>

      <!-- Bottom Secondary Navigation -->
      <div class="pt-3 border-t border-[#27272a] space-y-1">
        @if (isAdmin) {
          <a
            routerLink="/admin"
            routerLinkActive="bg-white text-black font-semibold"
            data-tour="nav-admin"
            class="flex items-center gap-3 px-3 py-2 rounded-xl text-[#a1a1aa] hover:text-white hover:bg-[#18181b] transition-colors text-sm"
            [title]="isCollapsed ? 'Admin Panel' : ''"
          >
            <svg class="w-5 h-5 flex-shrink-0" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            @if (!isCollapsed) {
              <span class="truncate">Admin Panel</span>
            }
          </a>
        }

        <a
          routerLink="/docs"
          routerLinkActive="bg-white text-black font-semibold"
          data-tour="nav-docs"
          class="flex items-center gap-3 px-3 py-2 rounded-xl text-[#a1a1aa] hover:text-white hover:bg-[#18181b] transition-colors text-sm"
          [title]="isCollapsed ? 'Documentation' : ''"
        >
          <svg class="w-5 h-5 flex-shrink-0" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          @if (!isCollapsed) {
            <span class="truncate">Documentation</span>
          }
        </a>

        <a
          routerLink="/settings"
          routerLinkActive="bg-white text-black font-semibold"
          data-tour="nav-settings"
          class="flex items-center gap-3 px-3 py-2 rounded-xl text-[#a1a1aa] hover:text-white hover:bg-[#18181b] transition-colors text-sm"
          [title]="isCollapsed ? 'Settings' : ''"
        >
          <svg class="w-5 h-5 flex-shrink-0" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          @if (!isCollapsed) {
            <span class="truncate">Settings</span>
          }
        </a>
      </div>

      <!-- Resizing Drag Handle -->
      @if (!isCollapsed) {
        <div
          (mousedown)="startResize($event)"
          class="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-white/50 active:bg-white transition-colors z-20"
          title="Drag to resize sidebar"
        ></div>
      }
    </aside>
  `,
})
export class SidebarComponent implements OnInit {
  private authService = inject(AuthService);

  width = 240;
  isCollapsed = false;
  private isResizing = false;
  private startX = 0;
  private startWidth = 240;

  get isAdmin() {
    return this.authService.getUserRole() === 'admin';
  }

  ngOnInit(): void {
    const savedWidth = localStorage.getItem('syntra_chat_nav_sidebar_width');
    if (savedWidth) {
      this.width = Math.max(180, Math.min(380, parseInt(savedWidth, 10)));
    }
    const savedCollapsed = localStorage.getItem('syntra_chat_nav_sidebar_collapsed');
    if (savedCollapsed) {
      this.isCollapsed = savedCollapsed === 'true';
    }
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    localStorage.setItem('syntra_chat_nav_sidebar_collapsed', String(this.isCollapsed));
  }

  startResize(event: MouseEvent): void {
    event.preventDefault();
    this.isResizing = true;
    this.startX = event.clientX;
    this.startWidth = this.width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isResizing) return;
    const delta = event.clientX - this.startX;
    const newWidth = Math.max(180, Math.min(380, this.startWidth + delta));
    this.width = newWidth;
  }

  @HostListener('window:mouseup')
  onMouseUp(): void {
    if (this.isResizing) {
      this.isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('syntra_chat_nav_sidebar_width', String(this.width));
    }
  }
}
