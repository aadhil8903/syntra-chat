import { Component, signal, computed, OnInit, OnDestroy, inject, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';

export interface IDocSection {
  id: string;
  title: string;
  category: 'User Guide' | 'Admin Guide' | 'Architecture';
  badge?: string;
  summary: string;
}

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="min-h-full flex flex-col bg-[#09090b] text-[#fafafa]">
      <!-- Sub-header Breadcrumb / Actions Bar -->
      <div class="h-12 border-b border-[#27272a] bg-[#0d0d10] px-3 sm:px-6 flex items-center justify-between sticky top-0 z-20">
        <div class="flex items-center gap-1.5 sm:gap-2 text-xs text-[#a1a1aa] truncate">
          <a routerLink="/dashboard" class="hover:text-white transition-colors flex items-center gap-1.5 font-medium flex-shrink-0">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span class="hidden sm:inline">Home</span>
          </a>
          <span class="hidden sm:inline">/</span>
          <span class="text-white font-medium truncate">Docs</span>
          <span>/</span>
          <span class="text-zinc-400 font-mono text-[11px] truncate max-w-[120px] sm:max-w-xs">{{ activeSectionData()?.title }}</span>
        </div>

        <div class="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div class="relative hidden sm:block">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              placeholder="Filter topics..."
              class="w-48 px-2.5 py-1 text-xs rounded-lg bg-[#18181b] border border-[#27272a] focus:border-white focus:outline-none text-white placeholder:text-zinc-600 transition-colors"
            />
          </div>
          <a
            routerLink="/chat"
            class="px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition-colors flex items-center gap-1.5 min-h-[36px]"
          >
            <span>Open Chat</span>
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </div>
      </div>

      <div class="flex-1 flex max-w-7xl w-full mx-auto">
        <!-- Persistent Docs Sidebar Navigation -->
        <aside class="w-64 border-r border-[#27272a] bg-[#0c0c0e] flex-shrink-0 p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-6.5rem)] sticky top-12 hidden md:block select-none">
          <!-- User Guide Category -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-wider text-[#71717a]">
              <span>Part 1 — User Guide</span>
              <span class="font-mono text-[9px] text-zinc-500">{{ userGuideSections().length }}</span>
            </div>
            <nav class="space-y-0.5">
              @for (sec of userGuideSections(); track sec.id) {
                <button
                  type="button"
                  (click)="scrollToSection(sec.id)"
                  [ngClass]="activeSection() === sec.id ? 'bg-white text-black font-semibold' : 'text-[#a1a1aa] hover:text-white hover:bg-[#18181b]'"
                  class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between group"
                >
                  <span class="truncate">{{ sec.title }}</span>
                  @if (sec.badge) {
                    <span
                      [ngClass]="activeSection() === sec.id ? 'bg-black/10 text-black font-semibold' : 'bg-zinc-800 text-zinc-400'"
                      class="px-1.5 py-0.2 rounded text-[9px] font-mono flex-shrink-0"
                    >
                      {{ sec.badge }}
                    </span>
                  }
                </button>
              }
            </nav>
          </div>

          <!-- Admin Guide Category -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-wider text-[#71717a]">
              <span>Part 2 — Admin Guide</span>
              <span class="font-mono text-[9px] text-zinc-500">{{ adminGuideSections().length }}</span>
            </div>
            <nav class="space-y-0.5">
              @for (sec of adminGuideSections(); track sec.id) {
                <button
                  type="button"
                  (click)="scrollToSection(sec.id)"
                  [ngClass]="activeSection() === sec.id ? 'bg-white text-black font-semibold' : 'text-[#a1a1aa] hover:text-white hover:bg-[#18181b]'"
                  class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between group"
                >
                  <span class="truncate">{{ sec.title }}</span>
                  @if (sec.badge) {
                    <span
                      [ngClass]="activeSection() === sec.id ? 'bg-black/10 text-black font-semibold' : 'bg-zinc-800 text-zinc-400'"
                      class="px-1.5 py-0.2 rounded text-[9px] font-mono flex-shrink-0"
                    >
                      {{ sec.badge }}
                    </span>
                  }
                </button>
              }
            </nav>
          </div>

          <!-- Architecture Category -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-wider text-[#71717a]">
              <span>Part 3 — Architecture</span>
              <span class="font-mono text-[9px] text-zinc-500">{{ archSections().length }}</span>
            </div>
            <nav class="space-y-0.5">
              @for (sec of archSections(); track sec.id) {
                <button
                  type="button"
                  (click)="scrollToSection(sec.id)"
                  [ngClass]="activeSection() === sec.id ? 'bg-white text-black font-semibold' : 'text-[#a1a1aa] hover:text-white hover:bg-[#18181b]'"
                  class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between group"
                >
                  <span class="truncate">{{ sec.title }}</span>
                </button>
              }
            </nav>
          </div>
        </aside>

        <!-- Main Documentation Content Area -->
        <main class="flex-1 p-4 sm:p-6 lg:p-10 space-y-12 sm:space-y-16 max-w-4xl min-w-0">
          <!-- Mobile Topic Quick Jump Selector (< md) -->
          <div class="block md:hidden bg-[#111114] border border-[#27272a] rounded-2xl p-3.5 space-y-2">
            <label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Jump to Topic</label>
            <select
              [ngModel]="activeSection()"
              (ngModelChange)="scrollToSection($event)"
              class="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#18181b] border border-zinc-700 text-white text-xs focus:outline-none focus:border-white"
            >
              <optgroup label="Part 1 — User Guide">
                @for (sec of userGuideSections(); track sec.id) {
                  <option [value]="sec.id">{{ sec.title }}</option>
                }
              </optgroup>
              <optgroup label="Part 2 — Admin Guide">
                @for (sec of adminGuideSections(); track sec.id) {
                  <option [value]="sec.id">{{ sec.title }}</option>
                }
              </optgroup>
              <optgroup label="Part 3 — Architecture">
                @for (sec of archSections(); track sec.id) {
                  <option [value]="sec.id">{{ sec.title }}</option>
                }
              </optgroup>
            </select>
          </div>

          <!-- Overview Banner -->
          <div class="space-y-3 pb-8 border-b border-[#27272a]">
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-300">v2.0 Platform Manual</span>
              <span class="text-xs text-zinc-500 font-mono">•</span>
              <span class="text-xs text-zinc-500 font-mono">End-to-End Enterprise Guide</span>
            </div>
            <h1 class="text-3xl sm:text-4xl font-bold tracking-tight text-white">Syntra Chat Documentation</h1>
            <p class="text-sm text-zinc-400 leading-relaxed max-w-2xl">
              Complete user manual and administrator reference guide for Syntra Chat. Learn how to interrogate knowledge documents, run Python sandbox data analytics, manage folder-tree ACL permissions, and organize shared memory collections.
            </p>
          </div>

          <!-- ============================================================ -->
          <!-- PART 1 — USER GUIDE -->
          <!-- ============================================================ -->
          <div class="space-y-12">
            <div class="flex items-center gap-3">
              <div class="h-6 w-1 bg-white rounded-full"></div>
              <h2 class="text-xl font-bold tracking-tight text-white uppercase text-sm font-mono tracking-widest text-zinc-400">Part 1 — User Guide</h2>
            </div>

            <!-- 1. Getting Started -->
            <section
              id="getting-started"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'getting-started' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">1. Getting Started</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Onboarding</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                When you log into Syntra Chat for the first time, an interactive <strong>onboarding tour</strong> activates automatically. It highlights the core areas of the interface:
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div class="p-3.5 rounded-xl bg-[#141418] border border-[#27272a] space-y-1.5">
                  <div class="font-semibold text-white text-xs flex items-center gap-1.5">
                    <span class="text-emerald-400">01.</span> Navigation
                  </div>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">
                    Quickly switch between Dashboard metrics, AI Chat, Files & Knowledge, and your Settings.
                  </p>
                </div>
                <div class="p-3.5 rounded-xl bg-[#141418] border border-[#27272a] space-y-1.5">
                  <div class="font-semibold text-white text-xs flex items-center gap-1.5">
                    <span class="text-emerald-400">02.</span> Chat & Collections
                  </div>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">
                    Organize chats into Collections, group sibling topics, and search previous conversations by name.
                  </p>
                </div>
                <div class="p-3.5 rounded-xl bg-[#141418] border border-[#27272a] space-y-1.5">
                  <div class="font-semibold text-white text-xs flex items-center gap-1.5">
                    <span class="text-emerald-400">03.</span> Mentions & Prompting
                  </div>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">
                    Scope questions to specific files or folders using <code class="text-zinc-200 bg-zinc-800 px-1 py-0.5 rounded">&#64;</code> mentions.
                  </p>
                </div>
              </div>
              <p class="text-xs text-zinc-400">
                You can advance with <strong class="text-zinc-200">Next</strong>, step backwards with <strong class="text-zinc-200">Back</strong>, or click <strong class="text-zinc-200">Skip Tour</strong> at any point. You can replay the walkthrough at any time from your <a routerLink="/settings" class="text-white underline underline-offset-2">Platform Settings</a>.
              </p>
            </section>

            <!-- 2. Chatting -->
            <section
              id="chatting"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'chatting' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">2. Chatting</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Grounded Answers</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Syntra Chat answers your questions by grounding every response in your organization's actual files and datasets. The assistant adheres to strict enterprise principles:
              </p>
              <ul class="space-y-2 text-xs sm:text-sm text-zinc-300 list-disc pl-5">
                <li><strong>Concise & Fact-Based:</strong> Answers are clear and direct by default, expanding into detailed breakdowns only when requested.</li>
                <li><strong>Zero Hallucination Guarantee:</strong> If information is not present in your accessible documents, the model plainly states that the information was not found rather than guessing.</li>
                <li><strong>Source Citation Pills:</strong> When the AI references specific files, deduplicated citation badges appear below the message showing the exact files and page numbers consulted.</li>
              </ul>
            </section>

            <!-- 3. @ Mentions -->
            <section
              id="mentions"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'mentions' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">3. &#64; Mentions</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Scoped Search</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Typing <code class="text-white bg-zinc-800 px-1.5 py-0.5 rounded font-mono">&#64;</code> anywhere in the chat input opens the instant autocomplete menu. This lets you target your query specifically:
              </p>
              <div class="p-4 rounded-xl bg-[#141418] border border-[#27272a] space-y-3">
                <div class="flex items-center gap-2 text-xs text-white font-medium">
                  <span class="text-zinc-400">Supported Target Types:</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div class="p-2.5 rounded-lg bg-[#18181b] border border-zinc-800">
                    <span class="text-white font-semibold block">📄 Specific Files</span>
                    <span class="text-zinc-400 text-[11px]">PDFs, Word documents (.docx), Spreadsheets (.xlsx, .csv), Markdown, Plain text.</span>
                  </div>
                  <div class="p-2.5 rounded-lg bg-[#18181b] border border-zinc-800">
                    <span class="text-white font-semibold block">📁 Entire Folders</span>
                    <span class="text-zinc-400 text-[11px]">Selecting a folder (e.g. <code class="text-zinc-300">&#64;Engineering</code>) scopes search across all files contained within that folder.</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- 4. Unscoped Questions & Cross-Document Synthesis -->
            <section
              id="unscoped-synthesis"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'unscoped-synthesis' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">4. Unscoped Questions & Synthesis</h3>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                If you ask a question without mentioning specific files, the AI performs a <strong>hybrid semantic retrieval across your entire accessible workspace</strong>.
              </p>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                When answers span across multiple policies, quarterly reports, or operational guidelines, the AI synthesizes findings into a unified answer with individual source citations linked at the bottom. Conversational greetings and meta inquiries (e.g. <em>"What can you help me with?"</em>) do not trigger unnecessary citation badges.
              </p>
            </section>

            <!-- 5. Charts & Visualizations -->
            <section
              id="charts-visualizations"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'charts-visualizations' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">5. Charts & Visualizations</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">On-Demand Only</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Charts are rendered strictly <strong>on-demand when you explicitly request them</strong> (e.g., <em>"Plot a bar chart of quarterly revenue"</em>, <em>"Visualize our customer breakdown"</em>).
              </p>
              <div class="p-3.5 rounded-xl bg-[#141418] border border-[#27272a] text-xs text-zinc-300 space-y-1.5">
                <div class="font-medium text-white">Supported Chart Types:</div>
                <div class="flex flex-wrap gap-2 text-[11px] font-mono">
                  <span class="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200">Bar Charts</span>
                  <span class="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200">Line Trends</span>
                  <span class="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200">Pie / Doughnut</span>
                  <span class="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200">Scatter Plots</span>
                  <span class="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200">Multi-Series Comparisons</span>
                </div>
              </div>
            </section>

            <!-- 6. The Document Library -->
            <section
              id="document-library"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'document-library' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">6. The Document Library</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Unified Repository</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                The <a routerLink="/documents" class="text-white underline underline-offset-2">Files & Knowledge</a> section is the unified repository combining narrative documents, policies, datasets, and spreadsheets:
              </p>
              <ul class="space-y-2 text-xs sm:text-sm text-zinc-300 list-disc pl-5">
                <li><strong>Mixed File Types in One Folder:</strong> Folders can hold both PDF manuals and Excel spreadsheets together.</li>
                <li><strong>Tabular Preview:</strong> Clicking <em>Preview</em> on any spreadsheet opens an in-app data viewer with column data types and sample rows.</li>
                <li><strong>Folder Navigation & Breadcrumbs:</strong> Click into subfolders with breadcrumb trails. Admins can move files between folders using the <em>Move</em> action.</li>
              </ul>
            </section>

            <!-- 7. Collections -->
            <section
              id="collections"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'collections' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">7. Collections & Shared Memory</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Shared Context</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Collections let you organize related chats in your sidebar while continuously maintaining a compact <strong>shared memory</strong> across all sibling chats in that collection:
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div class="p-3.5 rounded-xl bg-[#141418] border border-[#27272a] space-y-1">
                  <div class="font-semibold text-white text-xs">📁 Personal Organization</div>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">
                    Collections are strictly personal to each user. Drag and drop any chat from Recent Chats directly onto a Collection to group it.
                  </p>
                </div>
                <div class="p-3.5 rounded-xl bg-[#141418] border border-[#27272a] space-y-1">
                  <div class="font-semibold text-white text-xs">🧠 Cross-Chat Recall</div>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">
                    Decisions and facts established in one chat (e.g. database ports, project milestones) are automatically remembered by sibling chats in the same collection.
                  </p>
                </div>
              </div>
            </section>

            <!-- 8. Managing Your Chats -->
            <section
              id="managing-chats"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'managing-chats' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">8. Managing Your Chats</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Concurrency</span>
              </div>
              <ul class="space-y-2 text-xs sm:text-sm text-zinc-300 list-disc pl-5">
                <li><strong>Search Chats:</strong> The sidebar search bar filters your conversations by title in real-time.</li>
                <li><strong>2-Concurrent Chat Limit:</strong> You can have up to 2 active AI answers generating simultaneously. If you try starting a 3rd before one finishes, a notification will ask you to wait.</li>
                <li><strong>Background Generation:</strong> Responses continue generating uninterrupted even if you switch conversations or navigate to the Document Library.</li>
                <li><strong>PDF Export:</strong> Export individual responses or complete conversations into formatted PDF reports using the export buttons.</li>
              </ul>
            </section>

            <!-- 9. Requesting Access -->
            <section
              id="requesting-access"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'requesting-access' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">9. Requesting Access</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">ACL Workflow</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                If a document or folder is restricted for your role or department, it displays with a locked badge. Clicking <strong>Request Access</strong> opens an in-app dialog where you provide a business justification. Once submitted:
              </p>
              <ol class="space-y-1.5 text-xs sm:text-sm text-zinc-300 list-decimal pl-5">
                <li>Your request appears immediately in the administrator's review queue.</li>
                <li>The item shows a <span class="font-mono text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">Pending Review</span> status.</li>
                <li>When approved by an administrator, the file or folder unlocks instantly and becomes available in your AI searches and mention pickers.</li>
              </ol>
            </section>

            <!-- 10. Your Account -->
            <section
              id="your-account"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'your-account' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">10. Your Account</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Security</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Manage your account under <a routerLink="/settings" class="text-white underline underline-offset-2">Platform Settings</a>:
              </p>
              <ul class="space-y-2 text-xs sm:text-sm text-zinc-300 list-disc pl-5">
                <li><strong>Password Changes:</strong> Requires verification of your current password before updating to a new password (minimum 8 characters, 1 uppercase, 1 number/symbol).</li>
                <li><strong>Responsive Interface:</strong> Syntra Chat is fully responsive across mobile phones, tablets, and desktop workstations, with collapsable sidebars and touch controls.</li>
              </ul>
            </section>
          </div>

          <!-- ============================================================ -->
          <!-- PART 2 — ADMIN GUIDE -->
          <!-- ============================================================ -->
          <div class="space-y-12 pt-8 border-t border-[#27272a]">
            <div class="flex items-center gap-3">
              <div class="h-6 w-1 bg-white rounded-full"></div>
              <h2 class="text-xl font-bold tracking-tight text-white uppercase text-sm font-mono tracking-widest text-zinc-400">Part 2 — Administrator Guide</h2>
            </div>

            <!-- 1. Admin Panel Overview -->
            <section
              id="admin-overview"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'admin-overview' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">1. Admin Panel Overview</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Restricted</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                The <a routerLink="/admin" class="text-white underline underline-offset-2">Admin Panel</a> is restricted strictly to accounts with the <strong class="text-white font-mono">Administrator</strong> role. Standard users cannot see or access this area. Key admin responsibilities include user provisioning, role permission templating, folder ACL assignment, and access request resolution.
              </p>
              <div class="p-3.5 rounded-xl bg-[#141418] border border-[#27272a] text-xs text-zinc-300">
                <strong>Upload Permissions:</strong> Uploading new files and creating root folders in the Document Library is strictly restricted to Administrators to prevent unauthorized data ingress.
              </div>
            </section>

            <!-- 2. Creating Users -->
            <section
              id="creating-users"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'creating-users' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">2. User Provisioning Flow</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Zero Self-Registration</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                To guarantee organizational security, <strong>self-registration does not exist</strong>. Administrators provision all user accounts:
              </p>
              <ol class="space-y-2 text-xs sm:text-sm text-zinc-300 list-decimal pl-5">
                <li>Admin enters the user's name, email, department, and assigned Role.</li>
                <li>The system automatically generates a cryptographically secure temporary password.</li>
                <li>A welcome invitation email is automatically dispatched to the user with their credentials and login URL.</li>
                <li>The user is prompted to set their permanent password upon their initial login.</li>
              </ol>
            </section>

            <!-- 3. Roles & Folder Permission Templates -->
            <section
              id="roles-templates"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'roles-templates' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">3. Roles & Permission Templates</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Templates</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Under the <strong>Roles</strong> tab, admins configure standard job profiles (e.g. <em>Financial Analyst</em>, <em>HR Specialist</em>, <em>Engineer</em>). Each role defines a default folder ACL template. When assigning a role to a new user, their folder permissions are automatically pre-filled from the role's template.
              </p>
            </section>

            <!-- 4. Departments -->
            <section
              id="departments"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'departments' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">4. Department-Based Access</h3>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Folders can be assigned to whole departments (e.g. <em>Finance</em>, <em>Engineering</em>, <em>Legal</em>). When an admin creates a folder in the Document Library or modifies folder settings, they can select target departments. Any user belonging to that department automatically inherits read access to that folder's contents.
              </p>
            </section>

            <!-- 5. Folder Access Control (ACL) -->
            <section
              id="folder-acl"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'folder-acl' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">5. Folder Access Control (ACL Tree)</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Tree Picker</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                The <strong>Folder Tree Picker</strong> provides visual hierarchical management of folder access:
              </p>
              <div class="p-4 rounded-xl bg-[#141418] border border-[#27272a] space-y-3 text-xs">
                <div class="flex items-start gap-2">
                  <span class="text-white font-bold">✓ Granting Parent Folder:</span>
                  <span class="text-zinc-400">Checking a parent folder (e.g. <code class="text-zinc-200">Engineering</code>) grants access to all files and subfolders within it by default.</span>
                </div>
                <div class="flex items-start gap-2">
                  <span class="text-white font-bold">⊘ Selective Subfolder Exclusion:</span>
                  <span class="text-zinc-400">You can grant a parent folder while unchecking a sensitive subfolder (e.g. <code class="text-zinc-200">Engineering/Credentials</code>), securely restricting that specific sub-tree.</span>
                </div>
              </div>
            </section>

            <!-- 6. Access Requests -->
            <section
              id="access-requests"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'access-requests' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">6. Access Requests & Audit Log</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Audit Trail</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                The <strong>Requests</strong> tab in the Admin Panel is split into two views:
              </p>
              <ul class="space-y-2 text-xs sm:text-sm text-zinc-300 list-disc pl-5">
                <li><strong>Pending Requests:</strong> Actionable queue where admins approve or reject access requests with one click.</li>
                <li><strong>History & Audit Log:</strong> Complete historical log of all resolved requests, recording who requested access, the business justification, which admin approved/denied it, and exact timestamps.</li>
              </ul>
            </section>

            <!-- 7. Assigning Administrator Role -->
            <section
              id="master-password"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'master-password' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">7. Assigning the Administrator Role</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Master Password</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                To prevent privilege escalation, promoting any user to the <strong>Administrator</strong> role requires entering the organization's <strong>Master Admin Password</strong>. This master secret is verified by the backend before granting administrative rights and can be rotated by current admins in Settings.
              </p>
            </section>

            <!-- 8. Storage & File Uploads -->
            <section
              id="file-storage"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'file-storage' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-semibold text-white tracking-tight">8. File Storage & Cloud Integration</h3>
                <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">Zero Local Disk</span>
              </div>
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                All uploaded files and spreadsheets are streamed directly into <strong>secure cloud object storage (GridFS / S3)</strong>. Files are never persisted on local web server disks. File chunks and high-dimensional semantic embeddings are stored in dedicated collections with RBAC metadata tags.
              </p>
            </section>
          </div>

          <!-- ============================================================ -->
          <!-- PART 3 — HOW IT WORKS -->
          <!-- ============================================================ -->
          <div class="space-y-8 pt-8 border-t border-[#27272a]">
            <div class="flex items-center gap-3">
              <div class="h-6 w-1 bg-white rounded-full"></div>
              <h2 class="text-xl font-bold tracking-tight text-white uppercase text-sm font-mono tracking-widest text-zinc-400">Part 3 — How It Works (High-Level Model)</h2>
            </div>

            <section
              id="architecture"
              class="p-6 rounded-2xl border transition-all duration-300 scroll-mt-20 space-y-4"
              [ngClass]="activeSection() === 'architecture' ? 'bg-[#111114] border-white/50 shadow-2xl ring-1 ring-white/20' : 'bg-transparent border-transparent'"
            >
              <p class="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Syntra Chat combines enterprise security policies with AI-driven retrieval and code execution:
              </p>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div class="p-4 rounded-xl bg-[#141418] border border-[#27272a] space-y-2">
                  <div class="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div class="text-xs font-semibold text-white">1. Secure Ingestion</div>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">
                    Documents are indexed into semantic chunks with permission metadata tags. Files are encrypted at rest.
                  </p>
                </div>

                <div class="p-4 rounded-xl bg-[#141418] border border-[#27272a] space-y-2">
                  <div class="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div class="text-xs font-semibold text-white">2. RBAC Enforcement</div>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">
                    Before any AI query runs, your folder and file ACLs are validated. The AI can never retrieve chunks from unauthorized folders.
                  </p>
                </div>

                <div class="p-4 rounded-xl bg-[#141418] border border-[#27272a] space-y-2">
                  <div class="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div class="text-xs font-semibold text-white">3. Sandboxed Analytics</div>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">
                    Spreadsheet analytics run in isolated sandboxed Python environments with strict timeout and AST safety checks.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  `,
})
export class DocsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private elRef = inject(ElementRef);

  searchQuery = '';
  activeSection = signal<string>('getting-started');

  private scrollContainer: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;
  private boundScrollHandler: (() => void) | null = null;
  private isUserClickScrolling = false;

  readonly sections: IDocSection[] = [
    // User Guide
    { id: 'getting-started', title: '1. Getting Started', category: 'User Guide', badge: 'Tour', summary: 'First login and interactive onboarding walkthrough' },
    { id: 'chatting', title: '2. Chatting & Grounding', category: 'User Guide', summary: 'Grounded question answering with zero fabrication' },
    { id: 'mentions', title: '3. @ Mentions Scoping', category: 'User Guide', badge: '@', summary: 'File and folder autocomplete picker' },
    { id: 'unscoped-synthesis', title: '4. Unscoped Synthesis', category: 'User Guide', summary: 'Cross-document knowledge retrieval' },
    { id: 'charts-visualizations', title: '5. Charts & Visualizations', category: 'User Guide', summary: 'Explicit on-demand chart builder' },
    { id: 'document-library', title: '6. Document Library', category: 'User Guide', summary: 'Unified knowledge files, folders, and tabular preview' },
    { id: 'collections', title: '7. Collections & Memory', category: 'User Guide', badge: 'Shared', summary: 'Shared context across sibling chats' },
    { id: 'managing-chats', title: '8. Managing Chats', category: 'User Guide', summary: 'Search, PDF export, and concurrency limits' },
    { id: 'requesting-access', title: '9. Requesting Access', category: 'User Guide', summary: 'Locked folder access justification workflow' },
    { id: 'your-account', title: '10. Your Account', category: 'User Guide', summary: 'Password change security and mobile interface' },

    // Admin Guide
    { id: 'admin-overview', title: '1. Admin Overview', category: 'Admin Guide', summary: 'Administrator role privileges and restricted upload' },
    { id: 'creating-users', title: '2. Provisioning Users', category: 'Admin Guide', summary: 'Auto-generated passwords and welcome emails' },
    { id: 'roles-templates', title: '3. Roles & Templates', category: 'Admin Guide', summary: 'Pre-filling folder permissions from role templates' },
    { id: 'departments', title: '4. Department Access', category: 'Admin Guide', summary: 'Department-wide folder inheritance' },
    { id: 'folder-acl', title: '5. Folder ACL Tree', category: 'Admin Guide', summary: 'Tree picker and subfolder exclusion' },
    { id: 'access-requests', title: '6. Access Requests', category: 'Admin Guide', summary: 'Pending queue and historical audit trail' },
    { id: 'master-password', title: '7. Master Admin Password', category: 'Admin Guide', summary: 'High-privilege secret for admin promotion' },
    { id: 'file-storage', title: '8. Storage & Uploads', category: 'Admin Guide', summary: 'Direct cloud storage without local disk persistence' },

    // Architecture
    { id: 'architecture', title: 'How It Works', category: 'Architecture', summary: 'Mental model for ingestion, RBAC, and sandboxing' },
  ];

  filteredSections = computed(() => {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) return this.sections;
    return this.sections.filter(
      (s) => s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
    );
  });

  userGuideSections = computed(() => this.filteredSections().filter((s) => s.category === 'User Guide'));
  adminGuideSections = computed(() => this.filteredSections().filter((s) => s.category === 'Admin Guide'));
  archSections = computed(() => this.filteredSections().filter((s) => s.category === 'Architecture'));

  activeSectionData = computed(() => this.sections.find((s) => s.id === this.activeSection()));

  ngOnInit(): void {
    this.route.fragment.subscribe((frag: string | null) => {
      if (frag && this.sections.some((s) => s.id === frag)) {
        this.scrollToSection(frag);
      }
    });

    setTimeout(() => {
      this.initScrollTracking();
    }, 200);
  }

  ngOnDestroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.boundScrollHandler && this.scrollContainer) {
      this.scrollContainer.removeEventListener('scroll', this.boundScrollHandler);
    }
    if (this.boundScrollHandler) {
      window.removeEventListener('scroll', this.boundScrollHandler);
    }
  }

  private initScrollTracking(): void {
    // Find the scrollable ancestor (<main class="flex-1 overflow-y-auto"> in app.component.ts)
    let parent = this.elRef.nativeElement.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        this.scrollContainer = parent;
        break;
      }
      parent = parent.parentElement;
    }

    this.boundScrollHandler = () => {
      if (this.isUserClickScrolling) return;
      this.determineActiveSection();
    };

    if (this.scrollContainer) {
      this.scrollContainer.addEventListener('scroll', this.boundScrollHandler, { passive: true });
    }
    window.addEventListener('scroll', this.boundScrollHandler, { passive: true });

    // Initial check
    this.determineActiveSection();
  }

  private determineActiveSection(): void {
    const containerTop = this.scrollContainer
      ? this.scrollContainer.getBoundingClientRect().top
      : 0;

    const threshold = containerTop + 140;
    let closestSectionId = this.sections[0].id;
    let minDistance = Number.POSITIVE_INFINITY;

    for (const sec of this.sections) {
      const el = document.getElementById(sec.id);
      if (el) {
        const rect = el.getBoundingClientRect();
        // If element is near top or actively scrolled past threshold
        if (rect.top <= threshold && rect.bottom > threshold) {
          closestSectionId = sec.id;
          break;
        }
        const dist = Math.abs(rect.top - threshold);
        if (dist < minDistance) {
          minDistance = dist;
          closestSectionId = sec.id;
        }
      }
    }

    if (this.activeSection() !== closestSectionId) {
      this.activeSection.set(closestSectionId);
    }
  }

  scrollToSection(id: string): void {
    this.activeSection.set(id);
    this.isUserClickScrolling = true;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => {
      this.isUserClickScrolling = false;
    }, 600);
  }
}
