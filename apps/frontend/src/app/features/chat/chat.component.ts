import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ModalDialogService } from '../../core/services/modal-dialog.service';
import { ChatStateService } from '../../core/services/chat-state.service';
import {
  IConversation,
  ICollection,
  ICreateCollectionDto,
  IUpdateCollectionDto,
  IMessage,
  IMentionOption,
  MentionResourceType,
} from '@enter-chat/shared-types';
import { CollectionsWalkthroughService } from '../../core/services/collections-walkthrough.service';
import { VoiceRecognitionService } from '../../core/services/voice-recognition.service';
import { TableViewerComponent } from '../../shared/components/table-viewer/table-viewer.component';
import { ChartViewerComponent } from '../../shared/components/chart-viewer/chart-viewer.component';
import { MentionAutocompleteComponent } from './mention-autocomplete/mention-autocomplete.component';
import { TextSelectionToolbarComponent, ISelectionActionEvent } from '../../shared/components/text-selection-toolbar/text-selection-toolbar.component';
import { PdfReportService } from '../../core/services/pdf-report.service';
import { CitationBadgeComponent } from '../../shared/components/citation-badge/citation-badge.component';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { ChatDraftService, TEMPORARY_NEW_CHAT_ID } from '../../core/services/chat-draft.service';
import jsPDF from 'jspdf';
import hljs from 'highlight.js';

export interface IDynamicStarterCard {
  icon: string;
  title: string;
  subtitle: string;
  promptText: string;
  resource?: IMentionOption;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TableViewerComponent,
    ChartViewerComponent,
    MentionAutocompleteComponent,
    TextSelectionToolbarComponent,
    CitationBadgeComponent,
    MarkdownPipe,
  ],
  template: `
    <div class="flex h-full bg-[#09090b] overflow-hidden select-text relative">
      <!-- Floating Selection Contextual Toolbar -->
      <app-text-selection-toolbar
        [targetContainer]="scrollContainer"
        (actionTriggered)="onSelectionAction($event)"
      ></app-text-selection-toolbar>

      <!-- Left Conversations Drawer (Resizable) -->
      @if (!isConvCollapsed) {
        <div
          [style.width.px]="convWidth"
          class="relative border-r border-[#27272a] bg-[#0d0d10] flex flex-col justify-between p-3 flex-shrink-0 select-none transition-[width] duration-75"
        >
          <!-- Fixed Top Header & Search Area (Pinned) -->
          <div class="flex-shrink-0 space-y-2 pb-2 border-b border-[#27272a]/60">
            <!-- Header & New Chat button -->
            <div class="flex items-center justify-between gap-2">
              <button
                (click)="createNewConversation()"
                class="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors flex items-center justify-center gap-2"
              >
                <svg class="w-4 h-4" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>New Chat</span>
              </button>

              <button
                (click)="toggleConvCollapse()"
                class="p-2 rounded-xl text-[#a1a1aa] hover:text-white hover:bg-[#18181b] transition-colors"
                title="Collapse conversations"
              >
                <svg class="w-4 h-4" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>

            <!-- Search Input (Strict title search) -->
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-zinc-500">
                <svg class="w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                [(ngModel)]="searchQuery"
                (input)="onSearchInput($event)"
                placeholder="Search chats by name..."
                class="w-full pl-8 pr-7 py-1.5 bg-[#111114] border border-[#27272a] focus:border-white focus:outline-none rounded-xl text-white text-xs placeholder-zinc-500 transition-colors"
              />
              @if (searchQuery) {
                <button
                  (click)="clearSearch()"
                  class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-zinc-500 hover:text-white"
                  title="Clear search"
                >
                  <svg class="w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              }
            </div>
          </div>

          <!-- ONE Continuous Scrollable Region: Collections + Recent Chats -->
          <div class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 pt-2 space-y-4 pr-0.5 custom-sidebar-scrollbar">
            <!-- Collections Section -->
            <div data-tour="collections-section" class="space-y-1">
              <!-- Compact Collections Header Row -->
              <div class="flex items-center justify-between px-2 py-1 text-xs select-none min-w-0">
                <div
                  (click)="toggleAllCollectionsSectionCollapse()"
                  class="flex items-center gap-1.5 cursor-pointer text-zinc-400 hover:text-zinc-200 transition-colors group min-w-0 flex-1 truncate"
                  title="Toggle collections section"
                >
                  <svg
                    class="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-transform flex-shrink-0"
                    [ngClass]="isCollectionsGroupExpanded ? 'rotate-90 text-zinc-300' : ''"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                  </svg>
                  <span class="text-[10px] font-bold uppercase tracking-widest text-[#71717a] group-hover:text-zinc-300 truncate">Collections</span>
                  <span class="text-[10px] text-zinc-500 font-mono font-medium flex-shrink-0">({{ collections.length }})</span>
                </div>

                <button
                  data-tour="create-collection-btn"
                  (click)="openCreateCollectionModal()"
                  class="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex items-center justify-center flex-shrink-0 border border-zinc-800 hover:border-zinc-600"
                  title="New Collection"
                  aria-label="New Collection"
                >
                  <svg class="w-3.5 h-3.5 text-zinc-400 hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                </button>
              </div>

              <!-- Collections List (when group expanded) -->
              @if (isCollectionsGroupExpanded) {
                <div data-tour="collections-list" class="space-y-0.5">
                  @for (col of collections; track col.id) {
                    <div
                      class="rounded-xl border transition-all"
                      [ngClass]="dragOverCollectionId === col.id ? 'bg-zinc-800/90 border-white/60 ring-1 ring-white/50' : 'border-transparent hover:border-zinc-800/40 bg-transparent hover:bg-[#111114]/40'"
                      (dragover)="onDragOverCollection(col.id, $event)"
                      (dragleave)="onDragLeaveCollection(col.id, $event)"
                      (drop)="onDropOnCollection(col.id, $event)"
                    >
                      <!-- Collection Row -->
                      <div
                        (click)="toggleCollectionExpand(col.id)"
                        class="flex items-center justify-between px-2 py-1.5 cursor-pointer text-xs group rounded-lg hover:bg-zinc-800/40 transition-colors"
                      >
                        <div class="flex items-center gap-1.5 truncate">
                          <!-- Exact Folder-Tree Arrow Chevron from Round 7 -->
                          <button
                            type="button"
                            (click)="toggleCollectionExpand(col.id); $event.stopPropagation()"
                            class="w-3.5 h-3.5 flex items-center justify-center text-zinc-400 hover:text-white transition-transform p-0 rounded flex-shrink-0"
                            [title]="isCollectionExpanded(col.id) ? 'Collapse collection' : 'Expand collection'"
                          >
                            <svg
                              class="w-3 h-3 transition-transform duration-150"
                              [ngClass]="isCollectionExpanded(col.id) ? 'rotate-90 text-white' : 'text-zinc-500'"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                            </svg>
                          </button>
                          <span class="truncate font-medium text-zinc-200 text-xs">{{ col.name }}</span>
                          <span class="text-[10px] text-zinc-500 font-mono font-normal">({{ getConversationsForCollection(col.id).length }})</span>
                        </div>

                        <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            (click)="createNewConversation(col.id); $event.stopPropagation()"
                            class="p-1 hover:text-white text-zinc-400 hover:bg-zinc-800 rounded"
                            title="New chat in this collection"
                          >
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                          <button
                            (click)="openRenameCollectionModal(col, $event)"
                            class="p-1 hover:text-white text-zinc-500 hover:bg-zinc-800 rounded"
                            title="Rename collection"
                          >
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            (click)="deleteCollection(col.id, $event)"
                            class="p-1 hover:text-white text-zinc-500 hover:bg-zinc-800 rounded"
                            title="Delete collection"
                          >
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <!-- Collection Chats (Accordion Body) -->
                      @if (isCollectionExpanded(col.id)) {
                        <div class="pl-4 pr-1 py-0.5 space-y-0.5 border-l border-zinc-800/60 ml-3.5 mb-1">
                          @for (conv of getConversationsForCollection(col.id); track conv.id) {
                            <div
                              draggable="true"
                              (dragstart)="onDragStartChat(conv, $event)"
                              (dragend)="onDragEndChat()"
                              (click)="selectConversation(conv)"
                              [ngClass]="activeConversation?.id === conv.id ? 'bg-[#18181b] text-white font-medium border border-[#3f3f46]' : 'text-[#a1a1aa] hover:text-white hover:bg-[#141417]'"
                              class="group/item flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-xs"
                            >
                              <div class="flex items-center gap-1.5 truncate">
                                <span class="text-zinc-500 cursor-grab active:cursor-grabbing text-[11px] select-none">&#x22EE;</span>
                                <span class="truncate">{{ conv.title }}</span>
                              </div>
                              <div class="flex items-center gap-1">
                                @if (chatState.isGenerating(conv.id)) {
                                  <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0"></span>
                                }
                                <button
                                  (click)="unassignFromCollection(conv, $event)"
                                  class="opacity-0 group-hover/item:opacity-100 p-0.5 hover:text-white text-zinc-500 transition-opacity text-[10px]"
                                  title="Move to Recent Chats"
                                >
                                  &times;
                                </button>
                              </div>
                            </div>
                          }
                          @if (getConversationsForCollection(col.id).length === 0) {
                            <div class="px-2 py-1.5 flex items-center justify-between text-[11px] text-zinc-500">
                              <span class="italic text-[10px]">Empty collection</span>
                              <button
                                (click)="createNewConversation(col.id)"
                                class="text-[10px] text-zinc-400 hover:text-white underline underline-offset-2"
                              >
                                + Add Chat
                              </button>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }

                  <!-- Dedicated New Collection Action Row -->
                  <button
                    (click)="openCreateCollectionModal()"
                    class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/40 border border-dashed border-zinc-800/80 hover:border-zinc-700 transition-all group mt-1"
                    title="Create new collection"
                  >
                    <svg class="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    <span class="text-[11px] font-medium tracking-tight">New Collection</span>
                  </button>
                </div>
              }
            </div>

            <!-- Recent Chats / Uncollected Chats (Directly continuous in single scroll container) -->
            <div data-tour="recent-chats-list" class="space-y-1 pt-1">
              <div class="flex items-center justify-between px-1.5 py-1 text-xs">
                <div class="text-[10px] font-bold uppercase tracking-widest text-[#71717a]">
                  {{ searchQuery ? 'Search Results' : 'Recent Chats' }}
                </div>
                @if (chatState.activeGenerationsCount() > 0 && !searchQuery) {
                  <span class="text-[10px] font-mono text-zinc-300">
                    {{ chatState.activeGenerationsCount() }}/2 active
                  </span>
                }
              </div>

              @if (getRecentUncollectedChats().length === 0) {
                <div class="px-3 py-3 text-center text-xs text-zinc-500 italic">
                  {{ searchQuery ? 'No chats matching "' + searchQuery + '"' : 'No uncollected chats' }}
                </div>
              }

              @for (conv of getRecentUncollectedChats(); track conv.id) {
                <div
                  draggable="true"
                  (dragstart)="onDragStartChat(conv, $event)"
                  (dragend)="onDragEndChat()"
                  (click)="selectConversation(conv)"
                  [ngClass]="activeConversation?.id === conv.id ? 'bg-[#18181b] text-white font-medium border border-[#3f3f46]' : 'text-[#a1a1aa] hover:text-white hover:bg-[#141417]'"
                  class="group flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer transition-colors text-xs"
                >
                  <div class="flex items-center gap-2 truncate">
                    <span class="text-zinc-500 cursor-grab active:cursor-grabbing text-xs select-none">&#x22EE;</span>
                    <svg class="w-3.5 h-3.5 flex-shrink-0 text-zinc-500 group-hover:text-zinc-300" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    <span class="truncate">{{ conv.title }}</span>
                  </div>
                  <div class="flex items-center gap-1">
                    @if (chatState.isGenerating(conv.id)) {
                      <span class="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-200 text-[9px] font-mono flex-shrink-0" title="Generating in background">
                        <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                        <span class="hidden sm:inline">running</span>
                      </span>
                    }
                    <button
                      (click)="deleteConversation(conv.id, $event)"
                      class="opacity-0 group-hover:opacity-100 p-1 hover:text-white text-zinc-500 transition-opacity"
                      title="Delete chat"
                    >
                      <svg class="w-3 h-3" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Resizing Drag Handle -->
          <div
            (mousedown)="startResizeConv($event)"
            class="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-white/50 active:bg-white transition-colors z-20"
            title="Drag to resize conversations"
          ></div>
        </div>
      }

      <!-- Main Chat Area -->
      <div class="flex-1 flex flex-col h-full min-w-0 bg-[#09090b] relative">

        <!-- Chat Header -->
        <div class="h-12 border-b border-[#27272a] px-4 flex items-center justify-between flex-shrink-0 bg-[#09090b]">
          <div class="flex items-center gap-3 min-w-0">
            @if (isConvCollapsed) {
              <button
                (click)="toggleConvCollapse()"
                class="p-1.5 rounded-lg text-[#a1a1aa] hover:text-white hover:bg-[#18181b] transition-colors"
                title="Show conversations"
              >
                <svg class="w-4 h-4" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            }
            <div class="w-2 h-2 rounded-full" [ngClass]="isCurrentGenerating ? 'bg-[#38bdf8] animate-pulse' : 'bg-zinc-600'"></div>
            <h2 class="font-medium text-white text-xs tracking-tight truncate max-w-sm sm:max-w-md">
              {{ activeConversation?.title || 'New Workplace Session' }}
            </h2>
          </div>

          <div class="flex items-center gap-2">
            @if (chatState.activeGenerationsCount() > 0) {
              <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-[10px] font-mono text-zinc-200">
                <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                <span>{{ chatState.activeGenerationsCount() }}/2 Active Chats</span>
              </div>
            }
            @if (messages.length > 0) {
              <button
                (click)="exportConversationPdf()"
                class="px-2.5 py-1 rounded-lg bg-[#18181b] hover:bg-[#27272a] text-[#a1a1aa] hover:text-white text-xs font-medium border border-[#27272a] flex items-center gap-1.5 transition-colors"
                title="Export as PDF"
              >
                <svg class="w-3.5 h-3.5 text-zinc-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export PDF</span>
              </button>
            }
          </div>
        </div>

        <!-- Messages Thread -->
        <div #scrollContainer class="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6 max-w-4xl mx-auto w-full">
          @if (messages.length === 0 && !isCurrentGenerating) {
            <div class="h-full flex flex-col items-center justify-center text-center space-y-6 py-12 animate-fade-in my-auto">
              <div class="w-12 h-12 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center p-2.5">
                <img src="/logo-icon.png" alt="Syntra" class="w-full h-full object-contain" />
              </div>
              <div class="space-y-1.5">
                <h3 class="text-base font-semibold text-white">Syntra Chat AI Assistant</h3>
                <p class="text-xs text-[#a1a1aa] leading-relaxed max-w-md mx-auto">
                  Ask questions, summarize documents, analyze spreadsheets and datasets, or mention specific files with <span class="text-white font-mono bg-[#18181b] px-1.5 py-0.5 rounded border border-[#27272a]">&#64;</span>.
                </p>
              </div>

              <!-- Quick Prompt Starters (Dynamic Workspace Cards) -->
              @if (dynamicStarters.length > 0) {
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full text-left pt-2">
                  @for (card of dynamicStarters; track card.title) {
                    <button
                      (click)="sendQuickPrompt(card.promptText, card.resource)"
                      class="p-3 rounded-xl bg-[#111114] hover:bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] transition-all text-xs space-y-1 group hover:scale-[1.01]"
                    >
                      <div class="font-medium text-white flex items-center gap-1.5 truncate">
                        <span class="text-sm flex-shrink-0">{{ card.icon }}</span>
                        <span class="truncate font-semibold text-zinc-100">{{ card.title }}</span>
                      </div>
                      <div class="text-[#71717a] text-[11px] truncate group-hover:text-[#a1a1aa] transition-colors">
                        {{ card.subtitle }}
                      </div>
                    </button>
                  }
                </div>
              }
            </div>
          }

          @for (msg of messages; track $index) {
            @if (msg.role === 'user' || (msg.content && msg.content.length > 0) || msg.generatedChart || (msg.generatedCharts && msg.generatedCharts.length > 0) || msg.generatedTable || msg.pythonCode) {
              <div
                [ngClass]="msg.role === 'user' ? 'justify-end' : 'justify-start'"
                class="flex gap-3 animate-fade-in"
              >
                @if (msg.role !== 'user') {
                  <div class="w-7 h-7 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center flex-shrink-0 p-1 mt-0.5">
                    <img src="/logo-icon.png" alt="Syntra" class="w-full h-full object-contain" />
                  </div>
                }

                <div
                  [ngClass]="msg.role === 'user' ? 'bg-[#18181b] text-white rounded-2xl rounded-tr-sm px-4 py-3 border border-[#3f3f46] max-w-[85%]' : 'bg-transparent text-white flex-1 max-w-full'"
                  class="text-sm leading-relaxed group relative"
                >
                  <!-- Rendered Rich Markdown Content -->
                  @if (msg.role === 'user') {
                    @if (msg.referencedResourceIds && msg.referencedResourceIds.length > 0) {
                      <div class="flex flex-wrap gap-1.5 mb-2">
                        @for (rId of msg.referencedResourceIds; track rId) {
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#27272a] border border-[#3f3f46] text-[11px] text-zinc-300">
                            <span class="text-white font-bold">&#64;</span>
                            <span>{{ getResourceDisplayName(rId) }}</span>
                          </span>
                        }
                      </div>
                    }
                    <div class="whitespace-pre-wrap text-sm">{{ msg.content }}</div>
                  } @else {
                    <div class="prose-ai" [innerHTML]="msg.content | markdown"></div>
                  }

                  <!-- Python Execution Code Viewer Accordion (VS Code Dark+ Pitch Black) -->
                  @if (msg.pythonCode) {
                    <details class="mt-3 text-xs border border-[#27272a] rounded-xl overflow-hidden bg-black shadow-xl">
                      <summary class="px-3.5 py-2 cursor-pointer text-[#a1a1aa] hover:text-white font-mono font-medium flex items-center justify-between bg-[#0a0a0c] border-b border-[#27272a]/70 select-none">
                        <span class="flex items-center gap-2">
                          <svg class="w-3.5 h-3.5 text-[#3b82f6]" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                          </svg>
                          <span class="text-zinc-300 font-semibold">Python Calculation Script</span>
                        </span>
                        <div class="flex items-center gap-2.5">
                          <span class="text-[10px] text-zinc-500 font-mono">Python 3.11</span>
                          <button type="button" class="copy-code-btn inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 rounded hover:bg-zinc-800 transition-all cursor-pointer select-none active:scale-95" (click)="$event.stopPropagation(); copyDirectText(msg.pythonCode, $event)" title="Copy Python script">
                            <svg class="copy-icon w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span class="copy-text font-sans">Copy</span>
                          </button>
                        </div>
                      </summary>
                      <div class="p-3.5 bg-black font-mono text-[12px] overflow-x-auto leading-relaxed">
                        <pre class="hljs-vscode-dark m-0"><code class="hljs language-python" [innerHTML]="highlightCode(msg.pythonCode, 'python')"></code></pre>
                      </div>
                    </details>
                  }

                  <!-- Generated Table (if available) -->
                  @if (msg.generatedTable) {
                    <app-table-viewer [table]="msg.generatedTable"></app-table-viewer>
                  }

                  <!-- Generated Charts (Single or Multiple) -->
                  <div data-tour="chat-charts">
                    @if (msg.generatedCharts && msg.generatedCharts.length > 0) {
                      @for (chart of msg.generatedCharts; track $index) {
                        <app-chart-viewer [chartSpec]="chart"></app-chart-viewer>
                      }
                    } @else if (msg.generatedChart) {
                      <app-chart-viewer [chartSpec]="msg.generatedChart"></app-chart-viewer>
                    }
                  </div>

                  <!-- Sources & Citations (if available) -->
                  @if (msg.citations && msg.citations.length > 0) {
                    <div data-tour="chat-citations">
                      <app-citation-badge [citations]="msg.citations"></app-citation-badge>
                    </div>
                  }

                  <!-- Action Toolbar for Assistant Message -->
                  @if (msg.role !== 'user' && msg.content && msg.content.trim().length > 0) {
                    <div class="flex items-center justify-start gap-2 pt-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        (click)="copyMessageText(msg.content)"
                        class="text-[11px] text-[#71717a] hover:text-white flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-[#18181b] border border-transparent hover:border-zinc-800"
                        title="Copy response"
                      >
                        <svg class="w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy</span>
                      </button>

                      <button
                        (click)="exportMessagePdf(msg, $event)"
                        class="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors px-2 py-1 rounded-md hover:bg-[#18181b] border border-transparent hover:border-zinc-700 font-medium"
                        title="Export this calculation or analysis as a branded PDF report"
                      >
                        <svg class="w-3.5 h-3.5 text-zinc-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span>Export as PDF Report</span>
                      </button>
                    </div>
                  }
                </div>
              </div>
            }
          }

          <!-- Live Reasoning Animation for THIS specific conversation -->
          @if (isCurrentGenerating) {
            <div class="flex gap-3 justify-start animate-fade-in">
              <div class="w-7 h-7 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center flex-shrink-0 p-1 mt-0.5">
                <img src="/logo-icon.png" alt="Syntra" class="w-full h-full object-contain" />
              </div>
              <div class="bg-[#111114] border border-[#27272a] rounded-xl px-4 py-2.5 text-xs flex items-center gap-2.5 text-white">
                <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                <span class="font-mono text-[#a1a1aa] transition-all duration-300">{{ currentGeneratingStatus }}</span>
              </div>
            </div>
          }

          <!-- Per-Chat or Global Concurrency Error Banner -->
          @if (activeError) {
            <div class="p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs flex items-center justify-between">
              <span>{{ activeError }}</span>
              <button (click)="dismissError()" class="text-white font-semibold hover:underline ml-3 flex-shrink-0">Dismiss</button>
            </div>
          }
        </div>

        <!-- Input Box & Mention Autocomplete -->
        <div class="p-4 border-t border-[#27272a] bg-[#0d0d10] relative flex-shrink-0">
          <div class="max-w-4xl mx-auto relative">
            <!-- Autocomplete Dropdown Component -->
            <app-mention-autocomplete
              [isOpen]="isMentionOpen"
              [options]="mentionOptions"
              (optionSelected)="onMentionSelected($event)"
              (closed)="isMentionOpen = false"
            ></app-mention-autocomplete>

            <!-- Attached Mention Chips -->
            @if (attachedResources.length > 0) {
              <div class="flex flex-wrap gap-2 mb-2">
                @for (res of attachedResources; track res.id) {
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#18181b] border border-[#3f3f46] text-white text-xs font-mono">
                    <span>&#64;{{ res.name }}</span>
                    <button (click)="removeAttachedResource(res.id)" class="hover:text-white ml-1">×</button>
                  </span>
                }
              </div>
            }

            <!-- Concurrency Notice when limit is reached -->
            @if (isMaxGenerationsReached) {
              <div class="mb-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-[11px] flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                <span>2 chats are currently generating in the background. Please wait for one to complete.</span>
              </div>
            }

            <!-- Floating Prompt Container (Claude/ChatGPT Style) -->
            <div data-tour="chat-input-area" class="bg-[#111114] border border-[#27272a] focus-within:border-white rounded-2xl p-2.5 transition-colors">
              <div class="flex items-start gap-1">
                <textarea
                  #inputArea
                  [(ngModel)]="inputText"
                  (input)="onInputChange($event)"
                  (keydown)="onKeyDown($event)"
                  placeholder="Ask anything naturally or type @ to mention files or folders... (Shift + Enter for new line)"
                  [disabled]="isCurrentGenerating || isMaxGenerationsReached"
                  rows="1"
                  class="w-full bg-transparent border-0 text-white text-sm px-2 py-1.5 focus:outline-none resize-none max-h-60 overflow-y-auto leading-relaxed disabled:opacity-50 transition-[height] duration-150"
                ></textarea>

                <!-- Voice / Microphone Button in Top-Right of Input Box -->
                <button
                  type="button"
                  (click)="toggleVoiceInput()"
                  [disabled]="isCurrentGenerating || isMaxGenerationsReached"
                  [ngClass]="voiceService.isListening ? 'bg-white text-black font-semibold border border-white' : 'text-zinc-400 hover:text-white hover:bg-[#18181b] border border-transparent hover:border-[#27272a]'"
                  class="p-1.5 rounded-xl text-xs flex items-center justify-center transition-all flex-shrink-0 mt-0.5"
                  [title]="voiceService.isListening ? 'Listening... Click to stop recording' : 'Voice input (Click to speak)'"
                >
                  <svg class="w-4 h-4" [ngClass]="voiceService.isListening ? 'text-black' : 'text-zinc-400 hover:text-white'" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              </div>

              <div class="flex items-center justify-between pt-1 border-t border-[#27272a] mt-1">
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    (click)="triggerMentionMenu()"
                    data-tour="chat-mention-btn"
                    [disabled]="isCurrentGenerating || isMaxGenerationsReached"
                    class="px-2.5 py-1 rounded-lg text-[#a1a1aa] hover:text-white hover:bg-[#18181b] border border-[#27272a] text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
                    title="Attach & mention document or dataset"
                  >
                    <span class="text-white font-bold">&#64;</span>
                    <span class="font-medium">Mention</span>
                  </button>
                  <span class="text-[11px] text-[#71717a] hidden sm:inline">Folder & File Scoped AI</span>
                </div>

                <button
                  (click)="sendUserMessage()"
                  [disabled]="isCurrentGenerating || isMaxGenerationsReached || (!inputText.trim() && attachedResources.length === 0)"
                  class="px-3.5 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0"
                  title="Send (Enter)"
                >
                  <span>Send</span>
                  <svg class="w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between mt-2 px-1 text-[11px] text-[#71717a]">
              <span>Press <kbd class="px-1 py-0.5 rounded bg-[#18181b] text-zinc-300 font-mono text-[10px]">Enter</kbd> to send, <kbd class="px-1 py-0.5 rounded bg-[#18181b] text-zinc-300 font-mono text-[10px]">Shift + Enter</kbd> for a new line</span>
              <span>AI can make mistakes. Verify critical facts.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .custom-sidebar-scrollbar::-webkit-scrollbar {
        width: 4px;
      }
      .custom-sidebar-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      .custom-sidebar-scrollbar::-webkit-scrollbar-thumb {
        background: #27272a;
        border-radius: 4px;
      }
      .custom-sidebar-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #3f3f46;
      }
    `,
  ],
})
export class ChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  // Injected services
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private modal = inject(ModalDialogService);
  chatState = inject(ChatStateService);
  chatDraftService = inject(ChatDraftService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private pdfReportService = inject(PdfReportService);
  private readonly collectionsWalkthrough = inject(CollectionsWalkthroughService);
  voiceService = inject(VoiceRecognitionService);
  private voiceSub?: Subscription;
  private voiceErrorSub?: Subscription;

  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('inputArea') inputArea?: ElementRef<HTMLTextAreaElement>;

  conversations: IConversation[] = [];
  filteredConversations: IConversation[] = [];
  activeConversation: IConversation | null = null;
  searchQuery = '';
  localError = '';
  private searchDebounceTimer?: any;
  private draftDebounceTimer?: any;

  inputText = '';
  private shouldScroll = false;
  generatingPhaseIndex = 0;
  private generatingInterval: any = null;

  triggerDraftAutosave(): void {
    if (this.draftDebounceTimer) {
      clearTimeout(this.draftDebounceTimer);
    }
    this.draftDebounceTimer = setTimeout(() => {
      this.persistActiveDraft();
    }, 300);
  }

  private persistActiveDraft(): void {
    const convId = this.activeConversation?.id || TEMPORARY_NEW_CHAT_ID;
    this.chatDraftService.saveDraft(convId, this.inputText, this.attachedResources);
  }

  private restoreDraftForConversation(convId?: string): void {
    const targetId = convId || this.activeConversation?.id || TEMPORARY_NEW_CHAT_ID;
    const draft = this.chatDraftService.getDraft(targetId);
    this.inputText = draft?.text || '';
    this.attachedResources = draft?.attachedResources ? [...draft.attachedResources] : [];
    this.adjustTextareaHeight();
  }

  get isCurrentGenerating(): boolean {
    const isGen = this.chatState.isGenerating(this.activeConversation?.id);
    if (isGen && !this.generatingInterval) {
      this.startGeneratingTimer();
    } else if (!isGen && this.generatingInterval) {
      this.stopGeneratingTimer();
    }
    return isGen;
  }

  get currentGeneratingStatus(): string {
    const msgs = this.messages;
    const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user');
    const prompt = (lastUserMsg?.content || '').toLowerCase();
    const hasAttachments = lastUserMsg?.referencedResourceIds && lastUserMsg.referencedResourceIds.length > 0;

    // 1. Graph / Chart / Visualization Tasks
    if (
      prompt.includes('graph') ||
      prompt.includes('chart') ||
      prompt.includes('plot') ||
      prompt.includes('visualize') ||
      prompt.includes('visualization') ||
      prompt.includes('bar') ||
      prompt.includes('pie') ||
      prompt.includes('line') ||
      prompt.includes('histogram') ||
      prompt.includes('trend')
    ) {
      const phases = [
        'Querying dataset & preparing visual schema...',
        'Generating interactive chart components...',
        'Rendering visualization & synthesizing findings...',
      ];
      return phases[this.generatingPhaseIndex % phases.length];
    }

    // 2. Python / Calculation / Numerical Analytics Tasks
    if (
      prompt.includes('calculate') ||
      prompt.includes('math') ||
      prompt.includes('analytics') ||
      prompt.includes('compute') ||
      prompt.includes('sum') ||
      prompt.includes('average') ||
      prompt.includes('mean') ||
      prompt.includes('pipeline') ||
      prompt.includes('revenue') ||
      prompt.includes('sales') ||
      prompt.includes('numbers') ||
      prompt.includes('metrics') ||
      prompt.includes('statistic')
    ) {
      const phases = [
        'Inspecting dataset & executing analytical model...',
        'Running sandboxed Python calculation script...',
        'Synthesizing computational results & insights...',
      ];
      return phases[this.generatingPhaseIndex % phases.length];
    }

    // 3. Comparison / Cross-File Tasks
    if (
      prompt.includes('compare') ||
      prompt.includes('difference') ||
      prompt.includes('versus') ||
      prompt.includes('vs') ||
      prompt.includes('correlation')
    ) {
      const phases = [
        'Reading referenced documents & datasets...',
        'Analyzing cross-file correlations & differences...',
        'Compiling comparison matrix & summary...',
      ];
      return phases[this.generatingPhaseIndex % phases.length];
    }

    // 4. Summarization / Policy / Document Search Tasks
    if (
      prompt.includes('summar') ||
      prompt.includes('explain') ||
      prompt.includes('policy') ||
      prompt.includes('guideline') ||
      prompt.includes('search') ||
      prompt.includes('find') ||
      prompt.includes('review') ||
      prompt.includes('extract')
    ) {
      const phases = [
        'Searching workspace knowledge base & vector index...',
        'Retrieving grounded context & analyzing sections...',
        'Synthesizing comprehensive response...',
      ];
      return phases[this.generatingPhaseIndex % phases.length];
    }

    // 5. Scoped Resource Mentions
    if (hasAttachments) {
      const phases = [
        'Accessing scoped workspace resources...',
        'Interrogating file contents & vector embeddings...',
        'Synthesizing grounded answer...',
      ];
      return phases[this.generatingPhaseIndex % phases.length];
    }

    // 6. Default Dynamic Workspace Reasoning
    const defaultPhases = [
      'Analyzing request & interrogating workspace context...',
      'Retrieving grounded enterprise knowledge...',
      'Synthesizing intelligent response...',
    ];
    return defaultPhases[this.generatingPhaseIndex % defaultPhases.length];
  }

  private startGeneratingTimer(): void {
    this.generatingPhaseIndex = 0;
    if (this.generatingInterval) {
      clearInterval(this.generatingInterval);
    }
    this.generatingInterval = setInterval(() => {
      this.generatingPhaseIndex++;
    }, 2200);
  }

  private stopGeneratingTimer(): void {
    if (this.generatingInterval) {
      clearInterval(this.generatingInterval);
      this.generatingInterval = null;
    }
    this.generatingPhaseIndex = 0;
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    this.persistActiveDraft();
  }

  ngOnDestroy(): void {
    if (this.draftDebounceTimer) {
      clearTimeout(this.draftDebounceTimer);
    }
    this.persistActiveDraft();
    this.stopGeneratingTimer();
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    if (this.voiceService.isListening) {
      this.voiceService.stopListening();
    }
    this.voiceSub?.unsubscribe();
    this.voiceErrorSub?.unsubscribe();
  }

  private voiceBaseText = '';

  toggleVoiceInput(): void {
    if (!this.voiceService.isListening) {
      this.voiceBaseText = this.inputText.trimEnd();
    }
    this.voiceService.toggleListening();
  }

  get isMaxGenerationsReached(): boolean {
    return this.chatState.activeGenerationsCount() >= 2 && !this.isCurrentGenerating;
  }

  get activeError(): string {
    return this.chatState.getError(this.activeConversation?.id) || this.localError;
  }

  get messages(): IMessage[] {
    if (!this.activeConversation) return [];
    return this.chatState.getCachedMessages(this.activeConversation.id) || [];
  }

  dismissError(): void {
    if (this.activeConversation) {
      this.chatState.clearError(this.activeConversation.id);
    }
    this.localError = '';
  }

  // Conversations Drawer resizing
  convWidth = 280;
  isConvCollapsed = false;
  private isResizingConv = false;
  private startX = 0;
  private startWidth = 280;

  // Mention system state
  isMentionOpen = false;
  mentionOptions: IMentionOption[] = [];
  attachedResources: IMentionOption[] = [];
  dynamicStarters: IDynamicStarterCard[] = [];
  resourceNameMap = new Map<string, string>();

  // Collections state & per-user persistence
  collections: ICollection[] = [];
  isCollectionsGroupExpanded = true;
  expandedCollectionIds = new Set<string>();
  draggedConversation: IConversation | null = null;
  dragOverCollectionId: string | null = null;
  undoToast: { message: string; conversationId: string; previousCollectionId: string | null; timer: any } | null = null;

  getResourceDisplayName(rId: string): string {
    if (this.resourceNameMap.has(rId)) {
      return this.resourceNameMap.get(rId)!;
    }
    if (rId.startsWith('folder:')) {
      return rId.replace(/^folder:/, '');
    }
    return rId;
  }

  loadDynamicStarters(): void {
    forkJoin({
      docs: this.api.getDocuments().pipe(catchError(() => of([]))),
      datasets: this.api.getDatasets().pipe(catchError(() => of([]))),
    }).subscribe(({ docs, datasets }) => {
      // Build resource name lookup map
      docs.forEach((d) => this.resourceNameMap.set(d.id, d.originalName));
      datasets.forEach((ds) => this.resourceNameMap.set(ds.id, ds.originalName));
      const permittedDocs = docs.filter((d) => d.hasAccess !== false && d.status === 'ready');
      const permittedDatasets = datasets.filter((d) => d.hasAccess !== false && d.status === 'ready');

      const starters: IDynamicStarterCard[] = [];

      // 1. Dynamic Dataset Starter from REAL accessible datasets in DB
      if (permittedDatasets.length > 0) {
        const ds = permittedDatasets[0];
        const cleanName = ds.originalName.replace(/\.[^/.]+$/, '').trim();
        starters.push({
          icon: '📊',
          title: `Analyze ${cleanName}`,
          subtitle: ds.totalRows ? `${ds.totalRows.toLocaleString()} rows • ${ds.fileType?.toUpperCase()}` : `Dataset analysis (${ds.fileType?.toUpperCase()})`,
          promptText: `Please analyze key trends, summary statistics, and notable patterns in this dataset.`,
          resource: {
            id: ds.id,
            name: ds.originalName,
            type: MentionResourceType.DATASET,
            fileType: ds.fileType,
            status: ds.status,
          },
        });
      }

      // 2. Dynamic Document Starter from REAL accessible documents in DB
      if (permittedDocs.length > 0) {
        const doc = permittedDocs[0];
        const cleanName = doc.originalName.replace(/\.[^/.]+$/, '').replace(/^[0-9]+[_-]/, '').trim();
        starters.push({
          icon: '📄',
          title: `Summarize ${cleanName}`,
          subtitle: doc.chunkCount ? `${doc.chunkCount} indexed sections • ${doc.fileType?.toUpperCase()}` : `Document summary (${doc.fileType?.toUpperCase()})`,
          promptText: `Please summarize this document and highlight the key findings, policies, and actionable takeaways.`,
          resource: {
            id: doc.id,
            name: doc.originalName,
            type: MentionResourceType.DOCUMENT,
            fileType: doc.fileType,
            status: doc.status,
          },
        });
      }

      // 3. Dynamic Multi-file or Folder synthesis from secondary doc/dataset
      if (permittedDocs.length > 1) {
        const doc2 = permittedDocs[1];
        const cleanName2 = doc2.originalName.replace(/\.[^/.]+$/, '').replace(/^[0-9]+[_-]/, '').trim();
        starters.push({
          icon: '🔍',
          title: `Review ${cleanName2}`,
          subtitle: `Extract guidelines • ${doc2.fileType?.toUpperCase()}`,
          promptText: `What are the primary guidelines, requirements, or key data points outlined in this document?`,
          resource: {
            id: doc2.id,
            name: doc2.originalName,
            type: MentionResourceType.DOCUMENT,
            fileType: doc2.fileType,
            status: doc2.status,
          },
        });
      } else if (permittedDatasets.length > 1) {
        const ds2 = permittedDatasets[1];
        const cleanName2 = ds2.originalName.replace(/\.[^/.]+$/, '').trim();
        starters.push({
          icon: '📈',
          title: `Explore ${cleanName2}`,
          subtitle: `${ds2.totalRows || 0} rows • ${ds2.fileType?.toUpperCase()}`,
          promptText: `Please calculate key metrics and anomalies across this dataset.`,
          resource: {
            id: ds2.id,
            name: ds2.originalName,
            type: MentionResourceType.DATASET,
            fileType: ds2.fileType,
            status: ds2.status,
          },
        });
      } else {
        starters.push({
          icon: '💡',
          title: 'Synthesize Workspace Knowledge',
          subtitle: 'Search & compare across documents',
          promptText: 'Analyze our uploaded enterprise documents and synthesize key insights and policies.',
        });
      }

      this.dynamicStarters = starters.slice(0, 3);
    });
  }

  ngOnInit(): void {
    const savedConvWidth = localStorage.getItem('syntra_chat_conv_sidebar_width');
    if (savedConvWidth) {
      this.convWidth = Math.max(260, Math.min(480, parseInt(savedConvWidth, 10)));
    }
    const savedConvCollapsed = localStorage.getItem('syntra_chat_conv_sidebar_collapsed');
    if (savedConvCollapsed) {
      this.isConvCollapsed = savedConvCollapsed === 'true';
    }

    this.loadCollections();
    this.loadConversations();
    this.loadDynamicStarters();

    // Voice recognition subscriptions
    this.voiceSub = this.voiceService.transcript$.subscribe((res) => {
      if (res.transcript) {
        this.inputText = this.voiceBaseText ? `${this.voiceBaseText} ${res.transcript}` : res.transcript;
        this.adjustTextareaHeight();
        this.triggerDraftAutosave();
      }
    });

    this.voiceErrorSub = this.voiceService.error$.subscribe((err) => {
      if (err) {
        this.localError = err;
      }
    });

    // Check and trigger collections walkthrough if first time viewing collections
    setTimeout(() => {
      this.collectionsWalkthrough.checkAndTrigger();
    }, 600);
  }

  // ---------------- Collection Collapse State Persistence ----------------
  private getCollectionStateStorageKey(): string {
    const userId = this.authService.currentUser()?.id || 'default_user';
    return `syntra_chat_${userId}_collection_state`;
  }

  private loadPersistedCollectionState(): { groupExpanded: boolean; expandedIds: string[] } {
    try {
      const raw = localStorage.getItem(this.getCollectionStateStorageKey());
      if (!raw) return { groupExpanded: true, expandedIds: [] };
      const parsed = JSON.parse(raw);
      return {
        groupExpanded: typeof parsed.groupExpanded === 'boolean' ? parsed.groupExpanded : true,
        expandedIds: Array.isArray(parsed.expandedIds) ? parsed.expandedIds : [],
      };
    } catch {
      return { groupExpanded: true, expandedIds: [] };
    }
  }

  private savePersistedCollectionState(): void {
    try {
      const payload = {
        groupExpanded: this.isCollectionsGroupExpanded,
        expandedIds: Array.from(this.expandedCollectionIds),
      };
      localStorage.setItem(this.getCollectionStateStorageKey(), JSON.stringify(payload));
    } catch {}
  }

  loadCollections(): void {
    this.api.getCollections().subscribe({
      next: (cols) => {
        this.collections = cols;
        const persisted = this.loadPersistedCollectionState();
        this.isCollectionsGroupExpanded = persisted.groupExpanded;

        // Restore persisted collection states, or if fresh/no persisted state:
        // if user has > 2 collections, default to collapsed; otherwise expand
        const colIdsInDb = new Set(cols.map((c) => c.id));
        this.expandedCollectionIds = new Set();

        const hasPersistedExpanded = persisted.expandedIds.some((id) => colIdsInDb.has(id));
        if (hasPersistedExpanded || localStorage.getItem(this.getCollectionStateStorageKey())) {
          persisted.expandedIds.forEach((id) => {
            if (colIdsInDb.has(id)) {
              this.expandedCollectionIds.add(id);
            }
          });
        } else {
          // Default for fresh user: expand if <= 2 collections, collapse if > 2
          if (cols.length <= 2) {
            cols.forEach((c) => this.expandedCollectionIds.add(c.id));
          }
        }
        this.savePersistedCollectionState();
      },
      error: () => {
        this.collections = [];
      },
    });
  }

  isCollectionExpanded(colId: string): boolean {
    return this.expandedCollectionIds.has(colId);
  }

  toggleCollectionExpand(colId: string): void {
    if (this.expandedCollectionIds.has(colId)) {
      this.expandedCollectionIds.delete(colId);
    } else {
      this.expandedCollectionIds.add(colId);
    }
    this.savePersistedCollectionState();
  }

  toggleAllCollectionsSectionCollapse(): void {
    this.isCollectionsGroupExpanded = !this.isCollectionsGroupExpanded;
    this.savePersistedCollectionState();
  }

  get areAllCollectionsCollapsed(): boolean {
    if (this.collections.length === 0) return true;
    return !this.collections.some((c) => this.expandedCollectionIds.has(c.id));
  }

  toggleCollapseAllCollections(): void {
    if (this.areAllCollectionsCollapsed) {
      // Expand all
      this.collections.forEach((c) => this.expandedCollectionIds.add(c.id));
    } else {
      // Collapse all
      this.expandedCollectionIds.clear();
    }
    this.savePersistedCollectionState();
  }

  getConversationsForCollection(colId: string): IConversation[] {
    const pool = this.searchQuery ? this.filteredConversations : this.conversations;
    return pool.filter((c) => c.collectionId === colId);
  }

  getRecentUncollectedChats(): IConversation[] {
    const pool = this.searchQuery ? this.filteredConversations : this.conversations;
    return pool.filter((c) => !c.collectionId);
  }

  async openCreateCollectionModal(): Promise<void> {
    const name = await this.modal.prompt(
      'Enter a descriptive name for your new collection:',
      'New Collection',
      '',
      'e.g. Q1 Audits, Project Athena...'
    );
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    this.api.createCollection({ name: trimmed }).subscribe({
      next: (newCol) => {
        this.collections.unshift(newCol);
        this.expandedCollectionIds.add(newCol.id);
        this.isCollectionsGroupExpanded = true;
        this.savePersistedCollectionState();
      },
      error: (err) => {
        this.modal.alert(err.error?.message || 'Failed to create collection', 'Error');
      },
    });
  }

  async openRenameCollectionModal(col: ICollection, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const newName = await this.modal.prompt(
      'Enter new name for this collection:',
      'Rename Collection',
      col.name,
      'Collection name...'
    );
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === col.name) return;

    this.api.renameCollection(col.id, { name: trimmed }).subscribe({
      next: (updated) => {
        const idx = this.collections.findIndex((c) => c.id === col.id);
        if (idx !== -1) {
          this.collections[idx] = updated;
        }
      },
      error: (err) => {
        this.modal.alert(err.error?.message || 'Failed to rename collection', 'Error');
      },
    });
  }

  async deleteCollection(colId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const confirmed = await this.modal.confirm(
      'Delete this collection? Its conversations will be kept and returned to Recent Chats.',
      'Delete Collection',
      'Delete Collection'
    );
    if (!confirmed) {
      return;
    }

    this.api.deleteCollection(colId).subscribe({
      next: () => {
        this.collections = this.collections.filter((c) => c.id !== colId);
        this.expandedCollectionIds.delete(colId);
        this.savePersistedCollectionState();
        // Unlink in local state
        this.conversations.forEach((c) => {
          if (c.collectionId === colId) {
            c.collectionId = null;
          }
        });
      },
      error: (err) => {
        this.modal.alert(err.error?.message || 'Failed to delete collection', 'Error');
      },
    });
  }

  // ---------------- Drag and Drop Handlers ----------------
  onDragStartChat(conv: IConversation, event: DragEvent): void {
    this.draggedConversation = conv;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', conv.id);
    }
  }

  onDragEndChat(): void {
    this.draggedConversation = null;
    this.dragOverCollectionId = null;
  }

  onDragOverCollection(colId: string, event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverCollectionId = colId;
  }

  onDragLeaveCollection(colId: string, event: DragEvent): void {
    if (this.dragOverCollectionId === colId) {
      this.dragOverCollectionId = null;
    }
  }

  onDropOnCollection(colId: string, event: DragEvent): void {
    event.preventDefault();
    this.dragOverCollectionId = null;
    if (!this.draggedConversation) return;

    const conv = this.draggedConversation;
    const prevCollectionId = conv.collectionId || null;

    if (prevCollectionId === colId) return;

    const targetCol = this.collections.find((c) => c.id === colId);
    const colName = targetCol ? targetCol.name : 'Collection';

    // Optimistically update
    conv.collectionId = colId;

    this.api.moveConversationToCollection(conv.id, colId).subscribe({
      next: () => {
        this.showUndoToast(`Moved "${conv.title}" to ${colName}`, conv.id, prevCollectionId);
      },
      error: (err) => {
        conv.collectionId = prevCollectionId;
        alert(err.error?.message || 'Failed to move chat');
      },
    });

    this.draggedConversation = null;
  }

  unassignFromCollection(conv: IConversation, event: MouseEvent): void {
    event.stopPropagation();
    const prevCollectionId = conv.collectionId || null;
    conv.collectionId = null;

    this.api.moveConversationToCollection(conv.id, null).subscribe({
      next: () => {
        this.showUndoToast(`Moved "${conv.title}" to Recent Chats`, conv.id, prevCollectionId);
      },
      error: (err) => {
        conv.collectionId = prevCollectionId;
        alert(err.error?.message || 'Failed to move chat');
      },
    });
  }

  showUndoToast(message: string, conversationId: string, previousCollectionId: string | null): void {
    if (this.undoToast?.timer) {
      clearTimeout(this.undoToast.timer);
    }
    const timer = setTimeout(() => {
      this.undoToast = null;
    }, 5000);

    this.undoToast = {
      message,
      conversationId,
      previousCollectionId,
      timer,
    };
  }

  performUndo(): void {
    if (!this.undoToast) return;
    const { conversationId, previousCollectionId } = this.undoToast;
    clearTimeout(this.undoToast.timer);
    this.undoToast = null;

    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv) {
      conv.collectionId = previousCollectionId;
      this.api.moveConversationToCollection(conversationId, previousCollectionId).subscribe();
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  toggleConvCollapse(): void {
    this.isConvCollapsed = !this.isConvCollapsed;
    localStorage.setItem('syntra_chat_conv_sidebar_collapsed', String(this.isConvCollapsed));
  }

  startResizeConv(event: MouseEvent): void {
    event.preventDefault();
    this.isResizingConv = true;
    this.startX = event.clientX;
    this.startWidth = this.convWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isResizingConv) return;
    const delta = event.clientX - this.startX;
    const newWidth = Math.max(240, Math.min(480, this.startWidth + delta));
    this.convWidth = newWidth;
  }

  @HostListener('window:mouseup')
  onMouseUp(): void {
    if (this.isResizingConv) {
      this.isResizingConv = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('syntra_chat_conv_sidebar_width', String(this.convWidth));
    }
  }

  loadConversations(): void {
    this.api.getConversations().subscribe((convs) => {
      this.conversations = convs;
      if (!this.searchQuery) {
        this.filteredConversations = convs;
      }
      const routeId = this.route.snapshot.paramMap.get('id');
      if (routeId) {
        const found = convs.find((c) => c.id === routeId);
        if (found) {
          this.selectConversation(found);
        } else {
          this.restoreDraftForConversation(routeId);
        }
      } else if (convs.length > 0 && !this.activeConversation) {
        this.selectConversation(convs[0]);
      } else if (!this.activeConversation) {
        this.restoreDraftForConversation(TEMPORARY_NEW_CHAT_ID);
      }
    });
  }

  onSearchInput(event: Event): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    const query = this.searchQuery.trim();
    if (!query) {
      this.filteredConversations = this.conversations;
      return;
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.api.searchConversations(query).subscribe({
        next: (results) => {
          this.filteredConversations = results;
        },
        error: () => {
          // Strict title-only client-side fallback
          this.filteredConversations = this.conversations.filter((c) =>
            c.title.toLowerCase().includes(query.toLowerCase())
          );
        },
      });
    }, 200);
  }

  clearSearch(): void {
    this.searchQuery = '';
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.filteredConversations = this.conversations;
  }

  selectConversation(conv: IConversation): void {
    if (this.activeConversation && this.activeConversation.id !== conv.id) {
      this.persistActiveDraft();
    }

    this.activeConversation = conv;
    this.dismissError();

    // Immediately restore draft for target chat
    this.restoreDraftForConversation(conv.id);

    // Check if messages already in chatState cache
    if (!this.chatState.getCachedMessages(conv.id)) {
      this.api.getMessages(conv.id).subscribe((msgs) => {
        this.chatState.setMessages(conv.id, msgs);
        if (this.activeConversation?.id === conv.id) {
          this.shouldScroll = true;
        }
      });
    } else {
      this.shouldScroll = true;
    }
  }

  createNewConversation(collectionId?: string | null): void {
    this.persistActiveDraft();

    this.api.createConversation({ title: 'New Conversation', collectionId: collectionId || undefined }).subscribe((newConv) => {
      this.conversations.unshift(newConv);
      if (collectionId) {
        this.expandedCollectionIds.add(collectionId);
      }
      this.clearSearch();
      this.selectConversation(newConv);
    });
  }

  async deleteConversation(id: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const confirmed = await this.modal.confirmDanger(
      'Are you sure you want to permanently delete this chat and its history?',
      'Delete Chat',
      'Delete Chat'
    );
    if (!confirmed) return;

    this.api.deleteConversation(id).subscribe(() => {
      this.chatDraftService.clearDraft(id);
      this.chatState.deleteConversationState(id);
      this.conversations = this.conversations.filter((c) => c.id !== id);
      this.filteredConversations = this.filteredConversations.filter((c) => c.id !== id);
      if (this.activeConversation?.id === id) {
        this.activeConversation = this.conversations[0] || null;
        if (this.activeConversation) {
          this.selectConversation(this.activeConversation);
        } else {
          this.restoreDraftForConversation(TEMPORARY_NEW_CHAT_ID);
        }
      }
    });
  }

  sendQuickPrompt(promptText: string, resource?: IMentionOption): void {
    if (resource && !this.attachedResources.some((r) => r.id === resource.id)) {
      this.attachedResources.push(resource);
    }
    this.inputText = promptText;
    this.sendUserMessage();
  }

  copyMessageText(content: string): void {
    navigator.clipboard.writeText(content);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (!this.isMentionOpen) {
        event.preventDefault();
        this.sendUserMessage();
      }
    }
  }

  triggerMentionMenu(): void {
    this.isMentionOpen = true;
    this.api.searchMentions('').subscribe((res) => {
      this.mentionOptions = res.results || [];
    });
  }

  onInputChange(event: Event): void {
    this.adjustTextareaHeight();
    this.triggerDraftAutosave();

    const target = event.target as HTMLTextAreaElement;
    const val = target.value;
    const cursorPos = target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');

    if (lastAtIdx !== -1 && !textBeforeCursor.slice(lastAtIdx).includes(' ')) {
      const query = textBeforeCursor.slice(lastAtIdx + 1);
      this.isMentionOpen = true;
      this.api.searchMentions(query).subscribe((res) => {
        this.mentionOptions = res.results || [];
      });
    } else {
      this.isMentionOpen = false;
    }
  }

  onMentionSelected(option: IMentionOption): void {
    if (!this.attachedResources.some((r) => r.id === option.id)) {
      this.attachedResources.push(option);
    }
    const val = this.inputText;
    const cursorPos = this.inputArea?.nativeElement?.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const textAfter = val.slice(cursorPos);
    
    // Find last @ before cursor or in the full text
    let atIdx = textBefore.lastIndexOf('@');
    if (atIdx === -1) {
      atIdx = val.lastIndexOf('@');
    }

    if (atIdx !== -1) {
      // Find where the token after @ ends (e.g. '@arch ' or end of string)
      const afterAt = val.slice(atIdx);
      const spaceIdx = afterAt.indexOf(' ');
      const tokenLen = spaceIdx === -1 ? afterAt.length : spaceIdx;
      const cleanBefore = val.slice(0, atIdx).trimEnd();
      const cleanAfter = val.slice(atIdx + tokenLen).trimStart();
      this.inputText = cleanBefore && cleanAfter ? `${cleanBefore} ${cleanAfter}` : `${cleanBefore}${cleanAfter}`;
    }
    this.isMentionOpen = false;
    this.triggerDraftAutosave();
    setTimeout(() => {
      this.focusInput();
      if (this.inputArea?.nativeElement) {
        const newPos = atIdx !== -1 ? atIdx : this.inputText.length;
        this.inputArea.nativeElement.setSelectionRange(newPos, newPos);
      }
    }, 50);
  }

  removeAttachedResource(id: string): void {
    this.attachedResources = this.attachedResources.filter((r) => r.id !== id);
    this.triggerDraftAutosave();
  }

  sendUserMessage(): void {
    if ((!this.inputText.trim() && this.attachedResources.length === 0) || this.isCurrentGenerating) return;

    if (this.isMaxGenerationsReached) {
      this.localError = 'You can have up to 2 active chat generations at once. Please wait for one of your ongoing chats to finish.';
      return;
    }

    if (!this.activeConversation) {
      this.api.createConversation({ title: this.inputText.slice(0, 30) || 'New Chat' }).subscribe({
        next: (newConv) => {
          this.chatDraftService.migrateDraft(TEMPORARY_NEW_CHAT_ID, newConv.id);
          this.conversations.unshift(newConv);
          this.clearSearch();
          this.activeConversation = newConv;
          this.executeSendMessage();
        },
        error: () => {
          this.localError = 'Failed to create new conversation. Please check your connection.';
        },
      });
    } else {
      this.executeSendMessage();
    }
  }

  private executeSendMessage(): void {
    if (!this.activeConversation) return;

    const convId = this.activeConversation.id;
    const content = this.inputText.trim();
    const resourceIds = this.attachedResources.map((r) => r.id);
    const sentAttachedResources = [...this.attachedResources];

    // Clear draft from storage and reset UI
    this.inputText = '';
    this.attachedResources = [];
    this.chatDraftService.clearDraft(convId);
    this.dismissError();
    this.shouldScroll = true;

    if (this.inputArea?.nativeElement) {
      this.inputArea.nativeElement.style.height = 'auto';
    }

    this.chatState
      .sendMessageStream(convId, content, resourceIds, (updatedConv) => {
        const convIdx = this.conversations.findIndex((c) => c.id === updatedConv.id);
        if (convIdx !== -1) {
          this.conversations[convIdx] = updatedConv;
        }
        const filteredIdx = this.filteredConversations.findIndex((c) => c.id === updatedConv.id);
        if (filteredIdx !== -1) {
          this.filteredConversations[filteredIdx] = updatedConv;
        }
        if (this.activeConversation?.id === updatedConv.id) {
          this.activeConversation = updatedConv;
        }
      })
      .then(() => {
        if (this.activeConversation?.id === convId) {
          this.shouldScroll = true;
        }
      })
      .catch((err) => {
        // If message sending failed, restore draft so unsent input is preserved
        this.chatDraftService.saveDraft(convId, content, sentAttachedResources);
        if (this.activeConversation?.id === convId && !this.inputText) {
          this.inputText = content;
          this.attachedResources = sentAttachedResources;
          this.adjustTextareaHeight();
        }
        if (this.activeConversation?.id === convId) {
          this.shouldScroll = true;
        }
      });
  }

  private scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch {}
  }

  exportConversationPdf(): void {
    if (!this.messages.length) return;
    this.pdfReportService.exportFullConversation(
      this.messages,
      this.activeConversation?.title || 'Syntra Chat Conversation'
    );
  }

  onSelectionAction(event: ISelectionActionEvent): void {
    const text = event.selectedText.trim();
    if (!text) return;

    if (event.action === 'ask') {
      this.inputText = `> "${text}"\n\n`;
      this.focusInput();
    } else if (event.action === 'explain') {
      this.inputText = `Please explain this in detail:\n> "${text}"`;
      this.focusInput();
    } else if (event.action === 'summarize') {
      this.inputText = `Please summarize the key takeaways of this:\n> "${text}"`;
      this.focusInput();
    }
  }

  private adjustTextareaHeight(): void {
    if (!this.inputArea?.nativeElement) return;
    const el = this.inputArea.nativeElement;
    el.style.height = 'auto';
    const computedHeight = Math.min(Math.max(el.scrollHeight, 38), 240);
    el.style.height = `${computedHeight}px`;
  }

  private focusInput(): void {
    setTimeout(() => {
      if (this.inputArea?.nativeElement) {
        const el = this.inputArea.nativeElement;
        el.focus();
        el.selectionStart = el.selectionEnd = this.inputText.length;
        this.adjustTextareaHeight();
        // Scroll prompt container smoothly into view
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 30);
  }

  exportMessagePdf(msg: IMessage, event: MouseEvent): void {
    event.stopPropagation();
    this.pdfReportService.exportMessageReport(
      msg,
      this.activeConversation?.title || 'Syntra Chat Executive Summary'
    );
  }

  highlightCode(code: string | undefined | null, lang: string = 'python'): string {
    if (!code) return '';
    try {
      const language = lang && hljs.getLanguage(lang) ? lang : 'python';
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch {
      return code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  }

  @HostListener('click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const copyBtn = target.closest('.copy-code-btn') as HTMLButtonElement | null;
    if (!copyBtn) return;

    const container = copyBtn.closest('.code-block-container');
    if (!container) return;

    event.preventDefault();
    event.stopPropagation();

    const codeEl = container.querySelector('pre code');
    const textToCopy = codeEl ? (codeEl.textContent || '') : '';

    if (textToCopy) {
      this.copyDirectText(textToCopy, event, copyBtn);
    }
  }

  copyDirectText(text: string | undefined | null, event?: Event, directBtn?: HTMLButtonElement): void {
    if (!text) return;
    const btn =
      directBtn ||
      (event?.currentTarget as HTMLButtonElement) ||
      ((event?.target as HTMLElement)?.closest('.copy-code-btn') as HTMLButtonElement);

    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (btn) {
          const copyTextEl = btn.querySelector('.copy-text');
          const originalText = copyTextEl ? copyTextEl.textContent : 'Copy';

          if (copyTextEl) copyTextEl.textContent = 'Copied!';
          btn.classList.add('text-white', 'bg-zinc-800');
          btn.classList.remove('text-zinc-400');

          setTimeout(() => {
            if (copyTextEl) copyTextEl.textContent = originalText;
            btn.classList.remove('text-white', 'bg-zinc-800');
            btn.classList.add('text-zinc-400');
          }, 2000);
        }
      })
      .catch((err) => {
        console.error('Failed to copy text:', err);
      });
  }
}
