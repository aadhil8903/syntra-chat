import { Component, inject, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NavigationDrawerService } from '../../../core/services/navigation-drawer.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <!-- 1. Desktop Persistent Sidebar (>= 768px) -->
    <aside
      [style.width.px]="isCollapsed ? 64 : width"
      class="hidden md:flex relative border-r border-[#dcdde1] dark:border-[#27272a] bg-white dark:bg-[#0c0c0e] flex-col justify-between p-3 h-full flex-shrink-0 select-none transition-[width] duration-75"
    >
      <div class="space-y-4">
        <!-- Collapse / Expand Toggle Button -->
        <div class="flex items-center" [ngClass]="isCollapsed ? 'justify-center' : 'justify-between px-2'">
          @if (!isCollapsed) {
            <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[#71717a]">Navigation</span>
          }
          <button
            (click)="toggleCollapse()"
            class="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-zinc-500 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#1f1f23] transition-colors flex items-center justify-center"
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
            routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
            data-tour="nav-dashboard"
            class="flex items-center gap-3 px-3 py-2 rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm"
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
            routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
            [routerLinkActiveOptions]="{ matrixParams: 'ignored', queryParams: 'exact', paths: 'exact', fragment: 'ignored' }"
            data-tour="nav-chat"
            class="flex items-center gap-3 px-3 py-2 rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm"
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
            routerLink="/chat"
            [queryParams]="{ view: 'archived' }"
            routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
            [routerLinkActiveOptions]="{ matrixParams: 'ignored', queryParams: 'exact', paths: 'exact', fragment: 'ignored' }"
            data-tour="nav-archived"
            class="flex items-center gap-3 px-3 py-2 rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm"
            [title]="isCollapsed ? 'Archived Chats' : ''"
          >
            <svg class="w-5 h-5 flex-shrink-0" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            @if (!isCollapsed) {
              <span class="truncate">Archived Chats</span>
            }
          </a>

          <a
            routerLink="/documents"
            routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
            data-tour="nav-documents"
            class="flex items-center gap-3 px-3 py-2 rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm"
            [title]="isCollapsed ? 'Files' : ''"
          >
            <svg class="w-5 h-5 flex-shrink-0" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path>
            </svg>
            @if (!isCollapsed) {
              <span class="truncate">Files</span>
            }
          </a>
        </nav>
      </div>

      <!-- Bottom Secondary Navigation -->
      <div class="pt-3 border-t border-[#dcdde1] dark:border-[#27272a] space-y-1">
        @if (isAdmin) {
          <a
            routerLink="/admin"
            routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
            data-tour="nav-admin"
            class="flex items-center gap-3 px-3 py-2 rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm"
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
          routerLinkActive="bg-rose-50 text-rose-600 font-semibold dark:bg-rose-500/15 dark:text-rose-400 shadow-2xs"
          data-tour="nav-docs"
          class="flex items-center gap-3 px-3 py-2 rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm"
          [title]="isCollapsed ? 'Syntra Guide' : ''"
        >
          <svg class="w-5 h-5 flex-shrink-0" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          @if (!isCollapsed) {
            <span class="truncate">Syntra Guide</span>
          }
        </a>

        <a
          routerLink="/settings"
          routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
          data-tour="nav-settings"
          class="flex items-center gap-3 px-3 py-2 rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm"
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
          class="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-zinc-400/40 dark:hover:bg-white/50 active:bg-zinc-600 dark:active:bg-white transition-colors z-20"
          title="Drag to resize sidebar"
        ></div>
      }
    </aside>

    <!-- 2. Mobile Off-Canvas Navigation Drawer (< 768px) -->
    <div class="md:hidden">
      <!-- Dimmed Background Overlay Backdrop -->
      @if (drawerService.isOpen()) {
        <div
          (click)="drawerService.close()"
          aria-hidden="true"
          class="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm animate-fade-in"
        ></div>
      }

      <!-- Sliding Drawer Sheet -->
      <div
        class="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white dark:bg-[#0d0d10] border-r border-[#dcdde1] dark:border-[#27272a] shadow-2xl flex flex-col justify-between p-4 transform transition-transform duration-200 ease-out"
        [class.-translate-x-full]="!drawerService.isOpen()"
        [class.translate-x-0]="drawerService.isOpen()"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation Menu"
      >
        <div class="space-y-4">
          <!-- Drawer Header with Logo & Close Button -->
          <div class="flex items-center justify-between pb-3 border-b border-[#dcdde1] dark:border-[#27272a]">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-[#f8f9fa] dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] flex items-center justify-center p-1.5 flex-shrink-0">
                <img src="/logo-icon.svg" alt="Syntra" class="w-full h-full object-contain" onerror="this.src='/logo-icon.png'" />
              </div>
              <span class="font-bold tracking-tight text-zinc-900 dark:text-white text-base">Syntra Chat</span>
            </div>

            <button
              (click)="drawerService.close()"
              type="button"
              aria-label="Close Navigation"
              class="min-w-[44px] min-h-[44px] rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] flex items-center justify-center transition-colors"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Drawer Navigation Links -->
          <nav class="space-y-1">
            <a
              routerLink="/dashboard"
              routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
              (click)="drawerService.close()"
              class="flex items-center gap-3 px-3.5 min-h-[44px] rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm font-medium"
            >
              <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Home</span>
            </a>

            <a
              routerLink="/chat"
              routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
              [routerLinkActiveOptions]="{ matrixParams: 'ignored', queryParams: 'exact', paths: 'exact', fragment: 'ignored' }"
              (click)="drawerService.close()"
              class="flex items-center gap-3 px-3.5 min-h-[44px] rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm font-medium"
            >
              <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span>Chat</span>
            </a>

            <a
              routerLink="/chat"
              [queryParams]="{ view: 'archived' }"
              routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
              [routerLinkActiveOptions]="{ matrixParams: 'ignored', queryParams: 'exact', paths: 'exact', fragment: 'ignored' }"
              (click)="drawerService.close()"
              class="flex items-center gap-3 px-3.5 min-h-[44px] rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm font-medium"
            >
              <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span>Archived Chats</span>
            </a>

            <a
              routerLink="/documents"
              routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
              (click)="drawerService.close()"
              class="flex items-center gap-3 px-3.5 min-h-[44px] rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm font-medium"
            >
              <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path>
              </svg>
              <span>Files</span>
            </a>

            @if (isAdmin) {
              <a
                routerLink="/admin"
                routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
                (click)="drawerService.close()"
                class="flex items-center gap-3 px-3.5 min-h-[44px] rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm font-medium"
              >
                <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Admin Panel</span>
              </a>
            }

            <a
              routerLink="/docs"
              routerLinkActive="bg-rose-50 text-rose-600 font-semibold dark:bg-rose-500/15 dark:text-rose-400 shadow-2xs"
              (click)="drawerService.close()"
              class="flex items-center gap-3 px-3.5 min-h-[44px] rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm font-medium"
            >
              <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>Syntra Guide</span>
            </a>

            <a
              routerLink="/settings"
              routerLinkActive="bg-[#f0f1f3] text-zinc-900 font-semibold dark:bg-white dark:text-black shadow-2xs"
              (click)="drawerService.close()"
              class="flex items-center gap-3 px-3.5 min-h-[44px] rounded-xl text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-sm font-medium"
            >
              <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Settings</span>
            </a>
          </nav>
        </div>

        <!-- Drawer Footer: User Profile & Logout -->
        @if (user(); as u) {
          <div class="pt-3 border-t border-[#dcdde1] dark:border-[#27272a] space-y-3">
            <div class="flex items-center gap-3 px-1">
              <div class="w-10 h-10 rounded-full bg-[#f0f1f3] dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#3f3f46] flex items-center justify-center text-sm font-semibold text-zinc-900 dark:text-white flex-shrink-0">
                {{ u.firstName.charAt(0) }}{{ u.lastName.charAt(0) }}
              </div>
              <div class="truncate flex-1 min-w-0">
                <div class="text-sm font-medium text-zinc-900 dark:text-white truncate">{{ u.firstName }} {{ u.lastName }}</div>
                <div class="text-xs text-zinc-500 dark:text-[#71717a] truncate font-mono">{{ u.email }}</div>
              </div>
            </div>

            <button
              (click)="logout()"
              type="button"
              class="w-full min-h-[44px] px-3.5 rounded-xl text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-[#f8f9fa] dark:bg-[#18181b] hover:bg-zinc-100 dark:hover:bg-[#1f1f23] border border-[#dcdde1] dark:border-[#27272a] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class SidebarComponent implements OnInit {
  private authService = inject(AuthService);
  readonly drawerService = inject(NavigationDrawerService);

  user = this.authService.currentUser;
  width = 240;
  isCollapsed = false;
  private isResizing = false;
  private startX = 0;
  private startWidth = 240;

  get isAdmin() {
    return this.authService.isAdmin();
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

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.drawerService.isOpen()) {
      this.drawerService.close();
    }
  }

  logout(): void {
    this.drawerService.close();
    this.authService.logout();
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
