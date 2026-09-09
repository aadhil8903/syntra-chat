import {
  Component,
  signal,
  computed,
  OnInit,
  OnDestroy,
  AfterViewInit,
  inject,
  ElementRef,
  NgZone,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';

export interface IDocSection {
  id: string;
  title: string;
  category: 'Getting Started' | 'Features' | 'Data & Settings';
  summary: string;
}

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-full flex flex-col bg-[#f7f8fa] dark:bg-[#09090b] text-zinc-900 dark:text-[#fafafa] transition-colors duration-200">
      <!-- Top Sticky Header -->
      <header class="h-14 border-b border-zinc-200 dark:border-[#27272a] bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
        <div class="flex items-center gap-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          <a routerLink="/dashboard" class="hover:text-zinc-900 dark:hover:text-white transition-colors flex items-center gap-1.5 font-medium">
            <svg class="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span class="font-semibold text-zinc-800 dark:text-zinc-200">Syntra Guide</span>
          </a>
          <span class="text-zinc-300 dark:text-zinc-700">/</span>
          <span class="text-rose-600 dark:text-rose-400 font-medium truncate max-w-[150px] sm:max-w-xs">{{ activeSectionData()?.title || 'How to Use' }}</span>
        </div>

        <div class="flex items-center gap-3">
          <!-- Client-side Search -->
          <div class="relative w-44 sm:w-64">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              placeholder="Search guide..."
              class="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-colors shadow-xs"
            />
            <svg class="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400 dark:text-zinc-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            @if (searchQuery()) {
              <button (click)="searchQuery.set('')" class="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs">✕</button>
            }
          </div>


        </div>
      </header>

      <!-- Mobile Section Jump Bar -->
      <div class="md:hidden sticky top-14 z-20 px-4 py-2 bg-white dark:bg-[#0c0c0e] border-b border-zinc-200 dark:border-[#27272a] flex items-center justify-between gap-2">
        <label for="mobile-docs-jump" class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Section:</label>
        <select
          id="mobile-docs-jump"
          [value]="activeSection()"
          (change)="onMobileSelect($event)"
          class="text-xs bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-lg px-2.5 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-rose-500"
        >
          @for (sec of filteredSections(); track sec.id) {
            <option [value]="sec.id">{{ sec.title }}</option>
          }
        </select>
      </div>

      <!-- Main Layout -->
      <div class="flex-1 flex max-w-6xl w-full mx-auto">
        <!-- Desktop Sticky Sidebar Navigation -->
        <aside class="w-64 border-r border-zinc-200 dark:border-[#27272a] bg-[#f7f8fa]/80 dark:bg-[#0c0c0e]/80 backdrop-blur-xs flex-shrink-0 p-5 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)] sticky top-14 hidden md:block select-none scrollbar-thin">
          <div class="px-2">
            <h2 class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Guide Index</h2>
          </div>

          <!-- Grouped Nav Sections -->
          @for (category of categories; track category) {
            @if (getSectionsByCategory(category).length > 0) {
              <div class="space-y-1">
                <div class="px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {{ category }}
                </div>
                @for (sec of getSectionsByCategory(category); track sec.id) {
                  <button
                    (click)="scrollToSection(sec.id)"
                    [ngClass]="activeSection() === sec.id
                      ? 'bg-zinc-200/70 dark:bg-[#18181b] text-zinc-900 dark:text-white font-medium border-l-2 border-rose-500'
                      : 'border-l-2 border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1c1f23]/50'"
                    class="w-full text-left px-3 py-1.5 rounded-r-lg text-xs transition-colors flex items-center justify-between group"
                  >
                    <span class="truncate">{{ sec.title }}</span>
                  </button>
                }
              </div>
            }
          }

          <!-- Quick Tip Note -->
          <div class="p-3.5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] text-xs space-y-1.5 shadow-xs">
            <div class="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Need Quick Help?</span>
            </div>
            <p class="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Ask questions directly in chat. Syntra understands natural language and references your authorized documents automatically.
            </p>
          </div>
        </aside>

        <!-- Documentation Content Body -->
        <main class="flex-1 p-6 sm:p-10 md:p-12 space-y-16 max-w-3xl overflow-visible">

          <!-- Guide Header -->
          <div class="space-y-3 border-b border-zinc-200 dark:border-[#27272a] pb-8">
            <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              How to Use Syntra Chat
            </h1>
            <p class="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Syntra Chat connects directly to your workplace documents. Ask questions, find files, organize conversations into collections, and calculate data instantly.
            </p>
          </div>

          <!-- Section 1: Start Here -->
          <section id="quick-start" class="scroll-mt-20 space-y-5">
            <div class="space-y-1">
              <h2 class="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">1. Start Here</h2>
              <p class="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">Get started in four simple steps.</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <!-- Step 1 -->
              <div class="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] shadow-xs space-y-2">
                <div class="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-[#0c0c0e] text-zinc-800 dark:text-zinc-200 flex items-center justify-center text-xs font-bold">
                  1
                </div>
                <h3 class="font-semibold text-xs text-zinc-900 dark:text-white">Ask in your own words</h3>
                <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Feel free to ask questions naturally, such as <span class="text-zinc-800 dark:text-zinc-200">"What is our annual leave policy?"</span>.
                </p>
              </div>

              <!-- Step 2 -->
              <div class="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] shadow-xs space-y-2">
                <div class="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-[#0c0c0e] text-zinc-800 dark:text-zinc-200 flex items-center justify-center text-xs font-bold">
                  2
                </div>
                <h3 class="font-semibold text-xs text-zinc-900 dark:text-white">Work with your files</h3>
                <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Syntra searches PDFs, Excel sheets, Word files, and data tables automatically.
                </p>
              </div>

              <!-- Step 3 -->
              <div class="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] shadow-xs space-y-2">
                <div class="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-[#0c0c0e] text-zinc-800 dark:text-zinc-200 flex items-center justify-center text-xs font-bold">
                  3
                </div>
                <h3 class="font-semibold text-xs text-zinc-900 dark:text-white">Verified answers</h3>
                <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Answers include direct citations pointing to verified document sources.
                </p>
              </div>

              <!-- Step 4 -->
              <div class="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] shadow-xs space-y-2">
                <div class="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-[#0c0c0e] text-zinc-800 dark:text-zinc-200 flex items-center justify-center text-xs font-bold">
                  4
                </div>
                <h3 class="font-semibold text-xs text-zinc-900 dark:text-white">Stay organized</h3>
                <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Group chats into collections with simple drag-and-drop.
                </p>
              </div>
            </div>
          </section>

          <!-- Section 2: Starting a Chat & Follow-ups -->
          <section id="chatting" class="scroll-mt-20 space-y-5">
            <div class="space-y-1">
              <h2 class="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">2. Starting a Chat & Follow-Ups</h2>
              <p class="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">Conversations continue naturally without needing to repeat context.</p>
            </div>

            <!-- Simulated Chat Thread Demonstration -->
            <div class="rounded-xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#111114] p-4 sm:p-5 shadow-xs space-y-3.5">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-[#27272a] pb-2">
                Conversation Example
              </div>

              <!-- User Message 1 -->
              <div class="flex justify-end">
                <div class="max-w-md bg-[#eef0f3] dark:bg-[#212124] text-zinc-900 dark:text-zinc-100 text-xs px-3.5 py-2 rounded-xl">
                  What is our annual leave policy for full-time employees?
                </div>
              </div>

              <!-- Syntra Response 1 -->
              <div class="flex justify-start gap-2.5">
                <div class="w-6 h-6 rounded-md bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] flex items-center justify-center flex-shrink-0 p-0.5">
                  <img src="/logo-icon.svg" alt="Syntra" class="w-full h-full object-contain" onerror="this.src='/logo-icon.png'" />
                </div>
                <div class="max-w-md space-y-2">
                  <div class="bg-zinc-50 dark:bg-[#0c0c0e] border border-zinc-200/80 dark:border-[#27272a] text-zinc-800 dark:text-zinc-200 text-xs p-3 rounded-xl space-y-2">
                    <p>Full-time employees receive <strong class="text-zinc-900 dark:text-white">25 days</strong> of paid annual leave per calendar year.</p>
                    <div class="pt-1">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-200/60 dark:bg-[#212124] text-zinc-700 dark:text-zinc-300 text-[10px] font-medium">
                        <svg class="w-3 h-3 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Employee_Handbook_2026.pdf (Page 14)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- User Message 2 (Follow-up) -->
              <div class="flex justify-end">
                <div class="max-w-md bg-[#eef0f3] dark:bg-[#212124] text-zinc-900 dark:text-zinc-100 text-xs px-3.5 py-2 rounded-xl">
                  Can I roll over unused days into next year?
                </div>
              </div>

              <!-- Syntra Response 2 -->
              <div class="flex justify-start gap-2.5">
                <div class="w-6 h-6 rounded-md bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] flex items-center justify-center flex-shrink-0 p-0.5">
                  <img src="/logo-icon.svg" alt="Syntra" class="w-full h-full object-contain" onerror="this.src='/logo-icon.png'" />
                </div>
                <div class="max-w-md">
                  <div class="bg-zinc-50 dark:bg-[#0c0c0e] border border-zinc-200/80 dark:border-[#27272a] text-zinc-800 dark:text-zinc-200 text-xs p-3 rounded-xl">
                    <p>Yes. Up to <strong class="text-zinc-900 dark:text-white">5 unused days</strong> may be rolled over into the first quarter with manager approval.</p>
                  </div>
                </div>
              </div>
            </div>

            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              <strong class="text-zinc-700 dark:text-zinc-300">Tip:</strong> You don't need to specify the document name. Syntra automatically identifies the relevant policy or report.
            </p>
          </section>

          <!-- Section 3: Find & Download Files -->
          <section id="file-discovery" class="scroll-mt-20 space-y-5">
            <div class="space-y-1">
              <h2 class="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">3. Find & Download Files</h2>
              <p class="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">Ask for files directly in chat. Syntra finds documents you can access.</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Available File Download Example -->
              <div class="rounded-xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#111114] p-4 space-y-2.5 shadow-xs">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Download Allowed
                  </span>
                </div>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">When download is permitted, an instant download button appears:</p>

                <!-- File Card with Download -->
                <div class="p-2.5 rounded-lg bg-zinc-50 dark:bg-[#0c0c0e] border border-zinc-200 dark:border-[#27272a] flex items-center justify-between gap-2.5">
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="w-7 h-7 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div class="truncate">
                      <div class="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">Expense_Reimbursement_Form.xlsx</div>
                      <div class="text-[10px] text-zinc-400">Excel • 48 KB</div>
                    </div>
                  </div>
                  <button class="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black text-xs font-medium flex items-center gap-1 flex-shrink-0 transition-colors">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Download</span>
                  </button>
                </div>
              </div>

              <!-- Restricted File Example -->
              <div class="rounded-xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#111114] p-4 space-y-2.5 shadow-xs">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Download Restricted
                  </span>
                </div>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">When download is restricted by workplace policy:</p>

                <!-- File Card Restricted -->
                <div class="p-2.5 rounded-lg bg-zinc-50 dark:bg-[#0c0c0e] border border-zinc-200 dark:border-[#27272a] flex items-center justify-between gap-2.5">
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="w-7 h-7 rounded-md bg-zinc-100 dark:bg-[#22262b] text-zinc-500 dark:text-zinc-400 flex items-center justify-center flex-shrink-0">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div class="truncate">
                      <div class="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">Q4_Salary_Structure_2026.pdf</div>
                      <div class="text-[10px] text-zinc-500 dark:text-zinc-400">This file can't be downloaded</div>
                    </div>
                  </div>
                  <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-200 dark:bg-[#22262b] text-zinc-600 dark:text-zinc-400 flex-shrink-0">
                    Restricted
                  </span>
                </div>
              </div>
            </div>
          </section>

          <!-- Section 4: Organizing Chats with Collections (Automatic Animations) -->
          <section id="collections" class="scroll-mt-20 space-y-6">
            <div class="flex items-center justify-between flex-wrap gap-3">
              <div class="space-y-1">
                <h2 class="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">4. Organize with Collections</h2>
                <p class="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">Collections keep related chats together with simple drag-and-drop.</p>
              </div>

              <!-- Clean Playback Controls -->
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  (click)="toggleAnimationPlay()"
                  class="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-[#18181b] hover:bg-zinc-200 dark:hover:bg-[#24282d] text-zinc-800 dark:text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-zinc-200 dark:border-[#27272a]"
                  [title]="isPlaying() ? 'Pause tutorial animations' : 'Play tutorial animations'"
                >
                  @if (isPlaying()) {
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6" />
                    </svg>
                    <span>Pause</span>
                  } @else {
                    <svg class="w-3 h-3 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>Play</span>
                  }
                </button>

                <button
                  type="button"
                  (click)="replayAnimations()"
                  class="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-[#18181b] hover:bg-zinc-200 dark:hover:bg-[#24282d] text-zinc-800 dark:text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-zinc-200 dark:border-[#27272a]"
                  title="Replay animations from beginning"
                >
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Replay</span>
                </button>
              </div>
            </div>

            <!-- Tutorial 1: Move a chat into a collection -->
            <div class="rounded-xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#111114] p-4 sm:p-5 shadow-xs space-y-3">
              <div class="space-y-0.5">
                <h3 class="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white">
                  Move a chat into a collection
                </h3>
              </div>

              <!-- Miniature Syntra Sidebar Stage 1 -->
              <div id="anim1Stage" class="relative w-full h-[260px] bg-[#f8f9fa] dark:bg-[#0c0c0e] rounded-xl border border-zinc-200 dark:border-[#27272a] overflow-hidden p-3 flex flex-col justify-start select-none">
                
                <!-- Scrollable Body: Collections + Recent Chats -->
                <div class="space-y-3 flex-1 flex flex-col justify-start">
                  
                  <!-- Collections Section -->
                  <div class="space-y-1 flex-shrink-0">
                    <!-- Collections Header Row -->
                    <div class="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[#71717a]">
                      <div class="flex items-center gap-1">
                        <svg class="w-2.5 h-2.5 rotate-90 text-zinc-600 dark:text-zinc-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                        </svg>
                        <span>Collections (1)</span>
                      </div>
                      <div class="p-0.5 rounded text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-800">
                        <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                    </div>

                    <!-- Drop Target: Project Titan Collection -->
                    <div
                      id="anim1Target"
                      class="rounded-xl border border-transparent p-1 transition-all bg-transparent"
                    >
                      <!-- Collection Header Row -->
                      <div class="flex items-center justify-between px-1.5 py-1 text-xs rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/40">
                        <div class="flex items-center gap-1.5 truncate">
                          <svg class="w-3 h-3 rotate-90 text-zinc-800 dark:text-zinc-200 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                          </svg>
                          <span class="font-medium text-xs text-zinc-900 dark:text-zinc-100">Project Titan</span>
                          <span id="anim1TargetCount" class="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-normal">(1)</span>
                        </div>
                      </div>

                      <!-- Nested Chats Accordion Body -->
                      <div class="pl-3.5 pr-1 py-0.5 space-y-1 border-l border-zinc-200 dark:border-zinc-800/60 ml-2.5 mb-0.5 text-xs">
                        <div class="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-600 dark:text-[#a1a1aa] text-xs truncate">
                          <span class="w-[2px] h-3 rounded-full bg-zinc-400 dark:bg-zinc-600 flex-shrink-0"></span>
                          <span class="truncate">Titan Architecture Review</span>
                        </div>
                        <!-- Dropped 2nd Row inside Project Titan (Shown after drop) -->
                        <div
                          id="anim1DroppedRow"
                          class="hidden items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-200/80 dark:bg-zinc-800/80 border border-zinc-300/80 dark:border-zinc-700/60 text-zinc-900 dark:text-zinc-100 text-xs truncate animate-fade-in font-medium"
                        >
                          <span class="w-[2px] h-3 rounded-full bg-rose-500 flex-shrink-0"></span>
                          <span class="truncate font-medium">Sprint Planning & Milestones</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Recent Chats Section -->
                  <div class="space-y-1 pt-0.5 flex-shrink-0">
                    <div class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[#71717a] px-1">
                      Recent Chats
                    </div>
                    
                    <div class="space-y-1">
                      <!-- Slot for Sprint Planning & Milestones (Houses both placeholder and animated card) -->
                      <div id="anim1CardSlot" class="relative h-8">
                        <!-- Ghost Placeholder for Sprint Planning & Milestones -->
                        <div
                          id="anim1SourcePlaceholder"
                          class="h-8 flex items-center justify-between px-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100/40 dark:bg-zinc-900/20 text-xs text-zinc-400"
                        >
                          <div class="flex items-center gap-2 truncate opacity-40">
                            <span class="w-[2px] h-3.5 rounded-full bg-zinc-400 flex-shrink-0"></span>
                            <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                            <span class="truncate">Sprint Planning & Milestones</span>
                          </div>
                        </div>

                        <!-- Animated Floating Chat Item (Exact match to Syntra chat row) -->
                        <div
                          id="anim1Card"
                          class="absolute inset-0 h-8 px-2.5 rounded-lg bg-white dark:bg-[#18181b] border border-zinc-300 dark:border-[#27272a] text-xs font-medium text-zinc-900 dark:text-zinc-100 flex items-center justify-between pointer-events-none will-change-transform z-10 shadow-xs"
                        >
                          <div class="flex items-center gap-2 truncate">
                            <span class="w-[2px] h-3.5 rounded-full bg-rose-500 flex-shrink-0"></span>
                            <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                            <span class="truncate font-medium">Sprint Planning & Milestones</span>
                          </div>
                        </div>
                      </div>

                      <!-- Static Recent Chat: Customer Feedback Analysis -->
                      <div class="h-8 flex items-center justify-between px-2.5 rounded-lg bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800/60 text-xs text-zinc-600 dark:text-[#a1a1aa]">
                        <div class="flex items-center gap-2 truncate">
                          <span class="w-[2px] h-3.5 rounded-full bg-zinc-400 dark:bg-zinc-600 flex-shrink-0"></span>
                          <svg class="w-3.5 h-3.5 flex-shrink-0 text-zinc-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                          <span class="truncate">Customer Feedback Analysis</span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                <!-- Single Smooth Animated Mouse Pointer -->
                <div
                  id="anim1Cursor"
                  class="absolute top-0 left-0 pointer-events-none will-change-transform z-20"
                >
                  <svg class="w-4 h-4 text-zinc-900 dark:text-white drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 3l7 18 3-7 7-3L3 3z" />
                  </svg>
                </div>
              </div>
            </div>

            <!-- Tutorial 2: Move a chat between collections -->
            <div class="rounded-xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#111114] p-4 sm:p-5 shadow-xs space-y-3">
              <div class="space-y-0.5">
                <h3 class="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white">
                  Move a chat between collections
                </h3>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                  Drag a conversation from one collection directly into another collection.
                </p>
              </div>

              <!-- Miniature Syntra Sidebar Stage 2 -->
              <div id="anim2Stage" class="relative w-full h-[260px] bg-[#f8f9fa] dark:bg-[#0c0c0e] rounded-xl border border-zinc-200 dark:border-[#27272a] overflow-hidden p-3 flex flex-col justify-start select-none">
                
                <!-- Scrollable Body: Collections + Recent Chats -->
                <div class="space-y-3 flex-1 flex flex-col justify-start">
                  
                  <!-- Collections Section -->
                  <div class="space-y-1.5 flex-shrink-0">
                    <!-- Collections Header Row -->
                    <div class="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[#71717a]">
                      <div class="flex items-center gap-1">
                        <svg class="w-2.5 h-2.5 rotate-90 text-zinc-600 dark:text-zinc-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                        </svg>
                        <span>Collections (2)</span>
                      </div>
                      <div class="p-0.5 rounded text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-800">
                        <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                    </div>

                    <!-- Source Collection: Project Titan -->
                    <div
                      id="anim2Source"
                      class="rounded-xl border border-transparent p-1 transition-all bg-transparent"
                    >
                      <!-- Collection Header Row -->
                      <div class="flex items-center justify-between px-1.5 py-1 text-xs rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/40">
                        <div class="flex items-center gap-1.5 truncate">
                          <svg class="w-3 h-3 rotate-90 text-zinc-800 dark:text-zinc-200 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                          </svg>
                          <span class="font-medium text-xs text-zinc-900 dark:text-zinc-100">Project Titan</span>
                          <span id="anim2SourceCount" class="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-normal">(1)</span>
                        </div>
                      </div>

                      <!-- Nested Chats Accordion Body -->
                      <div class="pl-3.5 pr-1 py-0.5 space-y-1 border-l border-zinc-200 dark:border-zinc-800/60 ml-2.5 mb-0.5 text-xs">
                        <!-- Slot for Sprint Planning & Milestones under Project Titan -->
                        <div id="anim2CardSlot" class="relative h-7">
                          <!-- Ghost Placeholder under Project Titan -->
                          <div
                            id="anim2SourcePlaceholder"
                            class="h-7 flex items-center gap-1.5 px-2 rounded border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100/40 dark:bg-zinc-900/20 text-xs text-zinc-400 truncate opacity-40"
                          >
                            <span class="w-[2px] h-3 rounded-full bg-zinc-400 flex-shrink-0"></span>
                            <span class="truncate">Sprint Planning & Milestones</span>
                          </div>

                          <!-- Animated Floating Chat Item 2 (Nested start position) -->
                          <div
                            id="anim2Card"
                            class="absolute inset-0 h-7 px-2 rounded bg-white dark:bg-[#18181b] border border-zinc-300 dark:border-[#27272a] text-xs font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 pointer-events-none will-change-transform z-10 shadow-xs truncate"
                          >
                            <span class="w-[2px] h-3 rounded-full bg-rose-500 flex-shrink-0"></span>
                            <span class="truncate font-medium">Sprint Planning & Milestones</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Destination Collection: Q4 Marketing (Target) -->
                    <div
                      id="anim2Target"
                      class="rounded-xl border border-transparent p-1 transition-all bg-transparent"
                    >
                      <!-- Collection Header Row -->
                      <div class="flex items-center justify-between px-1.5 py-1 text-xs rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/40">
                        <div class="flex items-center gap-1.5 truncate">
                          <svg class="w-3 h-3 text-zinc-400 dark:text-zinc-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                          </svg>
                          <span class="font-medium text-xs text-zinc-900 dark:text-zinc-100">Q4 Marketing</span>
                          <span id="anim2TargetCount" class="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-normal">(0)</span>
                        </div>
                      </div>

                      <!-- Nested Chats Accordion Body for Q4 Marketing -->
                      <div class="pl-3.5 pr-1 py-0.5 space-y-1 border-l border-zinc-200 dark:border-zinc-800/60 ml-2.5 mb-0.5 text-xs">
                        <!-- Dropped Row inside Q4 Marketing (Shown after drop) -->
                        <div
                          id="anim2DroppedRow"
                          class="hidden items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-200/80 dark:bg-zinc-800/80 border border-zinc-300/80 dark:border-zinc-700/60 text-zinc-900 dark:text-zinc-100 text-xs truncate animate-fade-in font-medium"
                        >
                          <span class="w-[2px] h-3 rounded-full bg-rose-500 flex-shrink-0"></span>
                          <span class="truncate font-medium">Sprint Planning & Milestones</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Recent Chats Section -->
                  <div class="space-y-1 pt-0.5 flex-shrink-0">
                    <div class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[#71717a] px-1">
                      Recent Chats
                    </div>
                    <div class="h-8 flex items-center justify-between px-2.5 rounded-lg bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800/60 text-xs text-zinc-600 dark:text-[#a1a1aa]">
                      <div class="flex items-center gap-2 truncate">
                        <span class="w-[2px] h-3.5 rounded-full bg-zinc-400 dark:bg-zinc-600 flex-shrink-0"></span>
                        <svg class="w-3.5 h-3.5 flex-shrink-0 text-zinc-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <span class="truncate">Customer Feedback Analysis</span>
                      </div>
                    </div>
                  </div>

                </div>

                <!-- Single Smooth Animated Mouse Pointer 2 -->
                <div
                  id="anim2Cursor"
                  class="absolute top-0 left-0 pointer-events-none will-change-transform z-20"
                >
                  <svg class="w-4 h-4 text-zinc-900 dark:text-white drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 3l7 18 3-7 7-3L3 3z" />
                  </svg>
                </div>
              </div>
            </div>

            <!-- Helpful Collection Tips (NO EMOJIS, CLEAN SVG/TEXT BADGES) -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="p-3.5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] space-y-1">
                <div class="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <span class="w-4 h-4 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-[10px]">+</span>
                  <span>Create Collection</span>
                </div>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Click <strong class="text-zinc-700 dark:text-zinc-300">+ New Collection</strong> in the sidebar anytime.
                </p>
              </div>

              <div class="p-3.5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] space-y-1">
                <div class="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <span class="w-4 h-4 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center font-bold text-[10px]">&rsaquo;</span>
                  <span>Expand & Collapse</span>
                </div>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Click any collection header to show or hide its conversations.
                </p>
              </div>

              <div class="p-3.5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] space-y-1">
                <div class="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <span class="w-4 h-4 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center font-bold text-[10px]">&times;</span>
                  <span>Remove from Group</span>
                </div>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Hover over a chat inside a collection and click &times; to return it to Recent Chats.
                </p>
              </div>
            </div>

            <!-- Collection Shared Memory -->
            <div class="rounded-xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#111114] p-4 sm:p-5 shadow-xs space-y-3.5">
              <div class="space-y-1">
                <h3 class="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                  <svg class="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Chats in a collection share memory
                </h3>
                <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  When you group chats into a collection, something nice happens: they start remembering each other. Facts, decisions, and outcomes from one chat quietly carry over to the others in the same collection.
                </p>
              </div>

              <!-- Simulated Chat Thread Demonstration -->
              <div class="rounded-xl border border-zinc-200 dark:border-[#27272a] bg-[#f8f9fa] dark:bg-[#0c0c0e] p-4 space-y-3">
                <div class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-[#27272a] pb-2">
                  Example
                </div>

                <!-- User Message -->
                <div class="flex justify-end">
                  <div class="max-w-sm bg-[#eef0f3] dark:bg-[#212124] text-zinc-900 dark:text-zinc-100 text-xs px-3.5 py-2 rounded-xl">
                    What reimbursement limit did we agree on last week?
                  </div>
                </div>

                <!-- Syntra Response -->
                <div class="flex justify-start gap-2.5">
                  <div class="w-6 h-6 rounded-md bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] flex items-center justify-center flex-shrink-0 p-0.5">
                    <img src="/logo-icon.svg" alt="Syntra" class="w-full h-full object-contain" onerror="this.src='/logo-icon.png'" />
                  </div>
                  <div class="max-w-sm">
                    <div class="bg-white dark:bg-[#111114] border border-zinc-200/80 dark:border-[#27272a] text-zinc-800 dark:text-zinc-200 text-xs p-3 rounded-xl space-y-2">
                      <p>In the <strong class="text-zinc-900 dark:text-white">Reimbursement Policy</strong> chat, the approved limit was set to <strong class="text-zinc-900 dark:text-white">$2,500 per quarter</strong> with manager sign-off required above $500.</p>
                      <div class="pt-0.5">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-[#212124] text-zinc-600 dark:text-zinc-400 text-[10px] font-medium">
                          <svg class="w-3 h-3 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          From collection shared memory
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                You don't need to copy-paste or repeat yourself across chats. If something was established in one conversation within the collection, Syntra already knows about it in the others.
              </p>
            </div>
          </section>

          <!-- Section 5: Managing Documents -->
          <section id="documents" class="scroll-mt-20 space-y-5">
            <div class="space-y-1">
              <h2 class="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">5. Managing Documents</h2>
              <p class="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">Upload, update, and manage access in your workspace.</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] space-y-2.5 shadow-xs">
                <h3 class="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                  <svg class="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Uploading Files
                </h3>
                <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Go to <a routerLink="/documents" class="text-rose-600 dark:text-rose-400 underline font-medium">Documents</a> to add files. Supported file formats:
                </p>
                <div class="flex flex-wrap gap-1.5">
                  <span class="px-2 py-0.5 rounded bg-zinc-100 dark:bg-[#18181b] text-zinc-700 dark:text-zinc-300 text-[11px] font-mono border border-zinc-200 dark:border-[#27272a]">PDF (.pdf)</span>
                  <span class="px-2 py-0.5 rounded bg-zinc-100 dark:bg-[#18181b] text-zinc-700 dark:text-zinc-300 text-[11px] font-mono border border-zinc-200 dark:border-[#27272a]">Word (.docx)</span>
                  <span class="px-2 py-0.5 rounded bg-zinc-100 dark:bg-[#18181b] text-zinc-700 dark:text-zinc-300 text-[11px] font-mono border border-zinc-200 dark:border-[#27272a]">Excel (.xlsx)</span>
                  <span class="px-2 py-0.5 rounded bg-zinc-100 dark:bg-[#18181b] text-zinc-700 dark:text-zinc-300 text-[11px] font-mono border border-zinc-200 dark:border-[#27272a]">CSV (.csv)</span>
                  <span class="px-2 py-0.5 rounded bg-zinc-100 dark:bg-[#18181b] text-zinc-700 dark:text-zinc-300 text-[11px] font-mono border border-zinc-200 dark:border-[#27272a]">Text (.txt, .md)</span>
                </div>
              </div>

              <div class="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] space-y-2.5 shadow-xs">
                <h3 class="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                  <svg class="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Replacing Existing Documents
                </h3>
                <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  When a policy or report updates, use the <strong class="text-zinc-800 dark:text-zinc-200">Replace</strong> option in the file menu. Syntra automatically re-indexes chunks while preserving permissions and history.
                </p>
              </div>
            </div>
          </section>

          <!-- Section 6: Spreadsheets & Calculations -->
          <section id="spreadsheets" class="scroll-mt-20 space-y-5">
            <div class="space-y-1">
              <h2 class="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">6. Spreadsheets & Calculations</h2>
              <p class="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">Ask Syntra to query, aggregate, filter, and calculate spreadsheet rows directly.</p>
            </div>

            <!-- Spreadsheet Calculation Mockup -->
            <div class="rounded-xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#111114] p-4 sm:p-5 space-y-3 shadow-xs">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-[#27272a] pb-2">
                Calculation Output Example
              </div>

              <!-- Python Accordion Mockup -->
              <div class="rounded-lg border border-zinc-200 dark:border-[#27272a] overflow-hidden bg-zinc-50 dark:bg-[#0c0c0e]">
                <div class="px-3 py-2 bg-zinc-100 dark:bg-[#18181b] border-b border-zinc-200 dark:border-[#27272a] flex items-center justify-between text-xs font-mono">
                  <span class="text-zinc-600 dark:text-zinc-300 font-semibold">Python Calculation Script</span>
                  <span class="text-[10px] text-zinc-400">Executed</span>
                </div>
                <div class="p-3 text-xs font-mono text-zinc-800 dark:text-zinc-200 space-y-1">
                  <p><span class="text-rose-600 dark:text-rose-400">import</span> pandas <span class="text-rose-600 dark:text-rose-400">as</span> pd</p>
                  <p>df = pd.read_excel(<span class="text-emerald-600 dark:text-emerald-400">'Q4_Sales_Report.xlsx'</span>)</p>
                  <p>total_revenue = df[<span class="text-emerald-600 dark:text-emerald-400">'Revenue'</span>].sum()</p>
                  <p class="text-zinc-400"># Output: $1,428,500.00</p>
                </div>
              </div>

              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                You can ask questions like <span class="text-zinc-800 dark:text-zinc-200">"What is the total revenue by region in the Q4 sales sheet?"</span> and Syntra will calculate verified results automatically.
              </p>
            </div>
          </section>

          <!-- Section 7: Appearance & Themes -->
          <section id="appearance" class="scroll-mt-20 space-y-5">
            <div class="space-y-1">
              <h2 class="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">7. Appearance & Themes</h2>
              <p class="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">Choose the theme that suits your working environment.</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] space-y-2 text-center">
                <div class="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center mx-auto text-xs font-bold shadow-xs">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                </div>
                <h3 class="font-semibold text-xs text-zinc-900 dark:text-white">Dark Mode</h3>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400">High contrast charcoal and pitch black theme.</p>
              </div>

              <div class="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] space-y-2 text-center">
                <div class="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-300 flex items-center justify-center mx-auto text-xs font-bold shadow-xs">
                  <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 class="font-semibold text-xs text-zinc-900 dark:text-white">Light Mode</h3>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Clean, crisp daylight palette.</p>
              </div>

              <div class="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] space-y-2 text-center">
                <div class="w-8 h-8 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center mx-auto text-xs font-bold shadow-xs">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 class="font-semibold text-xs text-zinc-900 dark:text-white">System Default</h3>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Automatically matches your operating system theme.</p>
              </div>
            </div>

            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              Change your theme anytime from <a routerLink="/settings" class="text-rose-600 dark:text-rose-400 underline font-medium">Settings &gt; Appearance</a>.
            </p>
          </section>

          <!-- Section 8: Administrator Controls (Conditional) -->
          @if (isAdmin()) {
            <section id="admin-controls" class="scroll-mt-20 space-y-5">
              <div class="space-y-1">
                <h2 class="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">8. Administrator Controls</h2>
                <p class="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">Manage user accounts, department security roles, and access request resolutions.</p>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] space-y-2 shadow-xs">
                  <h3 class="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-white">Role-Based Access Control</h3>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Create custom roles, restrict file access by department or folder, and assign master administrator permissions.
                  </p>
                </div>

                <div class="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-[#27272a] space-y-2 shadow-xs">
                  <h3 class="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-white">Access Request Approvals</h3>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Review incoming employee file access requests, read justification notes, and grant or reject access instantly.
                  </p>
                </div>
              </div>

              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                Go to the <a routerLink="/admin" class="text-rose-600 dark:text-rose-400 underline font-medium">Admin Panel</a> to manage enterprise settings.
              </p>
            </section>
          }

        </main>
      </div>
    </div>
  `
})
export class DocsComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef);
  private readonly ngZone = inject(NgZone);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  readonly themeService = inject(ThemeService);

  readonly searchQuery = signal('');
  readonly activeSection = signal('quick-start');
  readonly isPlaying = signal(true);
  readonly isAdmin = computed(() => this.authService.isAdmin());

  readonly categories = ['Getting Started', 'Features', 'Data & Settings'] as const;

  readonly sections: IDocSection[] = [
    {
      id: 'quick-start',
      title: '1. Start Here',
      category: 'Getting Started',
      summary: 'Four steps to get started with Syntra Chat'
    },
    {
      id: 'chatting',
      title: '2. Chatting & Follow-Ups',
      category: 'Getting Started',
      summary: 'How to ask questions and carry multi-turn conversations'
    },
    {
      id: 'file-discovery',
      title: '3. Find & Download Files',
      category: 'Features',
      summary: 'Discovering documents, permitted downloads, and restricted files'
    },
    {
      id: 'collections',
      title: '4. Organize with Collections',
      category: 'Features',
      summary: 'Drag-and-drop chat grouping and shared contextual memory'
    },
    {
      id: 'documents',
      title: '5. Managing Documents',
      category: 'Features',
      summary: 'Uploading files, folder organization, and replacing documents'
    },
    {
      id: 'spreadsheets',
      title: '6. Spreadsheets & Charts',
      category: 'Data & Settings',
      summary: 'Calculations, data tables, and interactive charts'
    },
    {
      id: 'appearance',
      title: '7. Appearance & Themes',
      category: 'Data & Settings',
      summary: 'Switch between Dark, Light, and System themes'
    },
    {
      id: 'admin-controls',
      title: '8. Administrator Guide',
      category: 'Data & Settings',
      summary: 'User management, permissions, and download policies'
    }
  ];

  readonly filteredSections = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const admin = this.isAdmin();
    return this.sections.filter(s => {
      if (s.id === 'admin-controls' && !admin) return false;
      if (!q) return true;
      return s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q);
    });
  });

  readonly activeSectionData = computed(() => {
    return this.sections.find(s => s.id === this.activeSection());
  });

  private animFrameId: number | null = null;
  private animStartTime: number | null = null;
  private isUserClickScrolling = false;
  private scrollObserver: IntersectionObserver | null = null;
  private animVisibilityObserver: IntersectionObserver | null = null;
  private isTutorialVisible = true;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      const prefersReducedMotion = typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
      if (prefersReducedMotion) {
        this.isPlaying.set(false);
      }

      this.route.fragment.subscribe(fragment => {
        if (fragment) {
          setTimeout(() => this.scrollToSection(fragment), 100);
        }
      });
    }
  }

  ngAfterViewInit(): void {
    if (typeof window !== 'undefined') {
      this.setupSectionObserver();
      this.setupTutorialVisibilityObserver();

      this.ngZone.runOutsideAngular(() => {
        this.startAnimationLoop();
      });
    }
  }

  ngOnDestroy(): void {
    if (this.animFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }
    if (this.animVisibilityObserver) {
      this.animVisibilityObserver.disconnect();
      this.animVisibilityObserver = null;
    }
  }

  getSectionsByCategory(cat: string): IDocSection[] {
    return this.filteredSections().filter(s => s.category === cat);
  }

  toggleAnimationPlay(): void {
    const next = !this.isPlaying();
    this.isPlaying.set(next);
    if (next) {
      this.animStartTime = null;
      this.ngZone.runOutsideAngular(() => {
        this.startAnimationLoop();
      });
    }
  }

  replayAnimations(): void {
    this.animStartTime = null;
    if (!this.isPlaying()) {
      this.isPlaying.set(true);
    }
    this.ngZone.runOutsideAngular(() => {
      this.startAnimationLoop();
    });
  }

  scrollToSection(id: string): void {
    this.activeSection.set(id);
    this.isUserClickScrolling = true;
    const targetEl = document.getElementById(id);
    if (targetEl && typeof targetEl.scrollIntoView === 'function') {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => {
      this.isUserClickScrolling = false;
    }, 650);
  }

  onMobileSelect(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    if (val) {
      this.scrollToSection(val);
    }
  }

  private setupSectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') return;

    const options: IntersectionObserverInit = {
      root: null,
      rootMargin: '-80px 0px -60% 0px',
      threshold: 0
    };

    this.scrollObserver = new IntersectionObserver((entries) => {
      if (this.isUserClickScrolling) return;

      for (const entry of entries) {
        if (entry.isIntersecting) {
          this.activeSection.set(entry.target.id);
          break;
        }
      }
    }, options);

    // Observe all doc sections
    const sectionElements = this.el.nativeElement.querySelectorAll('section[id]');
    sectionElements.forEach((sec: Element) => {
      this.scrollObserver?.observe(sec);
    });
  }

  private setupTutorialVisibilityObserver(): void {
    if (typeof IntersectionObserver === 'undefined') return;

    this.animVisibilityObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        this.isTutorialVisible = entry.isIntersecting;
      }
    }, { threshold: 0.1 });

    const collectionsSection = this.el.nativeElement.querySelector('#collections');
    if (collectionsSection) {
      this.animVisibilityObserver?.observe(collectionsSection);
    }
  }

  private startAnimationLoop(): void {
    const loopDuration = 6000; // 6.0 seconds smooth deterministic timeline

    const frame = (time: number) => {
      if (!this.isPlaying()) return;

      if (!this.isTutorialVisible) {
        // Paused while scrolled away to conserve resources
        this.animFrameId = requestAnimationFrame(frame);
        return;
      }

      if (!this.animStartTime) {
        this.animStartTime = time;
      }

      const elapsed = (time - this.animStartTime) % loopDuration;
      const progress = elapsed / loopDuration;

      this.updateTutorial1(progress);
      this.updateTutorial2(progress);

      this.animFrameId = requestAnimationFrame(frame);
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animFrameId = requestAnimationFrame(frame);
    }
  }

  private updateTutorial1(p: number): void {
    const stage = this.el.nativeElement.querySelector('#anim1Stage') as HTMLElement;
    const card = this.el.nativeElement.querySelector('#anim1Card') as HTMLElement;
    const cardSlot = this.el.nativeElement.querySelector('#anim1CardSlot') as HTMLElement;
    const cursor = this.el.nativeElement.querySelector('#anim1Cursor') as HTMLElement;
    const target = this.el.nativeElement.querySelector('#anim1Target') as HTMLElement;
    const targetCount = this.el.nativeElement.querySelector('#anim1TargetCount') as HTMLElement;
    const droppedRow = this.el.nativeElement.querySelector('#anim1DroppedRow') as HTMLElement;
    const placeholder = this.el.nativeElement.querySelector('#anim1SourcePlaceholder') as HTMLElement;

    if (!stage || !card || !cardSlot || !cursor || !target) return;

    // Responsive position measurements from DOM
    const stageRect = stage.getBoundingClientRect();
    const slotRect = cardSlot.getBoundingClientRect();
    const targetElRect = target.getBoundingClientRect();

    // Exact coordinates in stage coordinate space
    const startGrabCursorX = (slotRect.left + slotRect.width * 0.45) - stageRect.left;
    const startGrabCursorY = (slotRect.top + slotRect.height / 2) - stageRect.top;

    const targetDropCursorX = (targetElRect.left + targetElRect.width * 0.45) - stageRect.left;
    const targetDropCursorY = (targetElRect.top + targetElRect.height / 2) - stageRect.top;

    const restCursorX = stageRect.width * 0.78;
    const restCursorY = startGrabCursorY + 6;

    // Vertical delta distance from slot center to target collection center
    const totalDeltaY = (targetElRect.top + targetElRect.height / 2) - (slotRect.top + slotRect.height / 2);

    let cardTranslateY = 0;
    let cardScale = 1;
    let cardOpacity = 1;
    let cardShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
    let cardBorder = '';
    let cursorX = restCursorX;
    let cursorY = restCursorY;
    let cursorScale = 1;
    let isTargetHighlighted = false;
    let isDropped = false;
    let countText = '(1)';

    // TIMELINE PHASES:
    // 0.00 -> 0.08 (IDLE): Cursor rests at initial position
    // 0.08 -> 0.24 (MOVE_TO_CHAT): Cursor moves to RAG Testing chat item
    // 0.24 -> 0.30 (CLICK_PRESS): Cursor presses down, chat lifts
    // 0.30 -> 0.68 (DRAG_TO_TARGET): Cursor + chat move smoothly together to LangChain
    // 0.68 -> 0.78 (DROP_RELEASE): Hover over target, release click
    // 0.78 -> 0.92 (SETTLED): Chat settles inside LangChain, count becomes (2)
    // 0.92 -> 1.00 (RESET): Smooth fade back to start

    if (p < 0.08) {
      // 1. IDLE
      cursorX = restCursorX;
      cursorY = restCursorY;
      cardTranslateY = 0;
      cardScale = 1;
      cardOpacity = 1;
      countText = '(1)';
      isDropped = false;
    } else if (p < 0.24) {
      // 2. MOVE TO CHAT
      const t = (p - 0.08) / 0.16;
      const easeT = this.easeInOutCubic(t);
      cursorX = restCursorX + (startGrabCursorX - restCursorX) * easeT;
      cursorY = restCursorY + (startGrabCursorY - restCursorY) * easeT;
      cardTranslateY = 0;
      cardScale = 1;
      countText = '(1)';
      isDropped = false;
    } else if (p < 0.30) {
      // 3. PRESS & LIFT
      const t = (p - 0.24) / 0.06;
      cursorX = startGrabCursorX;
      cursorY = startGrabCursorY;
      cursorScale = 0.88; // Click press feedback
      cardScale = 1 + 0.03 * Math.sin(t * Math.PI);
      cardShadow = '0 8px 16px -2px rgba(0, 0, 0, 0.15)';
      cardBorder = '1px solid #e11d48';
      countText = '(1)';
      isDropped = false;
    } else if (p < 0.68) {
      // 4. DRAG TO TARGET (Synchronized motion)
      const t = (p - 0.30) / 0.38;
      const easeT = this.easeInOutCubic(t);

      cursorX = startGrabCursorX + (targetDropCursorX - startGrabCursorX) * easeT;
      cursorY = startGrabCursorY + (targetDropCursorY - startGrabCursorY) * easeT;
      cardTranslateY = totalDeltaY * easeT;
      cardScale = 1.03;
      cardShadow = '0 12px 24px -4px rgba(0, 0, 0, 0.2)';
      cardBorder = '1px solid #e11d48';

      if (t > 0.65) {
        isTargetHighlighted = true;
      }
      countText = '(1)';
      isDropped = false;
    } else if (p < 0.78) {
      // 5. DROP & RELEASE
      const t = (p - 0.68) / 0.10;
      cursorX = targetDropCursorX;
      cursorY = targetDropCursorY;
      cursorScale = 0.95 + 0.05 * t;
      cardTranslateY = totalDeltaY;
      cardScale = 1.03 - 0.03 * t;
      isTargetHighlighted = true;
      isDropped = true;
      cardOpacity = 1 - t; // Transition to settled row
      countText = '(2)';
    } else if (p < 0.92) {
      // 6. SETTLED & COMPLETE
      cursorX = targetDropCursorX + 30 * this.easeInOutCubic((p - 0.78) / 0.14);
      cursorY = targetDropCursorY + 20 * this.easeInOutCubic((p - 0.78) / 0.14);
      cardTranslateY = totalDeltaY;
      cardOpacity = 0;
      isTargetHighlighted = false;
      isDropped = true;
      countText = '(2)';
    } else {
      // 7. RESET
      const t = (p - 0.92) / 0.08;
      cardOpacity = t;
      cardTranslateY = 0;
      cursorX = restCursorX;
      cursorY = restCursorY;
      isDropped = false;
      countText = '(1)';
    }

    // Apply transform properties
    card.style.transform = `translate3d(0px, ${cardTranslateY}px, 0px) scale(${cardScale})`;
    card.style.opacity = cardOpacity.toString();
    card.style.boxShadow = cardShadow;
    if (cardBorder) {
      card.style.borderColor = '#e11d48';
    } else {
      card.style.borderColor = '';
    }

    cursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0px) scale(${cursorScale})`;

    // Drop target highlight styling
    if (isTargetHighlighted) {
      target.classList.add('border-rose-500', 'bg-rose-50/60', 'dark:bg-rose-950/30');
      target.classList.remove('border-transparent');
    } else {
      target.classList.remove('border-rose-500', 'bg-rose-50/60', 'dark:bg-rose-950/30');
      target.classList.add('border-transparent');
    }

    // Dropped row visibility
    if (droppedRow) {
      if (isDropped) {
        droppedRow.classList.remove('hidden');
        droppedRow.classList.add('flex');
      } else {
        droppedRow.classList.add('hidden');
        droppedRow.classList.remove('flex');
      }
    }

    // Ghost placeholder visibility
    if (placeholder) {
      if (p >= 0.30 && p < 0.92) {
        placeholder.classList.remove('hidden');
      } else {
        placeholder.classList.add('hidden');
      }
    }

    if (targetCount && targetCount.textContent !== countText) {
      targetCount.textContent = countText;
    }
  }

  private updateTutorial2(p: number): void {
    const stage = this.el.nativeElement.querySelector('#anim2Stage') as HTMLElement;
    const card = this.el.nativeElement.querySelector('#anim2Card') as HTMLElement;
    const cardSlot = this.el.nativeElement.querySelector('#anim2CardSlot') as HTMLElement;
    const cursor = this.el.nativeElement.querySelector('#anim2Cursor') as HTMLElement;
    const target = this.el.nativeElement.querySelector('#anim2Target') as HTMLElement;
    const sourceCount = this.el.nativeElement.querySelector('#anim2SourceCount') as HTMLElement;
    const targetCount = this.el.nativeElement.querySelector('#anim2TargetCount') as HTMLElement;
    const droppedRow = this.el.nativeElement.querySelector('#anim2DroppedRow') as HTMLElement;
    const placeholder = this.el.nativeElement.querySelector('#anim2SourcePlaceholder') as HTMLElement;

    if (!stage || !card || !cardSlot || !cursor || !target) return;

    // Responsive measurements from DOM
    const stageRect = stage.getBoundingClientRect();
    const slotRect = cardSlot.getBoundingClientRect();
    const targetElRect = target.getBoundingClientRect();

    // Exact coordinates in stage coordinate space
    const startGrabCursorX = (slotRect.left + slotRect.width * 0.45) - stageRect.left;
    const startGrabCursorY = (slotRect.top + slotRect.height / 2) - stageRect.top;

    const targetDropCursorX = (targetElRect.left + targetElRect.width * 0.45) - stageRect.left;
    const targetDropCursorY = (targetElRect.top + targetElRect.height / 2) - stageRect.top;

    const restCursorX = stageRect.width * 0.78;
    const restCursorY = startGrabCursorY - 24;

    // Vertical delta distance from Project Titan slot center to Q4 Marketing target center
    const totalDeltaY = (targetElRect.top + targetElRect.height / 2) - (slotRect.top + slotRect.height / 2);

    let cardTranslateY = 0;
    let cardScale = 1;
    let cardOpacity = 1;
    let cardShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
    let cardBorder = '';
    let cursorX = restCursorX;
    let cursorY = restCursorY;
    let cursorScale = 1;
    let isTargetHighlighted = false;
    let isDropped = false;
    let sCount = '(1)';
    let tCount = '(0)';

    // TIMELINE PHASES (6.0s total):
    // 0.00 -> 0.08 (IDLE): Cursor rests at top right
    // 0.08 -> 0.24 (MOVE_TO_CHAT): Cursor moves down to Sprint Planning & Milestones under Project Titan
    // 0.24 -> 0.30 (CLICK_PRESS): Cursor presses down, chat lifts
    // 0.30 -> 0.68 (DRAG_TO_TARGET): Cursor + chat drag smoothly downward toward Q4 Marketing
    // 0.68 -> 0.78 (DROP_RELEASE): Hover over Q4 Marketing, release click
    // 0.78 -> 0.92 (SETTLED): Chat settles under Q4 Marketing, Project Titan=(0), Q4 Marketing=(1)
    // 0.92 -> 1.00 (RESET): Smooth fade back to start

    if (p < 0.08) {
      // 1. IDLE
      cursorX = restCursorX;
      cursorY = restCursorY;
      cardTranslateY = 0;
      cardScale = 1;
      cardOpacity = 1;
      sCount = '(1)';
      tCount = '(0)';
      isDropped = false;
    } else if (p < 0.24) {
      // 2. MOVE TO CHAT
      const t = (p - 0.08) / 0.16;
      const easeT = this.easeInOutCubic(t);
      cursorX = restCursorX + (startGrabCursorX - restCursorX) * easeT;
      cursorY = restCursorY + (startGrabCursorY - restCursorY) * easeT;
      cardTranslateY = 0;
      cardScale = 1;
      sCount = '(1)';
      tCount = '(0)';
      isDropped = false;
    } else if (p < 0.30) {
      // 3. PRESS & LIFT
      const t = (p - 0.24) / 0.06;
      cursorX = startGrabCursorX;
      cursorY = startGrabCursorY;
      cursorScale = 0.88;
      cardScale = 1 + 0.03 * Math.sin(t * Math.PI);
      cardShadow = '0 8px 16px -2px rgba(0, 0, 0, 0.15)';
      cardBorder = '1px solid #e11d48';
      sCount = '(1)';
      tCount = '(0)';
      isDropped = false;
    } else if (p < 0.68) {
      // 4. DRAG DOWNWARD TO Q4 MARKETING
      const t = (p - 0.30) / 0.38;
      const easeT = this.easeInOutCubic(t);

      cursorX = startGrabCursorX + (targetDropCursorX - startGrabCursorX) * easeT;
      cursorY = startGrabCursorY + (targetDropCursorY - startGrabCursorY) * easeT;
      cardTranslateY = totalDeltaY * easeT;
      cardScale = 1.03;
      cardShadow = '0 12px 24px -4px rgba(0, 0, 0, 0.2)';
      cardBorder = '1px solid #e11d48';

      if (t > 0.65) {
        isTargetHighlighted = true;
      }
      sCount = '(1)';
      tCount = '(0)';
      isDropped = false;
    } else if (p < 0.78) {
      // 5. DROP & RELEASE
      const t = (p - 0.68) / 0.10;
      cursorX = targetDropCursorX;
      cursorY = targetDropCursorY;
      cursorScale = 0.95 + 0.05 * t;
      cardTranslateY = totalDeltaY;
      cardScale = 1.03 - 0.03 * t;
      isTargetHighlighted = true;
      isDropped = true;
      cardOpacity = 1 - t;
      sCount = '(0)';
      tCount = '(1)';
    } else if (p < 0.92) {
      // 6. SETTLED & COMPLETE
      cursorX = targetDropCursorX + 30 * this.easeInOutCubic((p - 0.78) / 0.14);
      cursorY = targetDropCursorY + 20 * this.easeInOutCubic((p - 0.78) / 0.14);
      cardTranslateY = totalDeltaY;
      cardOpacity = 0;
      isTargetHighlighted = false;
      isDropped = true;
      sCount = '(0)';
      tCount = '(1)';
    } else {
      // 7. RESET
      const t = (p - 0.92) / 0.08;
      cardOpacity = t;
      cardTranslateY = 0;
      cursorX = restCursorX;
      cursorY = restCursorY;
      isDropped = false;
      sCount = '(1)';
      tCount = '(0)';
    }

    // Apply transform properties
    card.style.transform = `translate3d(0px, ${cardTranslateY}px, 0px) scale(${cardScale})`;
    card.style.opacity = cardOpacity.toString();
    card.style.boxShadow = cardShadow;
    if (cardBorder) {
      card.style.borderColor = '#e11d48';
    } else {
      card.style.borderColor = '';
    }

    cursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0px) scale(${cursorScale})`;

    // Drop target highlight
    if (isTargetHighlighted) {
      target.classList.add('border-rose-500', 'bg-rose-50/60', 'dark:bg-rose-950/30');
      target.classList.remove('border-transparent');
    } else {
      target.classList.remove('border-rose-500', 'bg-rose-50/60', 'dark:bg-rose-950/30');
      target.classList.add('border-transparent');
    }

    // Dropped row under Q4 Marketing
    if (droppedRow) {
      if (isDropped) {
        droppedRow.classList.remove('hidden');
        droppedRow.classList.add('flex');
      } else {
        droppedRow.classList.add('hidden');
        droppedRow.classList.remove('flex');
      }
    }

    // Ghost placeholder visibility
    if (placeholder) {
      if (p >= 0.30 && p < 0.92) {
        placeholder.classList.remove('hidden');
      } else {
        placeholder.classList.add('hidden');
      }
    }

    if (sourceCount && sourceCount.textContent !== sCount) {
      sourceCount.textContent = sCount;
    }
    if (targetCount && targetCount.textContent !== tCount) {
      targetCount.textContent = tCount;
    }
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}
