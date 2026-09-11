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
  IDownloadableFile,
  IChartSpec,
  IChartSeries,
  ChartType,
  ISharedConversationItem,
  IConversationShare,
  IMessageShare,
  IOrgMember,
  SharePermission,
  INotification,
  NotificationType,
  IDirectConversationItem,
  IReplyToPreview,
} from '@enter-chat/shared-types';
import { WalkthroughService } from '../../core/services/walkthrough.service';
import { VoiceRecognitionService } from '../../core/services/voice-recognition.service';
import { PresenceService } from '../../core/services/presence.service';
import { NotificationService } from '../../core/services/notification.service';
import { SharingService } from '../../core/services/sharing.service';
import { SoundService } from '../../core/services/sound.service';
import { TableViewerComponent } from '../../shared/components/table-viewer/table-viewer.component';
import { ChartViewerComponent } from '../../shared/components/chart-viewer/chart-viewer.component';
import { MentionAutocompleteComponent } from './mention-autocomplete/mention-autocomplete.component';
import { TextSelectionToolbarComponent, ISelectionActionEvent } from '../../shared/components/text-selection-toolbar/text-selection-toolbar.component';
import { PdfReportService } from '../../core/services/pdf-report.service';
import { CitationBadgeComponent } from '../../shared/components/citation-badge/citation-badge.component';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { ChatDraftService, TEMPORARY_NEW_CHAT_ID } from '../../core/services/chat-draft.service';
import { ShareConversationModalComponent } from '../../shared/components/share-conversation-modal/share-conversation-modal.component';
import { ShareMessageModalComponent } from '../../shared/components/share-message-modal/share-message-modal.component';
import { SharedMessageViewerModalComponent } from '../../shared/components/shared-message-viewer-modal/shared-message-viewer-modal.component';
import { UserProfilePopoverComponent } from '../../shared/components/user-profile-popover/user-profile-popover.component';
import { OrgDirectoryModalComponent } from '../../shared/components/org-directory-modal/org-directory-modal.component';
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
    ShareConversationModalComponent,
    ShareMessageModalComponent,
    SharedMessageViewerModalComponent,
    UserProfilePopoverComponent,
    OrgDirectoryModalComponent,
  ],
  template: `
    <div class="flex h-full bg-[#f7f8fa] dark:bg-[#09090b] overflow-hidden select-text relative">
      <!-- Floating Selection Contextual Toolbar -->
      <app-text-selection-toolbar
        [targetContainer]="scrollContainer"
        (actionTriggered)="onSelectionAction($event)"
      ></app-text-selection-toolbar>

      <!-- Left Conversations Drawer (Resizable on Desktop, Modal Drawer on Mobile) -->
      @if (!isConvCollapsed) {
        <!-- Mobile Drawer Backdrop -->
        <div
          (click)="toggleConvCollapse()"
          class="md:hidden fixed inset-0 z-40 bg-black/80 backdrop-blur-sm animate-fade-in"
          aria-hidden="true"
        ></div>

        <div
          [style.width.px]="convWidth"
          class="fixed md:relative inset-y-0 left-0 z-50 md:z-auto w-72 max-w-[85vw] md:max-w-none border-r border-[#dcdde1] dark:border-[#27272a] bg-white dark:bg-[#0d0d10] flex flex-col justify-between p-3 flex-shrink-0 select-none transition-[width] duration-75 shadow-2xl md:shadow-none"
        >
          <!-- Fixed Top Header & Search Area (Pinned) -->
          <div class="flex-shrink-0 space-y-2 pb-2 border-b border-[#dcdde1] dark:border-[#27272a]/60">
            <!-- Header -->
            <div class="flex items-center justify-between gap-2">
              @if (isArchivedView) {
                <a
                  routerLink="/chat"
                  class="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 font-medium text-xs transition-colors shadow-xs cursor-pointer"
                  title="Back to Active Chats"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span>Back to Chats</span>
                </a>
              } @else {
                <button
                  (click)="createNewConversation()"
                  class="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 font-medium text-xs transition-colors shadow-sm cursor-pointer active:scale-98"
                  title="Start a new chat"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>New Chat</span>
                </button>
              }

              <button
                (click)="toggleConvCollapse()"
                class="p-2 rounded-xl text-zinc-500 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors flex-shrink-0 cursor-pointer"
                title="Collapse sidebar"
              >
                <svg class="w-4 h-4" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>

            <!-- Search Input (Strict title search) -->
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
                <svg class="w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                [(ngModel)]="searchQuery"
                (input)="onSearchInput($event)"
                [placeholder]="isArchivedView ? 'Search archived chats...' : 'Search chats by name...'"
                class="w-full pl-8 pr-7 py-1.5 bg-[#f8f9fa] dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] focus:border-zinc-900 dark:focus:border-white focus:outline-none rounded-xl text-zinc-900 dark:text-white text-xs placeholder-zinc-400 dark:placeholder-zinc-500 transition-colors"
              />
              @if (searchQuery) {
                <button
                  (click)="clearSearch()"
                  class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-white"
                  title="Clear search"
                >
                  <svg class="w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              }
            </div>
          </div>

          <!-- ONE Continuous Scrollable Region: Collections + Pinned + Recent + Archived Chats -->
          <div
            #convScrollContainer
            (scroll)="closeActionMenus()"
            (dragover)="onDragOverScrollContainer($event)"
            class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 pt-2 space-y-4 pr-0.5 custom-sidebar-scrollbar"
          >
            @if (isArchivedView) {
              <!-- Dedicated Archived Chats List -->
              <div class="space-y-1">
                <div class="flex items-center justify-between px-2 py-1 text-xs select-none">
                  <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[#71717a]">Archived Chats</span>
                  <span class="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-medium">({{ getArchivedChats().length }})</span>
                </div>

                @if (getArchivedChats().length === 0) {
                  <div class="px-3 py-10 text-center text-xs text-zinc-400 dark:text-zinc-500">
                    No archived conversations yet.
                  </div>
                }

                <div class="space-y-0.5">
                  @for (conv of getArchivedChats(); track conv.id) {
                    <div
                      [id]="'conv-item-' + conv.id"
                      (click)="selectConversation(conv)"
                      [ngClass]="activeConversation?.id === conv.id ? 'bg-[#f0f1f3] text-zinc-900 font-medium border border-[#dcdde1] dark:bg-[#18181b] dark:text-white dark:border-[#3f3f46]' : 'text-zinc-500 hover:text-zinc-900 hover:bg-[#f0f1f3] dark:text-[#71717a] dark:hover:text-white dark:hover:bg-[#141417]'"
                      class="group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs select-none relative"
                    >
                      <div class="flex items-center gap-2 truncate flex-1 min-w-0">
                        <svg class="w-3.5 h-3.5 flex-shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        <span class="truncate">{{ conv.title }}</span>
                      </div>

                      <!-- 3-Dot Action Button -->
                      <button
                        type="button"
                        (click)="toggleActionMenu(conv, $event)"
                        class="p-1 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/80 active:bg-zinc-200 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 dark:active:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                        [class.opacity-100]="openActionMenuConvId === conv.id"
                        [class.bg-zinc-200]="openActionMenuConvId === conv.id"
                        [class.text-zinc-900]="openActionMenuConvId === conv.id"
                        [class.dark:bg-zinc-800]="openActionMenuConvId === conv.id"
                        [class.dark:text-white]="openActionMenuConvId === conv.id"
                        title="Chat options"
                        aria-label="Chat options"
                      >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="2"></circle>
                          <circle cx="12" cy="12" r="2"></circle>
                          <circle cx="12" cy="19" r="2"></circle>
                        </svg>
                      </button>
                    </div>
                  }
                </div>
              </div>
            } @else {
              <!-- Pinned Chats Section -->
              @if (getPinnedChats().length > 0) {
                <div class="space-y-1">
                  <div class="flex items-center justify-between px-2 py-1 text-xs select-none">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[#71717a]">Pinned</span>
                    <span class="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-medium">({{ getPinnedChats().length }})</span>
                  </div>

                  <div class="space-y-0.5">
                    @for (conv of getPinnedChats(); track conv.id) {
                      <div
                        [id]="'conv-item-' + conv.id"
                        (click)="selectConversation(conv)"
                        draggable="true"
                        (dragstart)="onDragStartChat(conv, $event)"
                        (dragend)="onDragEndChat()"
                        [ngClass]="activeConversation?.id === conv.id ? 'bg-[#f0f1f3] text-zinc-900 font-medium border border-[#dcdde1] dark:bg-[#18181b] dark:text-white dark:border-[#3f3f46]' : 'text-zinc-500 hover:text-zinc-900 hover:bg-[#f0f1f3] dark:text-[#71717a] dark:hover:text-white dark:hover:bg-[#141417]'"
                        class="group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs select-none relative"
                      >
                        <div class="flex items-center gap-2 truncate flex-1 min-w-0">
                          <svg class="w-3.5 h-3.5 flex-shrink-0 text-zinc-600 dark:text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="17" x2="12" y2="22"></line>
                            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                          </svg>
                          <span class="truncate">{{ conv.title }}</span>
                        </div>
                        <div class="flex items-center gap-1 flex-shrink-0">
                          @if (chatState.isGenerating(conv.id)) {
                            <span class="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-white animate-pulse flex-shrink-0"></span>
                          }
                          <!-- 3-Dot Action Button -->
                          <button
                            type="button"
                            (click)="toggleActionMenu(conv, $event)"
                            class="p-1 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/80 active:bg-zinc-200 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 dark:active:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                            [class.opacity-100]="openActionMenuConvId === conv.id"
                            [class.bg-zinc-200]="openActionMenuConvId === conv.id"
                            [class.text-zinc-900]="openActionMenuConvId === conv.id"
                            [class.dark:bg-zinc-800]="openActionMenuConvId === conv.id"
                            [class.dark:text-white]="openActionMenuConvId === conv.id"
                            title="Chat options"
                            aria-label="Chat options"
                          >
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="2"></circle>
                              <circle cx="12" cy="12" r="2"></circle>
                              <circle cx="12" cy="19" r="2"></circle>
                            </svg>
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Shared With You Section -->
              @if (chatState.sharedConversations().length > 0) {
                <div data-tour="shared-chats" class="space-y-1">
                  <!-- Compact Shared With You Header Row -->
                  <div
                    (click)="toggleSharedSectionCollapse()"
                    class="flex items-center justify-between px-2 py-1 text-xs select-none min-w-0 rounded-lg cursor-pointer text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors group"
                    title="Toggle shared with you section"
                  >
                    <div class="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                      <svg
                        class="w-3 h-3 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-transform flex-shrink-0"
                        [ngClass]="isSharedGroupExpanded ? 'rotate-90 text-zinc-700 dark:text-zinc-300' : ''"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                      </svg>
                      <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[#71717a] group-hover:text-zinc-900 dark:group-hover:text-zinc-300 truncate">Shared With You</span>
                      <span class="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-medium flex-shrink-0">({{ chatState.sharedConversations().length }})</span>
                    </div>
                  </div>

                  <!-- Shared List (when group expanded) -->
                  @if (isSharedGroupExpanded) {
                    <div class="space-y-0.5">
                      @for (shared of chatState.sharedConversations(); track shared.id) {
                        <div
                          [id]="'conv-item-' + shared.id"
                          (click)="selectSharedConversation(shared)"
                          [ngClass]="activeConversation?.id === shared.id ? 'bg-[#f0f1f3] text-zinc-900 font-medium border border-[#dcdde1] dark:bg-[#18181b] dark:text-white dark:border-[#3f3f46]' : 'text-zinc-500 hover:text-zinc-900 hover:bg-[#f0f1f3] dark:text-[#71717a] dark:hover:text-white dark:hover:bg-[#141417]'"
                          class="group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs select-none relative"
                        >
                          <div class="flex items-center gap-2 truncate flex-1 min-w-0">
                            <svg class="w-3.5 h-3.5 flex-shrink-0 text-zinc-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            <span class="truncate">{{ shared.title }}</span>
                          </div>

                          <div class="flex items-center gap-1.5 flex-shrink-0">
                            <span class="text-[9px] px-1.5 py-0.5 rounded font-mono font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-200/70 dark:bg-zinc-800">
                              {{ shared.permission === 'contribute' ? 'edit' : 'view' }}
                            </span>

                            <button
                              type="button"
                              (click)="leaveSharedConversation(shared, $event)"
                              class="p-1 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-zinc-200/80 dark:hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                              title="Leave shared chat"
                            >
                              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }

              <!-- Collections Section -->
              <div data-tour="collections-section" class="space-y-1">
                <!-- Compact Collections Header Row -->
                <div
                  class="flex items-center justify-between px-2 py-1 text-xs select-none min-w-0 rounded-lg transition-all"
                  [ngClass]="isDragOverCollectionsHeader ? 'bg-zinc-200/80 ring-1 ring-zinc-400 dark:bg-zinc-800/90 dark:ring-1 dark:ring-white/50' : ''"
                  (dragover)="onDragOverCollectionsHeader($event)"
                  (dragleave)="onDragLeaveCollectionsHeader($event)"
                  (drop)="onDropOnCollectionsHeader($event)"
                >
                  <div
                    (click)="toggleAllCollectionsSectionCollapse()"
                    class="flex items-center gap-1.5 cursor-pointer text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors group min-w-0 flex-1 truncate"
                    title="Toggle collections section"
                  >
                    <svg
                      class="w-3 h-3 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-transform flex-shrink-0"
                      [ngClass]="isCollectionsGroupExpanded ? 'rotate-90 text-zinc-700 dark:text-zinc-300' : ''"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[#71717a] group-hover:text-zinc-900 dark:group-hover:text-zinc-300 truncate">Collections</span>
                    <span class="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-medium flex-shrink-0">({{ displayedCollections.length }})</span>
                  </div>

                  <button
                    data-tour="create-collection-btn"
                    (click)="openCreateCollectionModal()"
                    class="p-1 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors flex items-center justify-center flex-shrink-0 border border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-600"
                    title="New Collection"
                    aria-label="New Collection"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                  </button>
                </div>

                <!-- Collections List (when group expanded) -->
                @if (isCollectionsGroupExpanded) {
                  <div data-tour="collections-list" class="space-y-0.5">
                    @for (col of displayedCollections; track col.id) {
                      <div
                        class="rounded-xl border transition-all"
                        [ngClass]="dragOverCollectionId === col.id ? 'bg-zinc-200/80 border-zinc-400 ring-1 ring-zinc-400 dark:bg-zinc-800/90 dark:border-white/60 dark:ring-1 dark:ring-white/50' : 'border-transparent hover:border-zinc-200 dark:hover:border-zinc-800/40 bg-transparent hover:bg-zinc-100 dark:hover:bg-[#111114]/40'"
                        (dragover)="onDragOverCollection(col.id, $event)"
                        (dragleave)="onDragLeaveCollection(col.id, $event)"
                        (drop)="onDropOnCollection(col.id, $event)"
                      >
                        <!-- Collection Row -->
                        <div
                          (click)="toggleCollectionExpand(col.id)"
                          class="flex items-center justify-between px-2 py-1.5 cursor-pointer text-xs group rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          <div class="flex items-center gap-1.5 truncate">
                            <!-- Folder-Tree Arrow Chevron -->
                            <button
                              type="button"
                              (click)="toggleCollectionExpand(col.id); $event.stopPropagation()"
                              class="w-3.5 h-3.5 flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-transform p-0 rounded flex-shrink-0"
                              [title]="isCollectionExpanded(col.id) ? 'Collapse collection' : 'Expand collection'"
                            >
                              <svg
                                class="w-3 h-3 transition-transform duration-150"
                                [ngClass]="isCollectionExpanded(col.id) ? 'rotate-90 text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                              </svg>
                            </button>
                            <span class="truncate font-medium text-zinc-800 dark:text-zinc-200 text-xs">{{ col.name }}</span>
                            <span class="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-normal">({{ getConversationsForCollection(col.id).length }})</span>
                          </div>

                          <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              (click)="createNewConversation(col.id); $event.stopPropagation()"
                              class="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 rounded"
                              title="New chat in this collection"
                            >
                              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                            <button
                              (click)="openRenameCollectionModal(col, $event)"
                              class="p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/80 dark:text-zinc-500 dark:hover:text-white dark:hover:bg-zinc-800 rounded"
                              title="Rename collection"
                            >
                              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              (click)="deleteCollection(col.id, $event)"
                              class="p-1 text-zinc-400 hover:text-rose-600 hover:bg-zinc-200/80 dark:text-zinc-500 dark:hover:text-white dark:hover:bg-zinc-800 rounded"
                              title="Delete collection"
                            >
                              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <!-- Collection Conversations Nested Under Folder -->
                        @if (isCollectionExpanded(col.id)) {
                          <div class="pl-4 pr-1 py-1 space-y-0.5 border-l border-zinc-200 dark:border-zinc-800/80 ml-3 my-0.5 animate-fade-in">
                            @for (conv of getConversationsForCollection(col.id); track conv.id) {
                              <div
                                [id]="'conv-item-' + conv.id"
                                (click)="selectConversation(conv)"
                                draggable="true"
                                (dragstart)="onDragStartChat(conv, $event)"
                                (dragend)="onDragEndChat()"
                                [ngClass]="activeConversation?.id === conv.id ? 'bg-[#f0f1f3] text-zinc-900 font-medium border border-[#dcdde1] dark:bg-[#18181b] dark:text-white dark:border-[#3f3f46]' : 'text-zinc-500 hover:text-zinc-900 hover:bg-[#f0f1f3] dark:text-[#71717a] dark:hover:text-white dark:hover:bg-[#141417]'"
                                class="group/item flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-all text-xs select-none relative"
                              >
                                <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                  @if (conv.pinned) {
                                    <svg class="w-3 h-3 text-zinc-500 dark:text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                      <line x1="12" y1="17" x2="12" y2="22"></line>
                                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                                    </svg>
                                  } @else {
                                    <span class="w-[2px] h-3 rounded-full bg-zinc-400 group-hover/item:bg-zinc-600 dark:bg-zinc-600/70 dark:group-hover/item:bg-zinc-400 select-none flex-shrink-0"></span>
                                  }
                                  <span class="truncate">{{ conv.title }}</span>
                                </div>
                                <div class="flex items-center gap-1 flex-shrink-0">
                                  @if (chatState.isGenerating(conv.id)) {
                                    <span class="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-white animate-pulse flex-shrink-0"></span>
                                  }

                                  <!-- 3-Dot Action Button -->
                                  <button
                                    type="button"
                                    (click)="toggleActionMenu(conv, $event)"
                                    class="p-1 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/80 active:bg-zinc-200 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 dark:active:bg-zinc-700 transition-colors opacity-0 group-hover/item:opacity-100 focus:opacity-100 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                                    [class.opacity-100]="openActionMenuConvId === conv.id"
                                    [class.bg-zinc-200]="openActionMenuConvId === conv.id"
                                    [class.text-zinc-900]="openActionMenuConvId === conv.id"
                                    [class.dark:bg-zinc-800]="openActionMenuConvId === conv.id"
                                    [class.dark:text-white]="openActionMenuConvId === conv.id"
                                    title="Chat options"
                                    aria-label="Chat options"
                                  >
                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                      <circle cx="12" cy="5" r="2"></circle>
                                      <circle cx="12" cy="12" r="2"></circle>
                                      <circle cx="12" cy="19" r="2"></circle>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            }
                            @if (getConversationsForCollection(col.id).length === 0) {
                              <div class="px-2 py-1.5 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
                                <span class="italic text-[10px]">Empty collection</span>
                                <button
                                  (click)="createNewConversation(col.id)"
                                  class="text-[10px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white underline underline-offset-2"
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
                      class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-colors text-xs font-medium border border-dashed border-zinc-200 dark:border-zinc-800/80"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                      </svg>
                      <span>New Collection</span>
                    </button>
                  </div>
                }
              </div>

              <!-- Recent Chats / Uncollected Chats -->
              <div data-tour="recent-chats" class="space-y-1">
                <div class="flex items-center justify-between px-2 py-1 text-xs select-none">
                  <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[#71717a]">Recent Chats</span>
                  <span class="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-medium">({{ getRecentUncollectedChats().length }})</span>
                </div>

                @if (getRecentUncollectedChats().length === 0) {
                  <div class="px-3 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500 italic">
                    No recent chats
                  </div>
                }

                @for (conv of getRecentUncollectedChats(); track conv.id) {
                  <div
                    [id]="'conv-item-' + conv.id"
                    (click)="selectConversation(conv)"
                    draggable="true"
                    (dragstart)="onDragStartChat(conv, $event)"
                    (dragend)="onDragEndChat()"
                    [ngClass]="activeConversation?.id === conv.id ? 'bg-[#f0f1f3] text-zinc-900 font-medium border border-[#dcdde1] dark:bg-[#18181b] dark:text-white dark:border-[#3f3f46]' : 'text-zinc-500 hover:text-zinc-900 hover:bg-[#f0f1f3] dark:text-[#71717a] dark:hover:text-white dark:hover:bg-[#141417]'"
                    class="group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs select-none relative"
                  >
                    <div class="flex items-center truncate flex-1 min-w-0">
                      <span class="truncate">{{ conv.title }}</span>
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0">
                      @if (chatState.isGenerating(conv.id)) {
                        <span class="flex items-center gap-1 text-[10px] font-mono text-zinc-600 dark:text-zinc-400 flex-shrink-0" title="Generating in background">
                          <span class="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-white animate-pulse"></span>
                          <span class="hidden sm:inline">running</span>
                        </span>
                      }

                      <!-- 3-Dot Action Button -->
                      <button
                        type="button"
                        (click)="toggleActionMenu(conv, $event)"
                        class="p-1 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/80 active:bg-zinc-200 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 dark:active:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                        [class.opacity-100]="openActionMenuConvId === conv.id"
                        [class.bg-zinc-200]="openActionMenuConvId === conv.id"
                        [class.text-zinc-900]="openActionMenuConvId === conv.id"
                        [class.dark:bg-zinc-800]="openActionMenuConvId === conv.id"
                        [class.dark:text-white]="openActionMenuConvId === conv.id"
                        title="Chat options"
                        aria-label="Chat options"
                      >
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="2"></circle>
                          <circle cx="12" cy="12" r="2"></circle>
                          <circle cx="12" cy="19" r="2"></circle>
                        </svg>
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Resizing Drag Handle (Desktop Only) -->
          <div
            (mousedown)="startResizeConv($event)"
            class="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-zinc-400/50 dark:hover:bg-white/50 active:bg-zinc-600 dark:active:bg-white transition-colors z-20"
            title="Drag to resize conversations"
          ></div>
        </div>
      }

      <!-- Main Chat Area -->
      <div class="flex-1 flex flex-col h-full min-w-0 bg-[#f7f8fa] dark:bg-[#09090b] relative">

        <!-- Chat Header -->
        <div class="h-14 border-b border-[#dcdde1] dark:border-[#27272a] px-3 sm:px-4 flex items-center justify-between flex-shrink-0 bg-white dark:bg-[#09090b]">
          @if (isDirectMode && activeDirectPartner; as partner) {
            <!-- Dedicated Direct Message Header -->
            <div class="flex items-center gap-3 min-w-0">
              @if (isConvCollapsed) {
                <button
                  (click)="toggleConvCollapse()"
                  class="min-w-[34px] min-h-[34px] -ml-1 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-[#a1a1aa] dark:hover:text-white dark:hover:bg-[#18181b] flex items-center justify-center transition-colors cursor-pointer"
                  title="Show sidebar"
                  aria-label="Show sidebar"
                >
                  <svg class="w-4 h-4" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              }

              <!-- Partner Avatar with Presence Indicator -->
              <div
                (click)="openDirectPartnerProfile(partner, $event)"
                class="relative cursor-pointer flex-shrink-0 group overflow-visible"
                title="View profile"
              >
                <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-zinc-200 text-zinc-900 border border-zinc-300 dark:bg-zinc-800 dark:text-white dark:border-zinc-700 font-semibold text-xs flex items-center justify-center shadow-xs ring-1 ring-black/5 dark:ring-white/10 group-hover:ring-zinc-400 transition-all select-none">
                  {{ getPartnerInitials(partner) }}
                </div>
                <span
                  class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#09090b] z-10"
                  [ngClass]="partner.presence?.isOnline ? 'bg-emerald-500' : 'bg-zinc-400'"
                ></span>
              </div>

              <!-- Partner Info (Name, Role, Presence, Email) -->
              <div class="min-w-0 flex flex-col justify-center">
                <div class="flex items-center gap-2">
                  <span
                    (click)="openDirectPartnerProfile(partner, $event)"
                    class="font-semibold text-zinc-900 dark:text-white text-xs sm:text-sm tracking-tight truncate cursor-pointer hover:underline"
                  >
                    {{ partner.firstName }} {{ partner.lastName }}
                  </span>
                  @if (partner.role) {
                    <span class="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono text-zinc-700 dark:text-zinc-300 capitalize border border-zinc-200 dark:border-zinc-700">
                      {{ partner.role }}
                    </span>
                  }
                </div>
                <div class="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  <span class="font-medium" [ngClass]="partner.presence?.isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'">
                    {{ partner.presence?.isOnline ? 'Active now' : 'Offline' }}
                  </span>
                  @if (partner.email) {
                    <span class="text-zinc-300 dark:text-zinc-600">·</span>
                    <span class="truncate hover:text-zinc-700 dark:hover:text-zinc-300 select-all" [title]="partner.email">
                      {{ partner.email }}
                    </span>
                  }
                </div>
              </div>
            </div>

            <!-- Header Actions -->
            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="openDirectPartnerProfile(partner, $event)"
                class="min-h-[30px] px-2.5 py-1 rounded-md text-xs border bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900 dark:bg-[#18181b] dark:hover:bg-[#27272a] dark:text-[#a1a1aa] dark:hover:text-white border-[#dcdde1] dark:border-[#27272a] flex items-center gap-1.5 transition-colors cursor-pointer"
                title="View partner details"
              >
                <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span class="hidden sm:inline">Profile</span>
              </button>
              @if (messages.length > 0) {
                <button
                  (click)="exportConversationPdf()"
                  class="min-h-[30px] px-2.5 py-1 rounded-md text-xs border bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900 dark:bg-[#18181b] dark:hover:bg-[#27272a] dark:text-[#a1a1aa] dark:hover:text-white border-[#dcdde1] dark:border-[#27272a] flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Export direct conversation as PDF"
                >
                  <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span class="hidden sm:inline">Export</span>
                </button>
              }
            </div>
          } @else {
            <!-- Standard Workspace / AI Header -->
            <div class="flex items-center gap-2 sm:gap-3 min-w-0">
              @if (isConvCollapsed) {
                <button
                  (click)="toggleConvCollapse()"
                  class="min-w-[36px] min-h-[36px] -ml-1 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-[#a1a1aa] dark:hover:text-white dark:hover:bg-[#18181b] flex items-center justify-center transition-colors cursor-pointer"
                  title="Show sidebar"
                  aria-label="Show sidebar"
                >
                  <svg class="w-4 h-4" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
                @if (!isArchivedView) {
                  <button
                    (click)="createNewConversation()"
                    class="min-w-[36px] min-h-[36px] rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-[#a1a1aa] dark:hover:text-white dark:hover:bg-[#18181b] flex items-center justify-center transition-colors cursor-pointer"
                    title="New Chat"
                    aria-label="New Chat"
                  >
                    <svg class="w-4 h-4" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                }
              }
              <div class="w-2 h-2 rounded-full flex-shrink-0" [ngClass]="isCurrentGenerating ? 'bg-zinc-900 dark:bg-zinc-300 animate-pulse' : 'bg-zinc-400 dark:bg-zinc-600'"></div>
              <div class="flex items-center gap-2 truncate">
                <h2 class="font-medium text-zinc-900 dark:text-white text-xs tracking-tight truncate max-w-[180px] sm:max-w-md">
                  {{ isTemporaryMode ? 'Temporary Chat' : (isArchivedView && !activeConversation ? 'Archived Chats' : (activeConversation?.title || 'New Workplace Session')) }}
                </h2>
                @if (activeConversation?.archived) {
                  <span class="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">Archived</span>
                }
                @if (activeSharedConversationInfo?.owner; as owner) {
                  <button
                    type="button"
                    (click)="openOwnerProfile(owner, $event)"
                    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-[11px] transition-colors"
                    title="View owner profile and presence"
                  >
                    <span class="w-1.5 h-1.5 rounded-full" [ngClass]="owner.presence?.isOnline ? 'bg-emerald-500' : 'bg-zinc-400'"></span>
                    <span>Shared by {{ owner.firstName }}</span>
                    <span class="text-[9px] font-mono uppercase text-zinc-500">({{ activeSharedConversationInfo?.permission === 'contribute' ? 'Contribute' : 'View Only' }})</span>
                  </button>
                }
              </div>
            </div>

            <div class="flex items-center gap-2">
              @if (activeConversation && !isTemporaryMode && !isArchivedView) {
                <button
                  type="button"
                  (click)="handleHeaderShare($event)"
                  class="min-h-[30px] px-2.5 py-1 rounded-md text-xs border bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900 dark:bg-[#18181b] dark:hover:bg-[#27272a] dark:text-[#a1a1aa] dark:hover:text-white border-[#dcdde1] dark:border-[#27272a] flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Share this conversation with team members"
                >
                  <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span class="hidden sm:inline">Share</span>
                </button>
              }

              @if (activeConversation?.archived) {
                <button
                  type="button"
                  (click)="toggleArchive(activeConversation!)"
                  class="min-h-[30px] px-2.5 py-1 rounded-md text-xs border bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 dark:bg-[#18181b] dark:hover:bg-[#27272a] dark:text-[#a1a1aa] dark:hover:text-white border-[#dcdde1] dark:border-[#27272a] flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Unarchive chat"
                >
                  <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <span>Unarchive</span>
                </button>
              }

              @if (!isArchivedView) {
                <!-- Temporary Chat Toggle -->
                <button
                  type="button"
                  (click)="toggleTemporaryMode()"
                  [ngClass]="isTemporaryMode ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100 font-medium' : 'bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 dark:bg-[#18181b] dark:hover:bg-[#27272a] dark:text-[#a1a1aa] dark:hover:text-white border-[#dcdde1] dark:border-[#27272a]'"
                  class="min-h-[30px] px-2.5 py-1 rounded-md text-xs border flex items-center gap-2 transition-colors cursor-pointer"
                  [title]="isTemporaryMode ? 'Exit Temporary Chat' : 'Enable Temporary Chat'"
                  aria-label="Toggle temporary chat mode"
                >
                  <span>Temporary Chat</span>
                  @if (!isTemporaryMode) {
                    <svg class="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path stroke-dasharray="4 3" d="M12 21a9 9 0 10-9-9c0 1.48.36 2.88 1 4.11L3 21l4.89-1c1.23.64 2.63 1 4.11 1z" />
                    </svg>
                  } @else {
                    <svg class="w-3.5 h-3.5 text-white dark:text-zinc-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path stroke-dasharray="4 3" d="M12 21a9 9 0 10-9-9c0 1.48.36 2.88 1 4.11L3 21l4.89-1c1.23.64 2.63 1 4.11 1z" />
                      <path stroke-dasharray="none" stroke-width="2.5" d="M8.5 12l2.5 2.5 5-5" />
                    </svg>
                  }
                </button>
              }

              @if (chatState.activeGenerationsCount() > 0) {
                <div class="flex items-center gap-1.5 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
                  <span class="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-white animate-pulse"></span>
                  <span>{{ chatState.activeGenerationsCount() }}/2 Active Chats</span>
                </div>
              }
              @if (messages.length > 0) {
                <button
                  (click)="exportConversationPdf()"
                  class="min-h-[36px] px-2.5 py-1 rounded-lg bg-white hover:bg-zinc-100 text-zinc-700 hover:text-zinc-900 dark:bg-[#18181b] dark:hover:bg-[#27272a] text-xs font-medium border border-[#dcdde1] dark:border-[#27272a] dark:text-[#a1a1aa] dark:hover:text-white flex items-center gap-1.5 transition-colors"
                  title="Export as PDF"
                >
                  <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span class="hidden sm:inline">Export PDF</span>
                </button>
              }
            </div>
          }
        </div>

        <!-- Messages Thread -->
        <div #scrollContainer (scroll)="onScrollContainerScrolled()" class="flex-1 overflow-y-auto px-2.5 sm:px-6 lg:px-8 pt-3 pb-12 sm:pt-4 sm:pb-16 max-w-4xl mx-auto w-full min-h-0 relative" [ngClass]="isDirectMode ? 'space-y-1.5' : 'space-y-2.5 sm:space-y-4'">
          @if (isDirectMode) {
            <!-- Direct Message Thread View -->
            @if (messages.length === 0) {
              <!-- Empty Direct Message Partner Welcome Card -->
              <div class="h-full flex flex-col items-center justify-center text-center space-y-4 py-12 animate-fade-in my-auto select-none">
                <div class="relative">
                  <div class="w-16 h-16 rounded-full bg-zinc-200 text-zinc-900 border border-zinc-300 dark:bg-zinc-800 dark:text-white dark:border-zinc-700 font-bold text-xl flex items-center justify-center shadow-lg ring-4 ring-zinc-100 dark:ring-zinc-800 transition-colors">
                    {{ getPartnerInitials(activeDirectPartner) }}
                  </div>
                  <span
                    class="absolute bottom-0 right-0 w-4 h-4 rounded-full ring-2 ring-white dark:ring-[#09090b] z-10"
                    [ngClass]="activeDirectPartner?.presence?.isOnline ? 'bg-emerald-500' : 'bg-zinc-400'"
                  ></span>
                </div>
                <div class="space-y-1 max-w-sm">
                  <div class="flex items-center justify-center gap-2">
                    <h3 class="text-base font-semibold text-zinc-900 dark:text-white">
                      {{ activeDirectPartner?.firstName }} {{ activeDirectPartner?.lastName }}
                    </h3>
                    @if (activeDirectPartner?.role) {
                      <span class="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono text-zinc-600 dark:text-zinc-400 capitalize border border-zinc-200 dark:border-zinc-700">
                        {{ activeDirectPartner.role }}
                      </span>
                    }
                  </div>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400">
                    {{ activeDirectPartner?.email }}
                  </p>
                  <p class="text-xs text-zinc-600 dark:text-zinc-400 pt-2 leading-relaxed">
                    This is the start of your direct conversation with <span class="font-medium text-zinc-900 dark:text-white">{{ activeDirectPartner?.firstName }}</span>. Send a message to get started, or mention <span class="font-mono font-semibold text-rose-600 dark:text-rose-400">&#64;Syntra</span> to consult AI together.
                  </p>
                </div>
              </div>
            }

            @for (msg of messages; track $index; let msgIdx = $index) {
              <!-- Date Divider -->
              @if (getDateDivider(messages[msgIdx - 1], msg); as dateLabel) {
                <div class="flex items-center justify-center my-3 select-none">
                  <span class="px-3 py-0.5 rounded-full text-[10px] font-medium bg-zinc-200/70 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 shadow-2xs">
                    {{ dateLabel }}
                  </span>
                </div>
              }

              <!-- Direct Message Row (Aligned strictly by ownership) -->
              <div
                [ngClass]="[
                  isOwnMessage(msg) ? 'justify-end' : 'justify-start',
                  isConsecutiveMessage(messages[msgIdx - 1], msg) ? 'mt-0.5' : 'mt-3'
                ]"
                class="flex items-center gap-2 group relative"
              >
                <!-- Partner Avatar (Left Side only, when not consecutive or first in block) -->
                @if (!isOwnMessage(msg)) {
                  <div class="w-7 h-7 flex-shrink-0 self-end mb-0.5">
                    @if (!isConsecutiveMessage(messages[msgIdx - 1], msg)) {
                      <div
                        (click)="openDirectPartnerProfile(activeDirectPartner, $event)"
                        class="w-7 h-7 rounded-full bg-zinc-200 text-zinc-900 border border-zinc-300 dark:bg-zinc-800 dark:text-white dark:border-zinc-700 font-semibold text-[10px] flex items-center justify-center shadow-2xs cursor-pointer select-none transition-colors"
                        [title]="getSenderName(msg)"
                      >
                        {{ getPartnerInitials(msg.author || activeDirectPartner) }}
                      </div>
                    }
                  </div>
                }

                <!-- Hover Action Toolbar for Sender (Appears on the LEFT of the sender bubble) -->
                @if (isOwnMessage(msg)) {
                  <div
                    class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 select-none pointer-events-none group-hover:pointer-events-auto flex-shrink-0"
                  >
                    @if (msg.createdAt) {
                      <span class="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 whitespace-nowrap select-none font-medium">
                        {{ msg.createdAt | date:'shortTime' }}
                      </span>
                    }

                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        (click)="setReplyToMessage(msg)"
                        class="w-6 h-6 rounded-md bg-white dark:bg-[#202024] hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 shadow-xs flex items-center justify-center transition-colors cursor-pointer"
                        title="Reply"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a5 5 0 015 5v3M3 10l6-6M3 10l6 6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        (click)="copyMessageText(msg.content, msgIdx)"
                        class="w-6 h-6 rounded-md bg-white dark:bg-[#202024] hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 shadow-xs flex items-center justify-center transition-colors cursor-pointer"
                        title="Copy text"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        (click)="openShareMessageModal(msg, $event)"
                        class="w-6 h-6 rounded-md bg-white dark:bg-[#202024] hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 shadow-xs flex items-center justify-center transition-colors cursor-pointer"
                        title="Share message"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                }

                <!-- Message Bubble Container -->
                <div
                  [ngClass]="[
                    isOwnMessage(msg) ? 'items-end' : 'items-start',
                    msg.role === 'assistant' ? 'max-w-[85%] sm:max-w-[75%]' : 'max-w-[75%] sm:max-w-[65%]'
                  ]"
                  class="flex flex-col relative w-fit"
                >
                  <!-- Sender Name for Partner's first message in group -->
                  @if (!isOwnMessage(msg) && !isConsecutiveMessage(messages[msgIdx - 1], msg) && msg.role !== 'assistant') {
                    <span class="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 px-1 mb-0.5 select-none">
                      {{ getSenderName(msg) }}
                    </span>
                  }

                  <!-- AI Invocation Pill (when assistant responds inside direct message) -->
                  @if (msg.role === 'assistant') {
                    <div [id]="'msg-bubble-' + msg.id" class="w-full bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5 shadow-xs text-xs leading-relaxed text-zinc-900 dark:text-zinc-100 transition-all">
                      <div class="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-zinc-200 dark:border-zinc-800/80">
                        <div class="flex items-center gap-1.5 font-semibold text-xs text-zinc-900 dark:text-white">
                          <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                          <span>&#64;Syntra AI</span>
                          <span class="text-[10px] font-normal text-zinc-500 dark:text-zinc-400 font-sans">
                            · requested by {{ isOwnMessage(msg) ? 'you' : (activeDirectPartner?.firstName || 'Colleague') }}
                          </span>
                        </div>
                      </div>

                      @if (!msg.content) {
                        <div class="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs py-1">
                          <div class="flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-bounce" style="animation-delay: 0ms"></span>
                            <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-bounce" style="animation-delay: 150ms"></span>
                            <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-bounce" style="animation-delay: 300ms"></span>
                          </div>
                          <span class="font-mono text-[11px]">Syntra AI is thinking...</span>
                        </div>
                      } @else {
                        <div class="prose-ai text-xs" [innerHTML]="getDisplayContent(msg) | markdown"></div>
                      }

                      <!-- Python Execution Code Viewer Accordion -->
                      @if (msg.pythonCode) {
                        <details class="mt-2.5 text-xs border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-black">
                          <summary class="px-3 py-1.5 cursor-pointer text-zinc-700 dark:text-zinc-300 font-mono text-[11px] flex items-center justify-between bg-zinc-100/60 dark:bg-zinc-900 select-none">
                            <span>Python Script</span>
                            <span class="text-[10px] text-zinc-500">Python 3.11</span>
                          </summary>
                          <div class="p-2.5 bg-zinc-50 dark:bg-black font-mono text-[11px] overflow-x-auto max-h-60">
                            <pre class="m-0"><code class="language-python" [innerHTML]="highlightCode(msg.pythonCode, 'python')"></code></pre>
                          </div>
                        </details>
                      }

                      <!-- Generated Table -->
                      @if (msg.generatedTable) {
                        <div class="mt-2">
                          <app-table-viewer [table]="msg.generatedTable"></app-table-viewer>
                        </div>
                      }

                      <!-- Generated Charts -->
                      @if (msg.generatedCharts && msg.generatedCharts.length > 0) {
                        @for (chart of msg.generatedCharts; track $index) {
                          <div class="mt-2">
                            <app-chart-viewer [chartSpec]="chart"></app-chart-viewer>
                          </div>
                        }
                      } @else if (getDisplayChart(msg)) {
                        <div class="mt-2">
                          <app-chart-viewer [chartSpec]="getDisplayChart(msg)!"></app-chart-viewer>
                        </div>
                      }

                      <!-- Citations -->
                      @if (msg.citations && msg.citations.length > 0) {
                        <div class="mt-2">
                          <app-citation-badge [citations]="msg.citations"></app-citation-badge>
                        </div>
                      }

                      <!-- Downloadable file -->
                      @if (msg.downloadableFile) {
                        <div class="mt-2">
                          <div
                            (click)="downloadChatFile(msg.downloadableFile)"
                            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700 text-xs transition-colors"
                          >
                            <span class="font-mono text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">FILE</span>
                            <span class="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[180px]">{{ msg.downloadableFile.fileName }}</span>
                            <svg class="w-3.5 h-3.5 text-zinc-500 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </div>
                        </div>
                      }
                    </div>
                  } @else {
                    <!-- Human Message Bubble (Pure Message Content - Zero Permanent Metadata) -->
                    <div
                      [id]="'msg-bubble-' + msg.id"
                      (click)="toggleMessageTimestamp(msg.id, $event)"
                      [ngClass]="[
                        isOwnMessage(msg)
                          ? 'bg-zinc-900 text-white dark:bg-[#27272a] dark:text-zinc-100 dark:border dark:border-zinc-700/60 rounded-2xl ' + (isConsecutiveMessage(messages[msgIdx - 1], msg) ? '' : 'rounded-tr-xs')
                          : 'bg-[#eaebef] text-zinc-900 border border-[#d0d3d9] dark:bg-[#18181b] dark:text-zinc-100 dark:border-zinc-800 rounded-2xl ' + (isConsecutiveMessage(messages[msgIdx - 1], msg) ? '' : 'rounded-tl-xs')
                      ]"
                      class="px-3.5 py-2 text-xs sm:text-sm leading-relaxed shadow-2xs select-text relative break-words inline-block w-fit cursor-pointer sm:cursor-text transition-all"
                    >
                      <!-- Structured Quoted Reply Header -->
                      @if (msg.replyTo) {
                        <div
                          (click)="scrollToOriginalMessage(msg.replyTo.id, $event)"
                          [ngClass]="isOwnMessage(msg) ? 'bg-white/10 hover:bg-white/15 border-white/50 text-white' : 'bg-black/5 hover:bg-black/10 border-zinc-500 dark:border-zinc-400 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-800 dark:text-zinc-200'"
                          class="border-l-[3px] pl-2 py-1 pr-2.5 mb-1.5 rounded text-[11px] cursor-pointer transition-colors max-w-full overflow-hidden select-none"
                          title="Click to jump to original message"
                        >
                          <div class="font-semibold text-[11px] leading-tight opacity-90 truncate">
                            {{ msg.replyTo.senderName }}
                          </div>
                          <div class="opacity-75 italic text-[10px] truncate leading-tight mt-0.5">
                            {{ msg.replyTo.content }}
                          </div>
                        </div>
                      } @else if (msg.content.startsWith('> ')) {
                        <!-- Legacy backwards compatibility for previously saved quote messages -->
                        <div class="border-l-2 border-zinc-400/80 dark:border-zinc-500/80 bg-black/5 dark:bg-white/5 pl-2 py-0.5 pr-2 mb-1.5 rounded text-[11px] opacity-85 italic truncate">
                          {{ msg.content.split('\n\n')[0].replace('> ', '') }}
                        </div>
                      }

                      <!-- Message Text Content -->
                      <div class="whitespace-pre-wrap leading-snug">
                        {{ (!msg.replyTo && msg.content.startsWith('> ') && msg.content.includes('\n\n')) ? msg.content.slice(msg.content.indexOf('\n\n') + 2) : msg.content }}
                      </div>

                      <!-- Direct Downloadable File Attachment Preview (if any) -->
                      @if (msg.downloadableFile) {
                        <div class="mt-2">
                          <div
                            (click)="downloadChatFile(msg.downloadableFile)"
                            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 cursor-pointer text-xs transition-colors"
                          >
                            <span class="font-mono text-[10px] font-bold uppercase">{{ (msg.downloadableFile.fileName.split('.').pop() || 'FILE').toUpperCase() }}</span>
                            <span class="font-medium truncate max-w-[180px]">{{ msg.downloadableFile.fileName }}</span>
                            <svg class="w-3.5 h-3.5 ml-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Hover Action Toolbar for Receiver / Partner (Appears on the RIGHT of partner bubble) -->
                @if (!isOwnMessage(msg)) {
                  <div
                    class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 select-none pointer-events-none group-hover:pointer-events-auto flex-shrink-0"
                  >
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        (click)="setReplyToMessage(msg)"
                        class="w-6 h-6 rounded-md bg-white dark:bg-[#202024] hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 shadow-xs flex items-center justify-center transition-colors cursor-pointer"
                        title="Reply"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a5 5 0 015 5v3M3 10l6-6M3 10l6 6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        (click)="copyMessageText(msg.content, msgIdx)"
                        class="w-6 h-6 rounded-md bg-white dark:bg-[#202024] hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 shadow-xs flex items-center justify-center transition-colors cursor-pointer"
                        title="Copy text"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        (click)="openShareMessageModal(msg, $event)"
                        class="w-6 h-6 rounded-md bg-white dark:bg-[#202024] hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 shadow-xs flex items-center justify-center transition-colors cursor-pointer"
                        title="Share message"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                      </button>
                    </div>

                    @if (msg.createdAt) {
                      <!-- Timestamp for Receiver (Right of Action Buttons) -->
                      <span class="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 whitespace-nowrap select-none font-medium">
                        {{ msg.createdAt | date:'shortTime' }}
                      </span>
                    }
                  </div>
                }
              </div>
            }

            @if (isUploadingDmFile) {
              <div class="flex justify-end animate-fade-in">
                <div class="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 rounded-2xl px-4 py-2 text-xs flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-white dark:bg-zinc-950 animate-pulse"></span>
                  <span>Uploading attachment...</span>
                </div>
              </div>
            }
          } @else {
            <!-- Standard Workspace / AI Messages Loop -->
            <!-- Temporary Mode Notice Banner -->
            @if (isTemporaryMode && !isTemporaryNoticeDismissed) {
              <div class="px-3 py-2 rounded-lg bg-zinc-100/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs flex items-center justify-between animate-fade-in mb-3">
                <div class="flex items-center gap-2">
                  <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Messages from this session aren't saved to chat history.</span>
                </div>
                <button
                  type="button"
                  (click)="dismissTemporaryNotice()"
                  class="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer ml-3 flex-shrink-0"
                  title="Dismiss message"
                  aria-label="Dismiss message"
                >
                  Dismiss
                </button>
              </div>
            }

            @if (isArchivedView && !activeConversation) {
              <div class="h-full flex flex-col items-center justify-center text-center space-y-4 py-12 animate-fade-in my-auto">
                <div class="w-12 h-12 rounded-2xl bg-white dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] flex items-center justify-center p-2.5 text-zinc-400">
                  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <div class="space-y-1.5">
                  <h3 class="text-base font-semibold text-zinc-900 dark:text-white">Archived Conversations</h3>
                  <p class="text-xs text-zinc-500 dark:text-[#a1a1aa] leading-relaxed max-w-md mx-auto">
                    Select an archived conversation from the sidebar to view its message history, citations, and analytical insights.
                  </p>
                </div>
              </div>
            } @else if (messages.length === 0 && !isCurrentGenerating) {
              <div class="h-full flex flex-col items-center justify-center text-center space-y-6 py-12 animate-fade-in my-auto">
                <div class="w-12 h-12 rounded-2xl bg-white dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] flex items-center justify-center p-2.5">
                  <img src="/logo-icon.svg" alt="Syntra" class="w-full h-full object-contain" onerror="this.src='/logo-icon.png'" />
                </div>
                <div class="space-y-1.5">
                  <h3 class="text-base font-semibold text-zinc-900 dark:text-white">Syntra Chat AI Assistant</h3>
                  <p class="text-xs text-zinc-500 dark:text-[#a1a1aa] leading-relaxed max-w-md mx-auto">
                    Ask questions, summarize documents, analyze spreadsheets and datasets, or mention specific files with <span class="text-zinc-900 dark:text-white font-mono bg-[#f0f1f3] dark:bg-[#18181b] px-1.5 py-0.5 rounded border border-[#dcdde1] dark:border-[#27272a]">&#64;</span>.
                  </p>
                </div>

                <!-- Quick Prompt Starters (Dynamic Workspace Cards) -->
                @if (dynamicStarters.length > 0) {
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full text-left pt-2">
                    @for (card of dynamicStarters; track card.title) {
                      <button
                        (click)="sendQuickPrompt(card.promptText, card.resource)"
                        class="p-3 rounded-xl bg-white hover:bg-[#f8f9fa] dark:bg-[#111114] dark:hover:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] hover:border-zinc-400 dark:hover:border-[#3f3f46] transition-all text-xs space-y-1 group"
                      >
                        <div class="font-medium text-zinc-900 dark:text-white flex items-center gap-1.5 truncate">
                          <span class="text-sm flex-shrink-0">{{ card.icon }}</span>
                          <span class="truncate font-semibold text-zinc-900 dark:text-zinc-100">{{ card.title }}</span>
                        </div>
                        <div class="text-zinc-500 dark:text-[#71717a] text-[11px] truncate group-hover:text-zinc-700 dark:group-hover:text-[#a1a1aa] transition-colors">
                          {{ card.subtitle }}
                        </div>
                      </button>
                    }
                  </div>
                }
              </div>
            }

            @for (msg of messages; track $index; let msgIdx = $index) {
              @if (msg.role === 'user' || (msg.content && msg.content.length > 0) || msg.generatedChart || (msg.generatedCharts && msg.generatedCharts.length > 0) || msg.generatedTable || msg.pythonCode || getDisplayChart(msg)) {
                <div
                  [ngClass]="msg.role === 'user' ? 'justify-end' : 'justify-start'"
                  class="flex gap-2 sm:gap-3 animate-fade-in"
                >
                  @if (msg.role !== 'user') {
                    <div class="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] flex items-center justify-center flex-shrink-0 p-0.5 sm:p-1 mt-0.5 shadow-xs">
                      <img src="/logo-icon.svg" alt="Syntra" class="w-full h-full object-contain" onerror="this.src='/logo-icon.png'" />
                    </div>
                  }

                  <div
                    [ngClass]="msg.role === 'user' ? 'bg-[#eceef1] text-[#17191c] border border-[#dcdde1] dark:border-transparent dark:bg-[#212124] dark:text-white rounded-2xl rounded-tr-sm px-3 py-2 sm:px-4 sm:py-3 shadow-xs dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)] max-w-[90%] sm:max-w-[85%]' : 'bg-transparent text-zinc-900 dark:text-white max-w-full'"
                    class="text-sm leading-relaxed group relative min-w-0"
                  >
                    <!-- Rendered Rich Markdown Content -->
                    @if (msg.role === 'user') {
                      @if (msg.author && msg.author.id !== currentUserId) {
                        <div class="flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 pb-1 border-b border-zinc-300/60 dark:border-zinc-700/60">
                          <span class="font-semibold">{{ msg.author.firstName }} {{ msg.author.lastName }}</span>
                          @if (msg.createdAt) {
                            <span class="text-[10px] text-zinc-500 font-mono">· {{ msg.createdAt | date:'shortTime' }}</span>
                          }
                        </div>
                      }
                      @if (msg.referencedResourceIds && msg.referencedResourceIds.length > 0) {
                        <div class="flex flex-wrap items-center gap-1.5 mb-2.5">
                          @for (rId of msg.referencedResourceIds; track rId) {
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/95 dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#38383c] text-zinc-800 dark:text-zinc-200 text-xs font-mono shadow-2xs">
                              <span class="text-rose-600 dark:text-rose-400 font-bold">&#64;</span>
                              <span class="font-medium truncate max-w-[280px]">{{ getResourceDisplayName(rId) }}</span>
                            </span>
                          }
                        </div>
                      }
                      <div class="whitespace-pre-wrap text-sm">{{ msg.content }}</div>
                    } @else {
                      <div class="prose-ai" [innerHTML]="getDisplayContent(msg) | markdown"></div>
                    }

                    <!-- Python Execution Code Viewer Accordion -->
                    @if (msg.pythonCode) {
                      <details class="mt-3 text-xs border border-[#dcdde1] dark:border-[#27272a] rounded-xl overflow-hidden bg-white dark:bg-black shadow-sm dark:shadow-xl">
                        <summary class="px-3.5 py-2 cursor-pointer text-zinc-700 hover:text-zinc-900 dark:text-[#a1a1aa] dark:hover:text-white font-mono font-medium flex items-center justify-between bg-[#f8f9fa] dark:bg-[#0a0a0c] border-b border-[#dcdde1] dark:border-[#27272a]/70 select-none">
                          <span class="flex items-center gap-2">
                            <svg class="w-3.5 h-3.5 text-[#3b82f6]" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                            <span class="text-zinc-800 dark:text-zinc-300 font-semibold">Python Calculation Script</span>
                          </span>
                          <div class="flex items-center gap-2.5">
                            <span class="text-[10px] text-zinc-500 font-mono">Python 3.11</span>
                            <button type="button" class="copy-code-btn inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white px-2 py-0.5 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-all cursor-pointer select-none active:scale-95" (click)="$event.stopPropagation(); copyDirectText(msg.pythonCode, $event)" title="Copy Python script">
                              <svg class="copy-icon w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <span class="copy-text font-sans">Copy</span>
                            </button>
                          </div>
                        </summary>
                        <div class="p-3.5 bg-[#f8f9fa] dark:bg-black font-mono text-[12px] overflow-x-auto overflow-y-auto max-h-80 leading-relaxed">
                          <pre class="hljs-vscode-dark m-0"><code class="hljs language-python" [innerHTML]="highlightCode(msg.pythonCode, 'python')"></code></pre>
                        </div>
                      </details>
                    }

                    <!-- Generated Table (if available) -->
                    @if (msg.generatedTable) {
                      <app-table-viewer [table]="msg.generatedTable"></app-table-viewer>
                    }

                    <!-- Generated Charts (Single, Multiple, or Embedded JSON) -->
                    <div data-tour="chat-charts">
                      @if (msg.generatedCharts && msg.generatedCharts.length > 0) {
                        @for (chart of msg.generatedCharts; track $index) {
                          <app-chart-viewer [chartSpec]="chart"></app-chart-viewer>
                        }
                      } @else if (getDisplayChart(msg)) {
                        <app-chart-viewer [chartSpec]="getDisplayChart(msg)!"></app-chart-viewer>
                      }
                    </div>

                    <!-- Direct Downloadable File Attachment Preview (if any) -->
                    @if (msg.downloadableFile) {
                      <div class="mt-3 flex items-center">
                        <div
                          (click)="downloadChatFile(msg.downloadableFile)"
                          class="group/file-card inline-flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[#f0f1f3] hover:bg-[#e4e6ea] dark:bg-[#212124] dark:hover:bg-[#28282c] border border-[#dcdde1] dark:border-transparent cursor-pointer transition-all shadow-xs dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)] max-w-sm"
                          [class.opacity-75]="isDownloadingFile(msg.downloadableFile.documentId)"
                          role="button"
                          tabindex="0"
                          [title]="'Click to download ' + msg.downloadableFile.fileName"
                        >
                          <!-- Left: Compact File Type + Filename -->
                          <div class="flex items-center gap-2 min-w-0">
                            <span class="flex-shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono uppercase bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-500/20">
                              {{ (msg.downloadableFile.fileName.split('.').pop() || 'FILE').toUpperCase() }}
                            </span>
                            <span class="text-xs font-medium text-zinc-900 group-hover/file-card:text-black dark:text-zinc-100 dark:group-hover/file-card:text-white truncate max-w-[220px]" [title]="msg.downloadableFile.fileName">
                              {{ msg.downloadableFile.fileName }}
                            </span>
                          </div>

                          <!-- Right: Compact Download Icon Button -->
                          <button
                            type="button"
                            (click)="$event.stopPropagation(); downloadChatFile(msg.downloadableFile)"
                            [disabled]="isDownloadingFile(msg.downloadableFile.documentId)"
                            class="flex-shrink-0 w-6 h-6 rounded-lg bg-black/5 hover:bg-black/10 active:bg-black/20 text-zinc-700 hover:text-black dark:bg-white/5 dark:hover:bg-white/10 dark:active:bg-white/20 dark:text-zinc-300 dark:hover:text-white flex items-center justify-center transition-colors focus:outline-none ml-0.5"
                            title="Download file"
                            aria-label="Download file"
                          >
                            @if (isDownloadingFile(msg.downloadableFile.documentId)) {
                              <svg class="w-3.5 h-3.5 animate-spin text-zinc-900 dark:text-white" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            } @else {
                              <svg class="w-3.5 h-3.5 text-zinc-600 group-hover/file-card:text-black dark:text-zinc-300 dark:group-hover/file-card:text-white transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            }
                          </button>
                        </div>
                      </div>
                    }

                    <!-- Sources & Citations (if available) -->
                    @if (msg.citations && msg.citations.length > 0) {
                      <div data-tour="chat-citations">
                        <app-citation-badge [citations]="msg.citations"></app-citation-badge>
                      </div>
                    }

                    <!-- Action Toolbar for Assistant Message -->
                    @if (msg.role !== 'user' && msg.content && msg.content.trim().length > 0) {
                      <div class="flex items-center justify-start gap-1.5 pt-1.5 mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          (click)="copyMessageText(msg.content, msgIdx)"
                          class="text-[11px] flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-[#18181b] border border-transparent hover:border-zinc-300 dark:hover:border-zinc-800"
                          [ngClass]="copiedMessageIdx === msgIdx ? 'text-zinc-900 font-medium bg-zinc-100 border-zinc-300 dark:text-white dark:bg-[#18181b] dark:border-zinc-700' : 'text-zinc-500 hover:text-zinc-900 dark:text-[#71717a] dark:hover:text-white'"
                          [title]="copiedMessageIdx === msgIdx ? 'Copied to clipboard' : 'Copy response'"
                        >
                          @if (copiedMessageIdx === msgIdx) {
                            <svg class="w-3.5 h-3.5 text-zinc-900 dark:text-white" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Copied</span>
                          } @else {
                            <svg class="w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>Copy</span>
                          }
                        </button>

                        <button
                          (click)="exportMessagePdf(msg, $event)"
                          class="text-[11px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white flex items-center gap-1.5 transition-colors px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-[#18181b] border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 font-medium"
                          title="Export this calculation or analysis as a branded PDF report"
                        >
                          <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span>Export PDF</span>
                        </button>

                        <button
                          (click)="openShareMessageModal(msg, $event)"
                          class="text-[11px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white flex items-center gap-1.5 transition-colors px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-[#18181b] border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 font-medium"
                          title="Share this message with team members"
                        >
                          <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                          </svg>
                          <span>Share</span>
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
                <div class="w-7 h-7 rounded-lg bg-white dark:bg-[#18181b] border border-[#dcdde1] dark:border-[#27272a] flex items-center justify-center flex-shrink-0 p-1 mt-0.5 shadow-xs">
                  <img src="/logo-icon.svg" alt="Syntra" class="w-full h-full object-contain" onerror="this.src='/logo-icon.png'" />
                </div>
                <div class="bg-white dark:bg-[#111114] border border-[#dcdde1] dark:border-[#27272a] rounded-xl px-4 py-2.5 text-xs flex items-center gap-2.5 text-zinc-800 dark:text-white shadow-xs">
                  <span class="w-2 h-2 rounded-full bg-zinc-700 dark:bg-zinc-300 animate-pulse"></span>
                  <span class="font-mono text-zinc-600 dark:text-[#a1a1aa] transition-all duration-300">{{ currentGeneratingStatus }}</span>
                </div>
              </div>
            }
          }

          <!-- Per-Chat or Global Concurrency Error Banner -->
          @if (activeError) {
            <div class="p-3 rounded-xl bg-zinc-100 border border-zinc-300 text-zinc-800 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-200 text-xs flex items-center justify-between">
              <span>{{ activeError }}</span>
              <button (click)="dismissError()" class="text-zinc-900 dark:text-white font-semibold hover:underline ml-3 flex-shrink-0">Dismiss</button>
            </div>
          }
        </div>

        <!-- Input Box & Mention Autocomplete -->
        @if (!isArchivedView || activeConversation) {
          <div class="p-2 sm:p-4 border-t border-zinc-200 dark:border-[#27272a] bg-[#f7f8fa] dark:bg-[#09090b] relative flex-shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <!-- Floating "New messages ↓" Pill -->
            @if (hasUnseenNewMessages) {
              <div class="absolute -top-11 left-1/2 -translate-x-1/2 z-30 animate-bounce pointer-events-auto">
                <button
                  type="button"
                  (click)="scrollToBottomSmooth(); hasUnseenNewMessages = false"
                  class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-medium text-xs shadow-lg hover:shadow-xl transition-all cursor-pointer select-none border border-zinc-700/40 dark:border-zinc-300"
                >
                  <span>New messages</span>
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>
              </div>
            }

            <div class="max-w-4xl mx-auto relative">
              <!-- Autocomplete Dropdown Component -->
              <app-mention-autocomplete
                [isOpen]="isMentionOpen"
                [options]="mentionOptions"
                (optionSelected)="onMentionSelected($event)"
                (closed)="isMentionOpen = false"
              ></app-mention-autocomplete>

              @if (isDirectMode) {
                <!-- Direct Mode Quoted Reply Banner -->
                @if (replyingToMessage) {
                  <div class="flex items-center justify-between px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/90 rounded-t-xl text-xs border border-b-0 border-zinc-200 dark:border-zinc-700 animate-fade-in">
                    <div class="flex items-center gap-2 truncate text-zinc-700 dark:text-zinc-300 min-w-0">
                      <svg class="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a5 5 0 015 5v3M3 10l6-6M3 10l6 6" />
                      </svg>
                      <span class="font-semibold truncate">Replying to {{ replyingToMessage.role === 'assistant' ? 'Syntra AI' : getSenderName(replyingToMessage) }}:</span>
                      <span class="truncate italic text-zinc-500 dark:text-zinc-400">
                        "{{ replyingToMessage.downloadableFile ? ('Shared file: ' + replyingToMessage.downloadableFile.fileName) : (replyingToMessage.content | slice:0:80) }}"
                      </span>
                    </div>
                    <button
                      type="button"
                      (click)="cancelReply()"
                      class="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 font-bold ml-2 p-0.5 rounded cursor-pointer"
                      title="Cancel reply"
                    >
                      &times;
                    </button>
                  </div>
                }

                <!-- Hidden file input for DM attachments -->
                <input
                  type="file"
                  id="dm-file-upload-input"
                  (change)="onDmFileSelected($event)"
                  class="hidden"
                />

                <!-- Clean Direct Messaging Input Card -->
                <div
                  class="relative bg-white dark:bg-[#121215] border border-zinc-200 dark:border-[#27272a] focus-within:border-zinc-400 dark:focus-within:border-zinc-500 p-2 sm:p-2.5 transition-all shadow-xs dark:shadow-none flex items-center gap-2"
                  [ngClass]="replyingToMessage ? 'rounded-b-2xl' : 'rounded-2xl'"
                >
                  <!-- Attachment Clip Button -->
                  <button
                    type="button"
                    (click)="triggerDmFileUpload()"
                    [disabled]="isUploadingDmFile"
                    class="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-[#1f1f23] transition-colors flex-shrink-0 cursor-pointer disabled:opacity-40"
                    title="Attach a file to send"
                    aria-label="Attach file"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>

                  <!-- Direct Text Input Area -->
                  <textarea
                    #inputArea
                    [(ngModel)]="inputText"
                    (input)="onInputChange($event)"
                    (keydown)="onKeyDown($event)"
                    placeholder="Type a message... (use @Syntra for AI)"
                    rows="1"
                    class="chat-composer-textarea w-full bg-transparent border-0 text-zinc-900 dark:text-zinc-100 text-sm px-1 py-1 focus:outline-none focus:ring-0 resize-none max-h-36 sm:max-h-48 overflow-y-auto leading-relaxed placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  ></textarea>

                  <!-- Voice Mic Button -->
                  <button
                    type="button"
                    (click)="toggleVoiceInput()"
                    [ngClass]="voiceService.isListening ? 'bg-rose-600 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-[#1f1f23]'"
                    class="p-2 rounded-xl text-xs flex items-center justify-center transition-all flex-shrink-0 cursor-pointer"
                    [title]="voiceService.isListening ? 'Listening... Click to stop recording' : 'Voice input (Click to speak)'"
                    aria-label="Voice input"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </button>

                  <!-- Send Button -->
                  <button
                    (click)="sendUserMessage()"
                    [disabled]="!inputText.trim()"
                    class="p-2 rounded-xl bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-semibold text-xs transition-all disabled:bg-zinc-100 disabled:text-zinc-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0 shadow-2xs active:scale-95 cursor-pointer"
                    title="Send message (Enter)"
                    aria-label="Send message"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>

                <div class="hidden sm:flex items-center justify-between mt-1.5 px-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                  <span>Press <kbd class="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-[#18181b] dark:text-zinc-400 dark:border-zinc-800 font-mono text-[10px]">Enter</kbd> to send, <kbd class="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-[#18181b] dark:text-zinc-400 dark:border-zinc-800 font-mono text-[10px]">Shift + Enter</kbd> for a new line</span>
                  <span>Type <span class="font-mono font-medium text-rose-600 dark:text-rose-400">&#64;Syntra</span> to ask AI</span>
                </div>
              } @else {
                <!-- Standard Workspace AI Composer -->
                <!-- Attached Mention Chips -->
                @if (attachedResources.length > 0) {
                  <div class="flex flex-wrap gap-2 mb-2">
                    @for (res of attachedResources; track res.id) {
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#3f3f46] text-zinc-800 dark:text-white text-xs font-mono shadow-2xs">
                        <span class="text-rose-600 dark:text-rose-400 font-bold">&#64;</span>
                        <span>{{ res.name }}</span>
                        <button (click)="removeAttachedResource(res.id)" class="text-zinc-400 hover:text-zinc-900 dark:hover:text-white ml-1">×</button>
                      </span>
                    }
                  </div>
                }

                <!-- Concurrency Notice when limit is reached -->
                @if (isMaxGenerationsReached) {
                  <div class="mb-2 px-3 py-1.5 rounded-lg bg-zinc-100 border border-zinc-300 dark:bg-zinc-900 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-[11px] flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-zinc-900 dark:bg-white animate-pulse"></span>
                    <span>2 chats are currently generating in the background. Please wait for one to complete.</span>
                  </div>
                }

                <!-- View-Only Collaborator Notice Banner -->
                @if (isViewOnlyCollaborator) {
                  <div class="mb-2 px-3.5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs flex items-center gap-2.5 animate-fade-in">
                    <svg class="w-4 h-4 text-zinc-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>You have view-only access to this conversation. Only contributors can send prompts and interact.</span>
                  </div>
                }

                <!-- Floating Prompt Container (Clean Coherent Light/Dark Card) -->
                <div data-tour="chat-input-area" class="relative rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-[#27272a] focus-within:border-zinc-400 dark:focus-within:border-zinc-500 p-2.5 sm:p-3 transition-all shadow-xs dark:shadow-none" [class.opacity-60]="isViewOnlyCollaborator">
                  <div class="flex items-start gap-1">
                    <textarea
                      #inputArea
                      [(ngModel)]="inputText"
                      (input)="onInputChange($event)"
                      (keydown)="onKeyDown($event)"
                      [placeholder]="isViewOnlyCollaborator ? 'View-only mode (Cannot send messages)' : 'Ask anything or type @ to mention files...'"
                      [disabled]="isCurrentGenerating || isMaxGenerationsReached || isViewOnlyCollaborator"
                      rows="1"
                      class="chat-composer-textarea w-full bg-transparent border-0 text-zinc-900 dark:text-zinc-100 text-sm px-1.5 py-1 focus:outline-none focus:ring-0 resize-none max-h-36 sm:max-h-60 overflow-y-auto leading-relaxed disabled:opacity-50 transition-[height] duration-150 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    ></textarea>

                    <!-- Voice / Microphone Button in Top-Right of Input Box -->
                    <button
                      type="button"
                      (click)="toggleVoiceInput()"
                      [disabled]="isCurrentGenerating || isMaxGenerationsReached || isViewOnlyCollaborator"
                      [ngClass]="voiceService.isListening ? 'bg-rose-600 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-[#1f1f23]'"
                      class="min-w-[32px] min-h-[32px] p-1.5 rounded-xl text-xs flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-40"
                      [title]="voiceService.isListening ? 'Listening... Click to stop recording' : 'Voice input (Click to speak)'"
                      aria-label="Voice input"
                    >
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </button>
                  </div>

                  <div class="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800/80 mt-1">
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        (click)="triggerMentionMenu($event)"
                        data-tour="chat-mention-btn"
                        [disabled]="isCurrentGenerating || isMaxGenerationsReached || isViewOnlyCollaborator"
                        class="min-h-[30px] px-2.5 py-1 rounded-xl text-zinc-700 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 dark:text-[#d4d4d8] dark:hover:text-white dark:bg-[#1f1f23] dark:hover:bg-[#28282d] border border-zinc-200/80 dark:border-[#2e2e33] text-xs flex items-center gap-1.5 transition-all shadow-2xs disabled:opacity-40"
                        title="Attach & mention document or dataset"
                      >
                        <span class="text-rose-600 dark:text-rose-400 font-bold">&#64;</span>
                        <span class="font-medium">Mention</span>
                      </button>
                      <span class="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:inline font-sans">Folder & File Scoped AI</span>
                    </div>

                    <button
                      (click)="sendUserMessage()"
                      [disabled]="isCurrentGenerating || isMaxGenerationsReached || isViewOnlyCollaborator || (!inputText.trim() && attachedResources.length === 0)"
                      class="min-h-[30px] px-3.5 sm:px-4 py-1 rounded-xl bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-semibold text-xs transition-all disabled:bg-zinc-100 disabled:text-zinc-400 disabled:border disabled:border-zinc-200 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600 dark:disabled:border-transparent disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0 shadow-2xs active:scale-95"
                      title="Send (Enter)"
                    >
                      <span>Send</span>
                      <svg class="w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div class="hidden sm:flex items-center justify-between mt-2 px-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                  <span>Press <kbd class="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-[#18181b] dark:text-zinc-400 dark:border-zinc-800 font-mono text-[10px]">Enter</kbd> to send, <kbd class="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-[#18181b] dark:text-zinc-400 dark:border-zinc-800 font-mono text-[10px]">Shift + Enter</kbd> for a new line</span>
                  <span>AI can make mistakes. Verify critical facts.</span>
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Chat Action Contextual Menu Overlay -->
      @if (openActionMenuConv) {
        <!-- Backdrop to close on outside click -->
        <div
          class="fixed inset-0 z-50 bg-transparent"
          (click)="closeActionMenus()"
          (contextmenu)="closeActionMenus()"
        ></div>

        <!-- Menu Popover Container -->
        <div
          (click)="$event.stopPropagation()"
          [style.top.px]="actionMenuPos.top"
          [style.left.px]="actionMenuPos.left"
          [class.-translate-y-full]="actionMenuPos.openAbove"
          class="fixed z-50 w-44 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-lg shadow-xl py-1 text-xs text-zinc-800 dark:text-zinc-200 animate-fade-in select-none"
        >
          @if (!openActionMenuConv.archived) {
            <!-- Pin / Unpin -->
            <button
              type="button"
              (mouseenter)="onOtherMenuItemMouseEnter()"
              (click)="togglePin(openActionMenuConv, $event)"
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-[#27272a] transition-colors text-left"
            >
              <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="17" x2="12" y2="22"></line>
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
              </svg>
              <span>{{ openActionMenuConv.pinned ? 'Unpin chat' : 'Pin chat' }}</span>
            </button>

            <!-- Share -->
            <button
              type="button"
              (mouseenter)="onOtherMenuItemMouseEnter()"
              (click)="handleMenuShare(openActionMenuConv, $event)"
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-[#27272a] transition-colors text-left"
            >
              <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Share chat</span>
            </button>

            <!-- Archive -->
            <button
              type="button"
              (mouseenter)="onOtherMenuItemMouseEnter()"
              (click)="toggleArchive(openActionMenuConv, $event)"
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-[#27272a] transition-colors text-left"
            >
              <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span>Archive chat</span>
            </button>
          } @else {
            <!-- Unarchive -->
            <button
              type="button"
              (mouseenter)="onOtherMenuItemMouseEnter()"
              (click)="toggleArchive(openActionMenuConv, $event)"
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-[#27272a] transition-colors text-left font-medium"
            >
              <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span>Unarchive chat</span>
            </button>
          }

          <!-- Collection Menu Item with Nested Submenu (Available for both active and archived) -->
          <div
            class="relative group/submenu"
            (mouseenter)="onCollectionRowMouseEnter()"
          >
            <button
              type="button"
              (click)="toggleCollectionSubmenu($event)"
              class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-[#27272a] transition-colors text-left cursor-pointer"
              [class.bg-zinc-100]="isCollectionSubmenuOpen"
              [class.dark:bg-[#27272a]]="isCollectionSubmenuOpen"
            >
              <div class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span>Collection</span>
              </div>
              <svg class="w-3 h-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            @if (isCollectionSubmenuOpen) {
              <!-- Submenu Flyout -->
              <div
                (click)="$event.stopPropagation()"
                class="absolute top-0 z-50 w-44"
                [ngClass]="actionMenuPos.submenuOpenLeft ? 'right-full -mr-1 pr-1' : 'left-full -ml-1 pl-1'"
              >
                <div class="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-lg shadow-xl py-1 text-xs text-zinc-800 dark:text-zinc-200 max-h-56 overflow-y-auto custom-sidebar-scrollbar">
                  @if (openActionMenuConv.collectionId) {
                    <button
                      type="button"
                      (click)="setConversationCollection(openActionMenuConv, null, $event)"
                      class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-[#27272a] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-left font-medium transition-colors"
                    >
                      <span>Remove from collection</span>
                    </button>
                    <div class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>
                  }

                  @if (collections.length === 0) {
                    <div class="px-3 py-1.5 text-zinc-400 dark:text-zinc-500 italic text-[11px]">
                      No collections
                    </div>
                  } @else {
                    @for (c of collections; track c.id) {
                      <button
                        type="button"
                        (click)="setConversationCollection(openActionMenuConv, c.id, $event)"
                        class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-[#27272a] text-left transition-colors"
                      >
                        <span class="truncate">{{ c.name }}</span>
                        @if (openActionMenuConv.collectionId === c.id) {
                          <svg class="w-3.5 h-3.5 text-zinc-900 dark:text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                        }
                      </button>
                    }
                  }

                  <div class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>
                  <button
                    type="button"
                    (click)="openCreateCollectionForConversation(openActionMenuConv, $event)"
                    class="w-full px-3 py-1.5 flex items-center gap-1.5 hover:bg-zinc-100 dark:hover:bg-[#27272a] text-zinc-900 dark:text-white font-medium text-left transition-colors"
                  >
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Create collection</span>
                  </button>
                </div>
              </div>
            }
          </div>

          <div class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>

          <!-- Delete Chat -->
          <button
            type="button"
            (mouseenter)="onOtherMenuItemMouseEnter()"
            (click)="deleteConversation(openActionMenuConv.id, $event)"
            class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors text-left"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete chat</span>
          </button>
        </div>
      }

      <!-- File Download Error Toast -->
      @if (fileDownloadError) {
        <div class="fixed bottom-24 right-6 z-50 flex items-center gap-2 bg-red-950/90 border border-red-500/40 text-red-200 px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-sm text-xs font-medium animate-fadeIn">
          <svg class="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{{ fileDownloadError }}</span>
          <button (click)="fileDownloadError = null" class="ml-2 text-red-300 hover:text-white">&times;</button>
        </div>
      }

      <!-- Share Conversation Modal -->
      @if (isShareConvModalOpen && activeConversation) {
        <app-share-conversation-modal
          [isOpen]="isShareConvModalOpen"
          [conversation]="activeConversation"
          [isOwner]="!isViewOnlyCollaborator"
          (closed)="isShareConvModalOpen = false"
          (sharesUpdated)="chatState.loadSharedConversations()"
        ></app-share-conversation-modal>
      }

      <!-- Share Message Modal -->
      @if (isShareMessageModalOpen && shareModalMessage) {
        <app-share-message-modal
          [isOpen]="isShareMessageModalOpen"
          [message]="shareModalMessage"
          (closed)="isShareMessageModalOpen = false"
        ></app-share-message-modal>
      }

      <!-- Shared Message Viewer Modal -->
      @if (isSharedMessageViewerOpen && sharedMessageToView) {
        <app-shared-message-viewer-modal
          [isOpen]="isSharedMessageViewerOpen"
          [shareData]="sharedMessageToView"
          (closed)="isSharedMessageViewerOpen = false"
        ></app-shared-message-viewer-modal>
      }

      <!-- User Profile Popover -->
      @if (isProfilePopoverOpen && profileUser) {
        <app-user-profile-popover
          [isOpen]="isProfilePopoverOpen"
          [user]="profileUser"
          (closed)="isProfilePopoverOpen = false"
        ></app-user-profile-popover>
      }

      <!-- Organization Directory Modal -->
      @if (isOrgDirectoryOpen) {
        <app-org-directory-modal
          [isOpen]="isOrgDirectoryOpen"
          (closed)="isOrgDirectoryOpen = false"
          (messageMember)="onStartDirectMessage($event)"
        ></app-org-directory-modal>
      }

      <!-- Realtime Notification Toast -->
      @if (notificationService.activeToast(); as toast) {
        <div class="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-700/80 rounded-xl shadow-2xl p-4 text-xs animate-fade-in flex items-start justify-between gap-3">
          <div class="flex items-start gap-2.5 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 text-zinc-700 dark:text-zinc-300">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div class="min-w-0 space-y-1">
              <p class="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{{ toast.title }}</p>
              <p class="text-zinc-600 dark:text-zinc-400 line-clamp-2">{{ toast.message }}</p>
              <div class="pt-1 flex items-center gap-2">
                @if (toast.resourceId) {
                  <button
                    type="button"
                    (click)="handleToastAction(toast)"
                    class="font-semibold text-zinc-900 hover:text-black dark:text-white dark:hover:text-zinc-200 underline underline-offset-2"
                  >
                    Open
                  </button>
                }
              </div>
            </div>
          </div>
          <button
            type="button"
            (click)="notificationService.dismissToast()"
            class="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 rounded-md"
          >
            &times;
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }
      :host textarea.chat-composer-textarea,
      :host .chat-composer-textarea,
      textarea.chat-composer-textarea {
        background-color: transparent !important;
        background: transparent !important;
        border: none !important;
        border-color: transparent !important;
        box-shadow: none !important;
        outline: none !important;
        -webkit-box-shadow: none !important;
      }
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
      @keyframes replyPulse {
        0% { transform: scale(1); filter: brightness(1); }
        50% { transform: scale(1.02); filter: brightness(1.25); }
        100% { transform: scale(1); filter: brightness(1); }
      }
      .reply-highlight-pulse {
        animation: replyPulse 1.2s ease-in-out;
        box-shadow: 0 0 0 2px rgba(244, 63, 94, 0.4) !important;
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
  private readonly walkthroughService = inject(WalkthroughService);
  voiceService = inject(VoiceRecognitionService);
  presenceService = inject(PresenceService);
  notificationService = inject(NotificationService);
  sharingService = inject(SharingService);
  soundService = inject(SoundService);
  private voiceSub?: Subscription;
  private voiceErrorSub?: Subscription;
  private routeSub?: Subscription;
  private queryParamsSub?: Subscription;
  private incomingMsgSub?: Subscription;

  hasUnseenNewMessages = false;

  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('convScrollContainer') convScrollContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('inputArea') inputArea?: ElementRef<HTMLTextAreaElement>;

  conversations: IConversation[] = [];
  filteredConversations: IConversation[] = [];
  activeConversation: IConversation | null = null;
  searchQuery = '';

  // Sharing & Presence modal state
  isShareConvModalOpen = false;
  shareModalConvId = '';
  shareModalConvTitle = '';
  isShareMessageModalOpen = false;
  shareModalMessage: IMessage | null = null;
  isSharedMessageViewerOpen = false;
  sharedMessageToView: IMessageShare | null = null;
  isProfilePopoverOpen = false;
  profileUser: IOrgMember | null = null;
  profilePosition = { top: 0, left: 0 };
  isOrgDirectoryOpen = false;

  // Direct Messaging State
  replyingToMessage: IMessage | null = null;
  isUploadingDmFile = false;
  selectedTimestampMsgId: string | null = null;

  toggleMessageTimestamp(msgId: string, event?: Event): void {
    if (event) event.stopPropagation();
    if (this.selectedTimestampMsgId === msgId) {
      this.selectedTimestampMsgId = null;
    } else {
      this.selectedTimestampMsgId = msgId;
    }
  }

  get isDirectMode(): boolean {
    return this.activeConversation?.type === 'direct';
  }

  get activeDirectPartner(): any {
    if (!this.isDirectMode) return null;
    let basePartner = null;
    if (this.activeConversation?.partner) {
      basePartner = this.activeConversation.partner;
    } else {
      const dm = this.activeDirectConversationInfo;
      if (dm?.partner) basePartner = dm.partner;
    }
    if (!basePartner) return null;

    const partnerId = basePartner.id || (basePartner as any)._id;
    const realTimePres = this.presenceService.getPresence(partnerId);
    if (realTimePres) {
      return {
        ...basePartner,
        presence: {
          ...basePartner.presence,
          ...realTimePres,
        },
      };
    }
    return basePartner;
  }

  isOwnMessage(msg: IMessage): boolean {
    const myId = this.currentUserId;
    if (!myId) return false;
    if (msg.role === 'assistant') {
      // AI responses inside DM belong to the user who requested the AI generation (msg.userId)
      return msg.userId === myId;
    }
    return (msg.userId === myId) || (msg.author?.id === myId);
  }

  getSenderName(msg: IMessage | null): string {
    if (!msg) return '';
    if (this.isOwnMessage(msg)) return 'You';
    if (msg.author) return `${msg.author.firstName || ''} ${msg.author.lastName || ''}`.trim() || 'Colleague';
    const partner = this.activeDirectPartner;
    if (partner) return `${partner.firstName || ''} ${partner.lastName || ''}`.trim() || 'Colleague';
    return 'Colleague';
  }

  getPartnerInitials(partner?: any): string {
    if (!partner) return 'U';
    const f = (partner.firstName || '').charAt(0).toUpperCase();
    const l = (partner.lastName || '').charAt(0).toUpperCase();
    return (f + l) || 'U';
  }

  isConsecutiveMessage(prevMsg: IMessage | undefined, currMsg: IMessage): boolean {
    if (!prevMsg) return false;
    if (this.isOwnMessage(prevMsg) !== this.isOwnMessage(currMsg)) return false;
    if (prevMsg.role !== currMsg.role) return false;
    if (!prevMsg.createdAt || !currMsg.createdAt) return false;
    const diffMs = Math.abs(new Date(currMsg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime());
    return diffMs < 3 * 60 * 1000;
  }

  getDateDivider(prevMsg: IMessage | undefined, currMsg: IMessage): string | null {
    if (!currMsg.createdAt) return null;
    const currDate = new Date(currMsg.createdAt);
    if (!prevMsg || !prevMsg.createdAt) {
      return this.formatDateDivider(currDate);
    }
    const prevDate = new Date(prevMsg.createdAt);
    if (
      currDate.getFullYear() !== prevDate.getFullYear() ||
      currDate.getMonth() !== prevDate.getMonth() ||
      currDate.getDate() !== prevDate.getDate()
    ) {
      return this.formatDateDivider(currDate);
    }
    return null;
  }

  private formatDateDivider(date: Date): string {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  setReplyToMessage(msg: IMessage): void {
    this.replyingToMessage = msg;
    this.focusInput();
  }

  cancelReply(): void {
    this.replyingToMessage = null;
  }

  scrollToOriginalMessage(id?: string, event?: Event): void {
    if (event) event.stopPropagation();
    if (!id) return;
    const el = document.getElementById(`msg-bubble-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('reply-highlight-pulse');
      setTimeout(() => {
        el.classList.remove('reply-highlight-pulse');
      }, 1500);
    }
  }

  triggerDmFileUpload(): void {
    const input = document.getElementById('dm-file-upload-input') as HTMLInputElement;
    if (input) {
      input.value = '';
      input.click();
    }
  }

  onDmFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0 || !this.activeConversation) return;
    const file = input.files[0];
    this.isUploadingDmFile = true;
    this.api.uploadDocument(file).subscribe({
      next: (doc) => {
        this.isUploadingDmFile = false;
        const downloadableFile: IDownloadableFile = {
          documentId: doc.id,
          fileName: doc.originalName || file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
        };
        this.chatState.sendDirectMessage(
          this.activeConversation!.id,
          `Shared file: ${doc.originalName || file.name}`,
          [],
          this.authService.currentUser(),
          downloadableFile,
        ).subscribe({
          next: () => {
            this.shouldScroll = true;
          },
          error: (err) => {
            this.localError = err.error?.message || 'Failed to send attachment';
          },
        });
      },
      error: (err) => {
        this.isUploadingDmFile = false;
        this.localError = err.error?.message || 'Failed to upload file attachment';
      },
    });
  }

  get isViewOnlyCollaborator(): boolean {
    if (!this.activeConversation) return false;
    const shared = this.chatState.sharedConversations().find(
      (s) => s.id === this.activeConversation?.id
    );
    return shared ? shared.permission === 'view' : false;
  }

  get activeSharedConversationInfo(): ISharedConversationItem | null {
    if (!this.activeConversation) return null;
    return this.chatState.sharedConversations().find(
      (s) => s.id === this.activeConversation?.id
    ) || null;
  }

  get activeDirectConversationInfo(): IDirectConversationItem | null {
    if (!this.activeConversation || this.activeConversation.type !== 'direct') return null;
    return this.chatState.directConversations().find(
      (d) => d.id === this.activeConversation?.id
    ) || null;
  }

  get currentUserId(): string {
    return this.authService.currentUser()?.id || '';
  }
  localError = '';
  copiedMessageIdx: number | null = null;
  private copiedMessageTimer?: any;
  private searchDebounceTimer?: any;
  private draftDebounceTimer?: any;

  inputText = '';
  private shouldScroll = false;
  generatingPhaseIndex = 0;
  private generatingInterval: any = null;

  triggerDraftAutosave(): void {
    const targetConvId = this.activeConversation?.id || TEMPORARY_NEW_CHAT_ID;
    if (this.draftDebounceTimer) {
      clearTimeout(this.draftDebounceTimer);
      this.draftDebounceTimer = null;
    }
    this.draftDebounceTimer = setTimeout(() => {
      // Only persist if still on the same conversation or in new chat mode
      const currentActiveId = this.activeConversation?.id || TEMPORARY_NEW_CHAT_ID;
      if (currentActiveId === targetConvId) {
        this.persistActiveDraft(targetConvId);
      }
    }, 300);
  }

  getDisplayContent(msg: IMessage): string {
    if (!msg.content) return '';
    if (msg.generatedChart || (msg.generatedCharts && msg.generatedCharts.length > 0)) {
      return msg.content;
    }
    const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?(?:"chart_type"|"chartType"|"datasets"|"series")[\s\S]*?\})\s*```/gi;
    if (jsonBlockRegex.test(msg.content)) {
      return msg.content.replace(jsonBlockRegex, '').trim();
    }
    return msg.content;
  }

  getDisplayChart(msg: IMessage): IChartSpec | undefined {
    if (msg.generatedChart) return msg.generatedChart;
    if (msg.generatedCharts && msg.generatedCharts.length > 0) return msg.generatedCharts[0];
    if (!msg.content) return undefined;

    const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?(?:"chart_type"|"chartType"|"datasets"|"series")[\s\S]*?\})\s*```/i;
    const match = msg.content.match(jsonBlockRegex);
    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        const rawType = (parsed.chart_type || parsed.chartType || 'line').toLowerCase();
        let typeEnum = ChartType.LINE;
        if (rawType.includes('bar')) typeEnum = ChartType.BAR;
        else if (rawType.includes('pie')) typeEnum = ChartType.PIE;
        else if (rawType.includes('doughnut') || rawType.includes('donut')) typeEnum = ChartType.DOUGHNUT;
        else if (rawType.includes('area')) typeEnum = ChartType.AREA;

        const labels = parsed.data?.labels || parsed.labels || [];
        let series: IChartSeries[] = [];
        if (parsed.data?.datasets && Array.isArray(parsed.data.datasets)) {
          series = parsed.data.datasets.map((d: any) => ({
            name: d.label || d.name || 'Series',
            data: d.data || [],
          }));
        } else if (parsed.series && Array.isArray(parsed.series)) {
          series = parsed.series;
        }

        if (labels.length > 0 && series.length > 0) {
          return {
            chartType: typeEnum,
            title: parsed.title || 'Performance Metric',
            description: parsed.description,
            labels,
            series,
          };
        }
      } catch {
        // Fallback if parsing fails
      }
    }
    return undefined;
  }

  private persistActiveDraft(explicitConvId?: string): void {
    const convId = explicitConvId || this.activeConversation?.id || TEMPORARY_NEW_CHAT_ID;
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
    const resourceIds = lastUserMsg?.referencedResourceIds || [];

    // 0. Explicit Scoped Comparison or File Referencing
    if (resourceIds.length >= 2) {
      if (prompt.includes('this and this') || prompt.includes('these') || prompt.includes('compare') || prompt.includes('both') || prompt.includes('differ')) {
        const phases = [
          `Comparing ${resourceIds.length} files...`,
          `Analyzing cross-file differences & metrics...`,
          `Compiling comparison findings...`,
        ];
        return phases[this.generatingPhaseIndex % phases.length];
      }
    } else if (resourceIds.length === 1) {
      const name = this.getResourceDisplayName(resourceIds[0]);
      if (prompt.includes('download') || prompt.includes('get') || prompt.includes('find')) {
        return `Locating ${name}...`;
      }
      return `Analyzing ${name}...`;
    }

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
    if (resourceIds.length > 0) {
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
    if (this.copiedMessageTimer) {
      clearTimeout(this.copiedMessageTimer);
    }
    if (this.voiceService.isListening) {
      this.voiceService.stopListening();
    }
    this.voiceSub?.unsubscribe();
    this.voiceErrorSub?.unsubscribe();
    this.routeSub?.unsubscribe();
    this.queryParamsSub?.unsubscribe();
    this.incomingMsgSub?.unsubscribe();
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
  isDirectGroupExpanded = true;
  isSharedGroupExpanded = true;
  expandedCollectionIds = new Set<string>();
  draggedConversation: IConversation | null = null;
  dragOverCollectionId: string | null = null;
  isDragOverRecentChats = false;
  isDragOverCollectionsHeader = false;
  private autoScrollRafId: number | null = null;
  private autoScrollSpeed = 0;
  undoToast: { message: string; conversationId: string; previousCollectionId: string | null; timer: any } | null = null;
  downloadingFileIds = new Set<string>();
  fileDownloadError: string | null = null;
  private fileDownloadErrorTimer: any = null;

  isDownloadingFile(id?: string): boolean {
    return !!id && this.downloadingFileIds.has(id);
  }

  formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async downloadChatFile(file?: IDownloadableFile): Promise<void> {
    if (!file || !file.documentId) return;
    if (this.downloadingFileIds.has(file.documentId)) return;

    this.downloadingFileIds.add(file.documentId);
    try {
      await this.api.triggerFileDownload(file.documentId, file.fileName);
    } catch (err: any) {
      console.error('File download error:', err);
      const msg = err?.error?.message || 'This file is restricted from downloading.';
      this.showFileDownloadError(msg);
    } finally {
      this.downloadingFileIds.delete(file.documentId);
    }
  }

  showFileDownloadError(msg: string): void {
    if (this.fileDownloadErrorTimer) {
      clearTimeout(this.fileDownloadErrorTimer);
    }
    this.fileDownloadError = msg;
    this.fileDownloadErrorTimer = setTimeout(() => {
      this.fileDownloadError = null;
    }, 4500);
  }

  get displayedCollections(): ICollection[] {
    if (this.walkthroughService.isDemoMode() && this.collections.length === 0) {
      return this.walkthroughService.demoCollections();
    }
    return this.collections;
  }

  get displayedConversations(): IConversation[] {
    if (this.walkthroughService.isDemoMode() && this.conversations.length === 0) {
      return this.walkthroughService.demoConversations();
    }
    return this.conversations;
  }

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
    this.chatState.loadSharedConversations?.();
    this.chatState.loadDirectConversations?.();
    this.notificationService.fetchNotifications?.();

    // Realtime collaborative incoming message & smart auto-scrolling subscription
    this.incomingMsgSub = this.chatState.incomingMessage$?.subscribe(({ message, conversationId }) => {
      if (this.activeConversation?.id === conversationId) {
        if (this.isUserNearBottom()) {
          this.shouldScroll = true;
          this.hasUnseenNewMessages = false;
        } else {
          this.hasUnseenNewMessages = true;
        }
      }
    });

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

    // Route param subscription for navigating to specific chats (e.g. from Navigation Sidebar DMs or Dashboard collections)
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const routeId = params.get('id');
      if (routeId) {
        // 1. Personal AI conversation
        const found = this.conversations.find((c) => c.id === routeId);
        if (found) {
          if (!this.activeConversation || this.activeConversation.id !== found.id) {
            this.selectConversation(found);
          }
          return;
        }

        // 2. Direct conversation
        const foundDm = this.chatState.directConversations().find((d) => d.id === routeId);
        if (foundDm) {
          if (!this.activeConversation || this.activeConversation.id !== foundDm.id) {
            this.selectDirectConversation(foundDm);
          }
          return;
        }

        // 3. Shared conversation
        const foundShared = this.chatState.sharedConversations().find((s) => s.id === routeId);
        if (foundShared) {
          if (!this.activeConversation || this.activeConversation.id !== foundShared.id) {
            this.selectSharedConversation(foundShared);
          }
          return;
        }

        // 4. Fetch directly from API if not yet loaded in cached arrays
        this.api.getDirectConversation(routeId).subscribe({
          next: (dm) => {
            this.selectDirectConversation(dm);
          },
          error: () => {
            this.api.getConversation(routeId).subscribe({
              next: (conv) => {
                this.selectConversation(conv);
              },
              error: () => {},
            });
          },
        });
      }
    });

    // Query param subscription for navigating to archived chats view
    this.queryParamsSub = this.route.queryParams.subscribe((queryParams) => {
      const wasArchived = this.isArchivedView;
      this.isArchivedView = queryParams['view'] === 'archived';
      if (this.isArchivedView) {
        this.isArchivedGroupExpanded = true;
      }
      if (wasArchived !== this.isArchivedView) {
        this.clearSearch();
        if (this.isArchivedView) {
          if (this.activeConversation && !this.activeConversation.archived) {
            this.activeConversation = null;
          }
        } else {
          if (this.activeConversation && this.activeConversation.archived) {
            const activeChats = this.displayedConversations.filter((c) => !c.archived);
            this.activeConversation = activeChats.length > 0 ? activeChats[0] : null;
          }
        }
      }
    });
  }

  // ---------------- Collection Collapse State Persistence ----------------
  private getCollectionStateStorageKey(): string {
    const userId = this.authService.currentUser()?.id || 'default_user';
    return `syntra_chat_${userId}_collection_state`;
  }

  private loadPersistedCollectionState(): { groupExpanded: boolean; sharedGroupExpanded: boolean; expandedIds: string[] } {
    try {
      const raw = localStorage.getItem(this.getCollectionStateStorageKey());
      if (!raw) return { groupExpanded: true, sharedGroupExpanded: true, expandedIds: [] };
      const parsed = JSON.parse(raw);
      return {
        groupExpanded: typeof parsed.groupExpanded === 'boolean' ? parsed.groupExpanded : true,
        sharedGroupExpanded: typeof parsed.sharedGroupExpanded === 'boolean' ? parsed.sharedGroupExpanded : true,
        expandedIds: Array.isArray(parsed.expandedIds) ? parsed.expandedIds : [],
      };
    } catch {
      return { groupExpanded: true, sharedGroupExpanded: true, expandedIds: [] };
    }
  }

  private savePersistedCollectionState(): void {
    try {
      const payload = {
        groupExpanded: this.isCollectionsGroupExpanded,
        sharedGroupExpanded: this.isSharedGroupExpanded,
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
        this.isSharedGroupExpanded = persisted.sharedGroupExpanded;

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

        // If the active conversation belongs to a collection, ensure its parent collection is expanded
        if (this.activeConversation?.collectionId && colIdsInDb.has(this.activeConversation.collectionId)) {
          this.isCollectionsGroupExpanded = true;
          this.expandedCollectionIds.add(this.activeConversation.collectionId);
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

  toggleSharedSectionCollapse(): void {
    this.isSharedGroupExpanded = !this.isSharedGroupExpanded;
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

  // Chat management state
  openActionMenuConv: IConversation | null = null;
  openActionMenuConvId: string | null = null;
  actionMenuPos: { top: number; left: number; openAbove: boolean; submenuOpenLeft: boolean } = {
    top: 0,
    left: 0,
    openAbove: false,
    submenuOpenLeft: false,
  };
  isCollectionSubmenuOpen = false;
  isArchivedGroupExpanded = false;
  isArchivedView = false;
  isTemporaryMode = false;
  isTemporaryNoticeDismissed = false;
  temporaryConversation: IConversation | null = null;
  previousPersistentConversation: IConversation | null = null;
  pendingCollectionId: string | null = null;
  private isCreatingNewConversation = false;

  toggleActionMenu(conv: IConversation, event: MouseEvent): void {
    event.stopPropagation();
    if (this.openActionMenuConvId === conv.id) {
      this.closeActionMenus();
      return;
    }

    const button = (event.currentTarget as HTMLElement) || (event.target as HTMLElement);
    const rect = button.getBoundingClientRect();
    const menuWidth = 176; // w-44 = 176px
    const menuEstimatedHeight = 160;
    const submenuWidth = 176;

    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;
    const top = openAbove ? Math.max(8, rect.top - 4) : rect.bottom + 4;

    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    const submenuOpenLeft = left + menuWidth + submenuWidth > window.innerWidth - 8;

    this.openActionMenuConv = conv;
    this.openActionMenuConvId = conv.id;
    this.actionMenuPos = { top, left, openAbove, submenuOpenLeft };
    this.isCollectionSubmenuOpen = false;
  }

  onCollectionRowMouseEnter(): void {
    this.isCollectionSubmenuOpen = true;
  }

  onOtherMenuItemMouseEnter(): void {
    this.isCollectionSubmenuOpen = false;
  }

  toggleCollectionSubmenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isCollectionSubmenuOpen = !this.isCollectionSubmenuOpen;
  }

  closeActionMenus(): void {
    this.openActionMenuConvId = null;
    this.openActionMenuConv = null;
    this.isCollectionSubmenuOpen = false;
  }

  toggleArchivedGroupExpand(): void {
    this.isArchivedGroupExpanded = !this.isArchivedGroupExpanded;
  }

  togglePin(conv: IConversation, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.closeActionMenus();
    const newPinned = !conv.pinned;
    conv.pinned = newPinned;

    if (newPinned) {
      this.api.pinConversation(conv.id).subscribe();
    } else {
      this.api.unpinConversation(conv.id).subscribe();
    }
  }

  toggleArchive(conv: IConversation, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.closeActionMenus();
    const newArchived = !conv.archived;
    conv.archived = newArchived;

    if (newArchived) {
      this.api.archiveConversation(conv.id).subscribe({
        next: (updated) => {
          const idx = this.conversations.findIndex((c) => c.id === conv.id);
          if (idx !== -1) {
            this.conversations[idx] = { ...this.conversations[idx], archived: true };
          }
          const fIdx = this.filteredConversations.findIndex((c) => c.id === conv.id);
          if (fIdx !== -1) {
            this.filteredConversations[fIdx] = { ...this.filteredConversations[fIdx], archived: true };
          }
        },
        error: (err) => {
          conv.archived = !newArchived;
          this.modal.alert(err.error?.message || 'Failed to archive chat', 'Error');
        },
      });
      if (!this.isArchivedView && this.activeConversation?.id === conv.id) {
        const remaining = this.displayedConversations.filter((c) => !c.archived);
        this.activeConversation = remaining.length > 0 ? remaining[0] : null;
      }
    } else {
      this.api.unarchiveConversation(conv.id).subscribe({
        next: (updated) => {
          const idx = this.conversations.findIndex((c) => c.id === conv.id);
          if (idx !== -1) {
            this.conversations[idx] = { ...this.conversations[idx], archived: false };
          }
          const fIdx = this.filteredConversations.findIndex((c) => c.id === conv.id);
          if (fIdx !== -1) {
            this.filteredConversations[fIdx] = { ...this.filteredConversations[fIdx], archived: false };
          }
        },
        error: (err) => {
          conv.archived = !newArchived;
          this.modal.alert(err.error?.message || 'Failed to unarchive chat', 'Error');
        },
      });
      if (this.isArchivedView && this.activeConversation?.id === conv.id) {
        const remaining = this.getArchivedChats();
        this.activeConversation = remaining.length > 0 ? remaining[0] : null;
      }
    }
  }

  setConversationCollection(conv: IConversation, collectionId: string | null, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.closeActionMenus();
    const prevCollectionId = conv.collectionId || null;
    if (prevCollectionId === collectionId) return;

    conv.collectionId = collectionId;
    if (collectionId) {
      this.isCollectionsGroupExpanded = true;
      this.expandedCollectionIds.add(collectionId);
      this.savePersistedCollectionState();
    }

    const targetCol = collectionId ? this.collections.find((c) => c.id === collectionId) : null;
    const colName = targetCol ? targetCol.name : 'Recent Chats';

    this.api.moveConversationToCollection(conv.id, collectionId).subscribe({
      next: () => {
        this.showUndoToast(`Moved "${conv.title}" to ${colName}`, conv.id, prevCollectionId);
      },
      error: (err) => {
        conv.collectionId = prevCollectionId;
        this.modal.alert(err.error?.message || 'Failed to move chat', 'Error');
      },
    });
  }

  async openCreateCollectionForConversation(conv: IConversation, event?: MouseEvent): Promise<void> {
    if (event) event.stopPropagation();
    this.closeActionMenus();
    const name = await this.modal.prompt(
      'Enter a name for your new collection:',
      'New Collection',
      '',
      'e.g. Q1 Audits, Project Athena...'
    );
    if (!name || !name.trim()) return;
    const trimmed = name.trim();

    this.api.createCollection({ name: trimmed }).subscribe({
      next: (newCol) => {
        this.collections.unshift(newCol);
        this.expandedCollectionIds.add(newCol.id);
        this.isCollectionsGroupExpanded = true;
        this.savePersistedCollectionState();
        this.setConversationCollection(conv, newCol.id, event);
      },
      error: (err) => {
        this.modal.alert(err.error?.message || 'Failed to create collection', 'Error');
      },
    });
  }

  dismissTemporaryNotice(): void {
    this.isTemporaryNoticeDismissed = true;
  }

  enableTemporaryChat(): void {
    if (this.isTemporaryMode) return;

    // 1. Capture current persistent conversation if available
    if (this.activeConversation && !this.activeConversation.id.startsWith('temp-')) {
      this.persistActiveDraft();
      this.previousPersistentConversation = this.activeConversation;
    }

    // 2. Set temporary mode state
    this.isTemporaryMode = true;
    this.isTemporaryNoticeDismissed = false;

    // 3. Create fresh frontend-only temporary session (no MongoDB record)
    const tempId = 'temp-session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    this.temporaryConversation = {
      id: tempId,
      title: 'Temporary Chat',
      userId: this.authService.currentUser()?.id || '',
      collectionId: null,
      attachedResourceIds: [],
      pinned: false,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 4. Reset composer and memory messages
    this.activeConversation = this.temporaryConversation;
    this.inputText = '';
    this.attachedResources = [];
    this.chatState.setMessages(tempId, []);
    this.dismissError();
    this.focusInput();
  }

  exitTemporaryChat(): void {
    if (!this.isTemporaryMode) return;

    this.isTemporaryMode = false;
    this.isTemporaryNoticeDismissed = false;

    if (this.temporaryConversation) {
      this.chatState.deleteConversationState(this.temporaryConversation.id);
      this.temporaryConversation = null;
    }

    // Return to previous persistent conversation if still available in list
    if (
      this.previousPersistentConversation &&
      this.conversations.some((c) => c.id === this.previousPersistentConversation!.id)
    ) {
      const prev = this.conversations.find((c) => c.id === this.previousPersistentConversation!.id)!;
      this.previousPersistentConversation = null;
      this.selectConversation(prev);
    } else {
      this.previousPersistentConversation = null;
      const activeChats = this.displayedConversations.filter((c) => !c.archived);
      if (activeChats.length > 0) {
        this.selectConversation(activeChats[0]);
      } else {
        this.createNewConversation();
      }
    }
  }

  toggleTemporaryMode(): void {
    if (this.isTemporaryMode) {
      this.exitTemporaryChat();
    } else {
      this.enableTemporaryChat();
    }
  }

  getPinnedChats(): IConversation[] {
    const pool = this.searchQuery ? this.filteredConversations : this.displayedConversations;
    return pool.filter((c) => !c.archived && c.pinned && !c.collectionId);
  }

  getRecentUncollectedChats(): IConversation[] {
    const pool = this.searchQuery ? this.filteredConversations : this.displayedConversations;
    return pool.filter((c) => !c.archived && !c.pinned && !c.collectionId);
  }

  getConversationsForCollection(colId: string): IConversation[] {
    const pool = this.searchQuery ? this.filteredConversations : this.displayedConversations;
    return pool.filter((c) => !c.archived && c.collectionId === colId);
  }

  getArchivedChats(): IConversation[] {
    const pool = this.searchQuery ? this.filteredConversations : this.displayedConversations;
    return pool.filter((c) => !!c.archived);
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
    this.isDragOverRecentChats = false;
    this.isDragOverCollectionsHeader = false;
    this.stopAutoScroll();
  }

  onDragOverCollectionsHeader(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.isDragOverCollectionsHeader = true;

    // Automatically expand the Collections section accordion if closed
    if (!this.isCollectionsGroupExpanded) {
      this.isCollectionsGroupExpanded = true;
      this.savePersistedCollectionState();
    }
  }

  onDragLeaveCollectionsHeader(event: DragEvent): void {
    this.isDragOverCollectionsHeader = false;
  }

  onDropOnCollectionsHeader(event: DragEvent): void {
    event.preventDefault();
    this.isDragOverCollectionsHeader = false;
    this.stopAutoScroll();

    // Ensure collections section is open
    if (!this.isCollectionsGroupExpanded) {
      this.isCollectionsGroupExpanded = true;
      this.savePersistedCollectionState();
    }
  }

  onDragOverScrollContainer(event: DragEvent): void {
    if (!this.draggedConversation || !this.convScrollContainer) return;
    const container = this.convScrollContainer.nativeElement;
    const rect = container.getBoundingClientRect();
    const clientY = event.clientY;

    const topDist = clientY - rect.top;
    const bottomDist = rect.bottom - clientY;
    const THRESHOLD = 55;

    if (topDist >= 0 && topDist < THRESHOLD) {
      const factor = (THRESHOLD - topDist) / THRESHOLD;
      this.autoScrollSpeed = -Math.max(3, Math.round(factor * 16));
      this.startAutoScroll();
    } else if (bottomDist >= 0 && bottomDist < THRESHOLD) {
      const factor = (THRESHOLD - bottomDist) / THRESHOLD;
      this.autoScrollSpeed = Math.max(3, Math.round(factor * 16));
      this.startAutoScroll();
    } else {
      this.stopAutoScroll();
    }
  }

  private startAutoScroll(): void {
    if (this.autoScrollRafId !== null) return;
    const scrollStep = () => {
      if (!this.convScrollContainer || this.autoScrollSpeed === 0) {
        this.stopAutoScroll();
        return;
      }
      this.convScrollContainer.nativeElement.scrollTop += this.autoScrollSpeed;
      this.autoScrollRafId = requestAnimationFrame(scrollStep);
    };
    this.autoScrollRafId = requestAnimationFrame(scrollStep);
  }

  private stopAutoScroll(): void {
    if (this.autoScrollRafId !== null) {
      cancelAnimationFrame(this.autoScrollRafId);
      this.autoScrollRafId = null;
    }
    this.autoScrollSpeed = 0;
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
    this.stopAutoScroll();
    if (!this.draggedConversation) return;

    const conv = this.draggedConversation;
    const prevCollectionId = conv.collectionId || null;

    if (prevCollectionId === colId) return;

    const targetCol = this.displayedCollections.find((c) => c.id === colId);
    const colName = targetCol ? targetCol.name : 'Collection';

    // Optimistically update
    conv.collectionId = colId;

    // Automatically expand main collections group & target collection on drop if collapsed
    let stateChanged = false;
    if (!this.isCollectionsGroupExpanded) {
      this.isCollectionsGroupExpanded = true;
      stateChanged = true;
    }
    if (!this.expandedCollectionIds.has(colId)) {
      this.expandedCollectionIds.add(colId);
      stateChanged = true;
    }
    if (stateChanged) {
      this.savePersistedCollectionState();
    }

    if (this.walkthroughService.isDemoMode()) {
      this.walkthroughService.moveDemoConversation(conv.id, colId);
      this.showUndoToast(`Moved "${conv.title}" to ${colName}`, conv.id, prevCollectionId);
    } else {
      this.api.moveConversationToCollection(conv.id, colId).subscribe({
        next: () => {
          this.showUndoToast(`Moved "${conv.title}" to ${colName}`, conv.id, prevCollectionId);
        },
        error: (err) => {
          conv.collectionId = prevCollectionId;
          alert(err.error?.message || 'Failed to move chat');
        },
      });
    }

    this.draggedConversation = null;
  }

  onDragOverRecentChats(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    if (this.draggedConversation && this.draggedConversation.collectionId) {
      this.isDragOverRecentChats = true;
    }
  }

  onDragLeaveRecentChats(event: DragEvent): void {
    this.isDragOverRecentChats = false;
  }

  onDropOnRecentChats(event: DragEvent): void {
    event.preventDefault();
    this.isDragOverRecentChats = false;
    this.stopAutoScroll();
    if (!this.draggedConversation) return;

    const conv = this.draggedConversation;
    const prevCollectionId = conv.collectionId || null;
    if (!prevCollectionId) return;

    conv.collectionId = null;

    if (this.walkthroughService.isDemoMode()) {
      this.walkthroughService.moveDemoConversation(conv.id, null);
      this.showUndoToast(`Moved "${conv.title}" to Recent Chats`, conv.id, prevCollectionId);
    } else {
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

    this.draggedConversation = null;
  }

  unassignFromCollection(conv: IConversation, event: MouseEvent): void {
    event.stopPropagation();
    const prevCollectionId = conv.collectionId || null;
    conv.collectionId = null;

    if (this.walkthroughService.isDemoMode()) {
      this.walkthroughService.moveDemoConversation(conv.id, null);
      this.showUndoToast(`Moved "${conv.title}" to Recent Chats`, conv.id, prevCollectionId);
    } else {
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

    if (this.walkthroughService.isDemoMode()) {
      this.walkthroughService.moveDemoConversation(conversationId, previousCollectionId);
      return;
    }

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
      if (this.isTemporaryMode) {
        return;
      }
      const routeId = this.route.snapshot.paramMap.get('id');
      if (routeId) {
        const found = convs.find((c) => c.id === routeId);
        if (found) {
          this.selectConversation(found);
        } else {
          this.restoreDraftForConversation(routeId);
        }
      } else if (!this.isArchivedView && convs.length > 0 && !this.activeConversation) {
        const activeConvs = convs.filter((c) => !c.archived);
        if (activeConvs.length > 0) {
          this.selectConversation(activeConvs[0]);
        }
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
      this.api.searchConversations(query, this.isArchivedView ? true : undefined).subscribe({
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
    if (this.draftDebounceTimer) {
      clearTimeout(this.draftDebounceTimer);
      this.draftDebounceTimer = null;
    }

    if (this.activeConversation && this.activeConversation.id !== conv.id) {
      this.persistActiveDraft(this.activeConversation.id);
    }

    // If selecting a persistent chat while in temporary mode, exit temporary mode cleanly
    if (this.isTemporaryMode && conv.id !== this.temporaryConversation?.id) {
      this.isTemporaryMode = false;
      this.isTemporaryNoticeDismissed = false;
      if (this.temporaryConversation) {
        this.chatState.deleteConversationState(this.temporaryConversation.id);
        this.temporaryConversation = null;
      }
      this.previousPersistentConversation = null;
    }

    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      this.isConvCollapsed = true;
    }

    this.pendingCollectionId = null;
    this.isCreatingNewConversation = false;
    this.activeConversation = conv;
    this.hasUnseenNewMessages = false;
    this.chatState.setActiveConversationId?.(conv.id);

    // Auto-expand parent collection if this conversation belongs to one
    if (conv.collectionId) {
      this.isCollectionsGroupExpanded = true;
      this.expandedCollectionIds.add(conv.collectionId);
      this.savePersistedCollectionState();
    }

    this.dismissError();

    // Immediately restore draft for target chat
    this.restoreDraftForConversation(conv.id);

    // Check if messages already in chatState cache (only for real persistent chats)
    if (!conv.id.startsWith('temp-') && !this.chatState.getCachedMessages(conv.id)) {
      this.api.getMessages(conv.id).subscribe({
        next: (msgs) => {
          this.chatState.setMessages(conv.id, msgs);
          if (this.activeConversation?.id === conv.id) {
            this.shouldScroll = true;
          }
        },
        error: () => {
          this.chatState.setMessages(conv.id, []);
        },
      });
    } else {
      this.shouldScroll = true;
    }

    this.scrollToConversation(conv.id);
  }

  scrollToConversation(convId?: string): void {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      if (convId) {
        const itemEl = document.getElementById('conv-item-' + convId);
        if (itemEl) {
          itemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return;
        }
      }
      if (this.convScrollContainer?.nativeElement) {
        this.convScrollContainer.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 60);
  }

  createNewConversation(collectionId?: string | null): void {
    if (this.draftDebounceTimer) {
      clearTimeout(this.draftDebounceTimer);
      this.draftDebounceTimer = null;
    }
    this.persistActiveDraft(this.activeConversation?.id);

    if (this.isTemporaryMode) {
      // Create fresh temporary session without MongoDB call
      if (this.temporaryConversation) {
        this.chatState.deleteConversationState(this.temporaryConversation.id);
      }
      const tempId = 'temp-session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
      this.temporaryConversation = {
        id: tempId,
        title: 'Temporary Chat',
        userId: this.authService.currentUser()?.id || '',
        collectionId: null,
        attachedResourceIds: [],
        pinned: false,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.activeConversation = this.temporaryConversation;
      this.inputText = '';
      this.attachedResources = [];
      this.chatState.setMessages(tempId, []);
      this.dismissError();
      this.focusInput();
      this.scrollToConversation(tempId);
      return;
    }

    // Deferred creation for persistent chat: NO MongoDB call until first message send
    this.pendingCollectionId = collectionId || null;
    this.isCreatingNewConversation = false;
    this.activeConversation = null;
    this.hasUnseenNewMessages = false;
    this.chatState.setActiveConversationId?.(null);
    this.inputText = '';
    this.attachedResources = [];
    this.dismissError();
    this.restoreDraftForConversation(TEMPORARY_NEW_CHAT_ID);
    this.focusInput();
    if (collectionId) {
      this.isCollectionsGroupExpanded = true;
      this.expandedCollectionIds.add(collectionId);
      this.savePersistedCollectionState();
    }
  }

  async deleteConversation(id: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    this.closeActionMenus();
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
        if (this.isArchivedView) {
          const remaining = this.getArchivedChats();
          this.activeConversation = remaining.length > 0 ? remaining[0] : null;
        } else {
          const remaining = this.displayedConversations.filter((c) => !c.archived);
          this.activeConversation = remaining.length > 0 ? remaining[0] : null;
        }
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

  copyMessageText(content: string, msgIdx?: number): void {
    if (!content) return;
    navigator.clipboard
      .writeText(content)
      .then(() => {
        if (msgIdx !== undefined) {
          this.copiedMessageIdx = msgIdx;
          if (this.copiedMessageTimer) {
            clearTimeout(this.copiedMessageTimer);
          }
          this.copiedMessageTimer = setTimeout(() => {
            this.copiedMessageIdx = null;
          }, 2000);
        }
      })
      .catch((err) => {
        console.error('Failed to copy message text:', err);
      });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (!this.isMentionOpen) {
        event.preventDefault();
        this.sendUserMessage();
      }
    }
  }

  triggerMentionMenu(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.isMentionOpen = true;
    this.fetchMentionOptions('');
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
      this.fetchMentionOptions(query);
    } else {
      this.isMentionOpen = false;
    }
  }

  private fetchMentionOptions(query: string): void {
    const q = query.toLowerCase().trim();
    const isDirect = this.activeConversation?.type === 'direct' || this.isDirectMode;

    this.api.searchMentions(query).subscribe((res) => {
      const results: IMentionOption[] = [];

      // If in direct message (or general), prepend Syntra AI invocation option
      if (isDirect || !q || 'syntra'.includes(q) || 'ai'.includes(q)) {
        results.push({
          id: 'syntra-ai',
          name: 'Syntra AI',
          type: 'ai' as any,
          fileType: 'AI',
          status: 'active',
          detail: 'Ask Syntra AI inside this conversation (@Syntra)',
        });
      }

      if (res.results && res.results.length > 0) {
        if (isDirect) {
          // In Direct Messages, only show colleagues/users and Syntra AI. Exclude files, documents, datasets, and folders.
          const userResults = res.results.filter(
            (item) => (item.type as string) === 'user' || (item.type as string) === 'member'
          );
          results.push(...userResults);
        } else {
          results.push(...res.results);
        }
      }

      this.mentionOptions = results;
    });
  }

  onMentionSelected(option: IMentionOption): void {
    const isAi = (option.type as any) === 'ai' || option.id === 'syntra-ai';
    const isUser = (option.type as any) === 'user';

    const val = this.inputText;
    const cursorPos = this.inputArea?.nativeElement?.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const textAfter = val.slice(cursorPos);
    
    // Find last @ before cursor or in the full text
    let atIdx = textBefore.lastIndexOf('@');
    if (atIdx === -1) {
      atIdx = val.lastIndexOf('@');
    }

    if (isAi) {
      if (atIdx !== -1) {
        const afterAt = val.slice(atIdx);
        const spaceIdx = afterAt.indexOf(' ');
        const tokenLen = spaceIdx === -1 ? afterAt.length : spaceIdx;
        const cleanBefore = val.slice(0, atIdx).trimEnd();
        const cleanAfter = val.slice(atIdx + tokenLen).trimStart();
        const replacement = '@Syntra ';
        this.inputText = cleanBefore ? `${cleanBefore} ${replacement}${cleanAfter}` : `${replacement}${cleanAfter}`;
      } else {
        this.inputText = this.inputText ? `@Syntra ${this.inputText}` : '@Syntra ';
      }
    } else if (isUser) {
      if (atIdx !== -1) {
        const afterAt = val.slice(atIdx);
        const spaceIdx = afterAt.indexOf(' ');
        const tokenLen = spaceIdx === -1 ? afterAt.length : spaceIdx;
        const cleanBefore = val.slice(0, atIdx).trimEnd();
        const cleanAfter = val.slice(atIdx + tokenLen).trimStart();
        const replacement = `@${option.name} `;
        this.inputText = cleanBefore ? `${cleanBefore} ${replacement}${cleanAfter}` : `${replacement}${cleanAfter}`;
      }
    } else {
      // Document / dataset / folder resource attachment
      if (!this.attachedResources.some((r) => r.id === option.id)) {
        this.attachedResources.push(option);
      }
      if (atIdx !== -1) {
        const afterAt = val.slice(atIdx);
        const spaceIdx = afterAt.indexOf(' ');
        const tokenLen = spaceIdx === -1 ? afterAt.length : spaceIdx;
        const cleanBefore = val.slice(0, atIdx).trimEnd();
        const cleanAfter = val.slice(atIdx + tokenLen).trimStart();
        this.inputText = cleanBefore && cleanAfter ? `${cleanBefore} ${cleanAfter}` : `${cleanBefore}${cleanAfter}`;
      }
    }

    this.isMentionOpen = false;
    this.triggerDraftAutosave();
    setTimeout(() => {
      this.focusInput();
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
      if (this.isTemporaryMode) {
        this.enableTemporaryChat();
        this.executeSendMessage();
        return;
      }

      if (this.isCreatingNewConversation) return;
      this.isCreatingNewConversation = true;

      const targetColId = this.pendingCollectionId || undefined;
      const initialTitle = this.inputText.trim().slice(0, 30) || 'New Conversation';

      this.api.createConversation({ title: initialTitle, collectionId: targetColId }).subscribe({
        next: (newConv) => {
          this.isCreatingNewConversation = false;
          this.pendingCollectionId = null;
          this.chatDraftService.migrateDraft(TEMPORARY_NEW_CHAT_ID, newConv.id);
          this.conversations.unshift(newConv);
          if (targetColId) {
            this.expandedCollectionIds.add(targetColId);
            this.savePersistedCollectionState();
          }
          this.clearSearch();
          this.activeConversation = newConv;
          this.executeSendMessage();
          this.scrollToConversation(newConv.id);
        },
        error: () => {
          this.isCreatingNewConversation = false;
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

    if (this.isDirectMode) {
      let replyToPreview: IReplyToPreview | undefined;
      let replyToMessageId: string | undefined;

      if (this.replyingToMessage) {
        replyToMessageId = this.replyingToMessage.id;
        replyToPreview = {
          id: this.replyingToMessage.id,
          senderName: this.replyingToMessage.role === 'assistant' ? 'Syntra AI' : this.getSenderName(this.replyingToMessage),
          content: this.replyingToMessage.downloadableFile
            ? `Shared file: ${this.replyingToMessage.downloadableFile.fileName}`
            : (this.replyingToMessage.content || '').slice(0, 150),
          fileName: this.replyingToMessage.downloadableFile?.fileName,
          isAi: this.replyingToMessage.role === 'assistant',
        };
        this.replyingToMessage = null;
      }

      const isAiCall = /@Syntra\b/i.test(content) || /@AI\b/i.test(content);

      if (isAiCall) {
        this.chatState
          .sendMessageStream(convId, content, resourceIds, (updatedConv) => {
            if (this.activeConversation?.id === updatedConv.id) {
              this.activeConversation = updatedConv;
            }
          }, false, replyToPreview, replyToMessageId)
          .then(() => {
            if (this.activeConversation?.id === convId) {
              this.shouldScroll = true;
            }
          })
          .catch((err) => {
            this.chatDraftService.saveDraft(convId, content, sentAttachedResources);
            if (this.activeConversation?.id === convId && !this.inputText) {
              this.inputText = content;
              this.attachedResources = sentAttachedResources;
              this.adjustTextareaHeight();
            }
            this.localError = err.message || 'Failed to get AI response.';
          });
      } else {
        // Pure direct human-to-human message (Zero AI pipeline flash!)
        this.chatState.sendDirectMessage(
          convId,
          content,
          [],
          this.authService.currentUser(),
          undefined,
          replyToPreview,
          replyToMessageId,
        ).subscribe({
          next: () => {
            if (this.activeConversation?.id === convId) {
              this.shouldScroll = true;
            }
          },
          error: (err) => {
            this.chatDraftService.saveDraft(convId, content, sentAttachedResources);
            if (this.activeConversation?.id === convId && !this.inputText) {
              this.inputText = content;
              this.attachedResources = sentAttachedResources;
              this.adjustTextareaHeight();
            }
            this.localError = err.error?.message || 'Failed to send direct message';
          },
        });
      }
      return;
    }

    this.chatState
      .sendMessageStream(convId, content, resourceIds, (updatedConv) => {
        if (!this.isTemporaryMode) {
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
        }
      }, this.isTemporaryMode)
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

  isUserNearBottom(): boolean {
    if (!this.scrollContainer?.nativeElement) return true;
    const el = this.scrollContainer.nativeElement;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  onScrollContainerScrolled(): void {
    if (this.isUserNearBottom()) {
      this.hasUnseenNewMessages = false;
    }
  }

  scrollToBottomSmooth(): void {
    try {
      if (this.scrollContainer?.nativeElement) {
        const el = this.scrollContainer.nativeElement;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    } catch {}
  }

  private scrollToBottom(): void {
    try {
      if (this.scrollContainer?.nativeElement) {
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

  @HostListener('window:resize')
  onWindowResize(): void {
    this.closeActionMenus();
  }

  @HostListener('window:keydown.escape')
  onEscapeKeyDown(): void {
    this.closeActionMenus();
  }

  @HostListener('click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Dismiss any mobile-selected timestamp if clicking outside message bubbles
    if (!target.closest('.group')) {
      this.selectedTimestampMsgId = null;
    }

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

  // ---------------- Sharing & Collaboration Methods ----------------
  selectSharedConversation(sharedItem: ISharedConversationItem): void {
    this.isSharedGroupExpanded = true;
    this.savePersistedCollectionState();
    this.selectConversation(sharedItem);
  }

  async leaveSharedConversation(sharedItem: ISharedConversationItem, event?: MouseEvent): Promise<void> {
    if (event) event.stopPropagation();
    const confirmed = await this.modal.confirmDanger(
      `Leave "${sharedItem.title}"? You will lose access to this conversation unless re-shared.`,
      'Leave Shared Chat',
      'Leave'
    );
    if (!confirmed) return;

    this.sharingService.leaveSharedConversation(sharedItem.id).subscribe({
      next: () => {
        this.chatState.loadSharedConversations();
        if (this.activeConversation?.id === sharedItem.id) {
          this.activeConversation = null;
          this.createNewConversation();
        }
      },
      error: (err) => {
        this.modal.alert(err.error?.message || 'Failed to leave shared chat', 'Error');
      },
    });
  }

  handleHeaderShare(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.activeConversation) return;
    if (this.isTemporaryMode || this.activeConversation.id.startsWith('temp-')) {
      this.modal.alert("Temporary chats can't be shared. Start a regular chat to collaborate.", 'Notice');
      return;
    }
    this.openShareConversationModal(this.activeConversation);
  }

  handleMenuShare(conv: IConversation, event: MouseEvent): void {
    event.stopPropagation();
    this.closeActionMenus();
    if (this.isTemporaryMode || conv.id.startsWith('temp-')) {
      this.modal.alert("Temporary chats can't be shared. Start a regular chat to collaborate.", 'Notice');
      return;
    }
    this.openShareConversationModal(conv);
  }

  openShareConversationModal(conv: IConversation): void {
    this.shareModalConvId = conv.id;
    this.shareModalConvTitle = conv.title;
    this.isShareConvModalOpen = true;
  }

  openShareMessageModal(msg: IMessage, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.isTemporaryMode || this.activeConversation?.id.startsWith('temp-')) {
      this.modal.alert("Messages from temporary chats cannot be shared.", 'Notice');
      return;
    }
    this.shareModalMessage = msg;
    this.isShareMessageModalOpen = true;
  }

  openSharedMessageViewer(msgShare: IMessageShare): void {
    this.sharedMessageToView = msgShare;
    this.isSharedMessageViewerOpen = true;
  }

  openOwnerProfile(owner: IOrgMember, event: MouseEvent): void {
    event.stopPropagation();
    this.profileUser = owner;
    this.isProfilePopoverOpen = true;
  }

  // ---------------- Direct Messaging & Directory Methods ----------------
  openOrgDirectory(): void {
    this.isOrgDirectoryOpen = true;
  }

  onStartDirectMessage(member: IOrgMember): void {
    this.isOrgDirectoryOpen = false;
    this.api.getOrCreateDirectConversation(member.id).subscribe({
      next: (conv) => {
        this.chatState.loadDirectConversations();
        this.selectDirectConversation(conv);
      },
      error: (err) => {
        this.modal.alert(err.error?.message || 'Failed to start conversation with team member', 'Error');
      },
    });
  }

  selectDirectConversation(dm: IDirectConversationItem | IConversation): void {
    const partner = (dm as any).partner;
    const partnerTitle = partner ? `${partner.firstName || ''} ${partner.lastName || ''}`.trim() : '';
    const convToSelect: IConversation = {
      id: dm.id,
      title: (dm as any).title || partnerTitle || 'Direct Message',
      userId: partner?.id || (dm as any).userId || '',
      type: 'direct',
      participants: (dm as any).participants || [],
      unreadCount: (dm as any).unreadCount || 0,
      lastMessage: (dm as any).lastMessage,
      partner: partner,
      attachedResourceIds: [],
      pinned: false,
      archived: false,
      createdAt: (dm as any).createdAt || new Date().toISOString(),
      updatedAt: (dm as any).updatedAt || new Date().toISOString(),
    };
    this.selectConversation(convToSelect);
    this.chatState.markDirectConversationRead(dm.id);
  }

  openDirectPartnerProfile(partner: any, event: MouseEvent): void {
    event.stopPropagation();
    if (!partner) return;
    this.profileUser = {
      id: partner.id,
      firstName: partner.firstName || 'User',
      lastName: partner.lastName || '',
      email: partner.email || '',
      presence: partner.presence || {
        isOnline: this.presenceService.isUserOnline(partner.presence),
      },
    };
    this.isProfilePopoverOpen = true;
  }

  handleToastAction(notification: INotification): void {
    this.notificationService.dismissToast();
    if (notification.type === 'conversation_shared' && notification.resourceId) {
      this.chatState.loadSharedConversations();
      this.sharingService.getSharedConversations().subscribe((sharedList) => {
        const found = sharedList.find((s) => s.id === notification.resourceId);
        if (found) {
          this.selectSharedConversation(found);
        }
      });
    } else if (notification.type === 'message_shared' && notification.resourceId) {
      this.sharingService.getSharedMessage(notification.resourceId).subscribe({
        next: (share) => {
          this.openSharedMessageViewer(share);
        },
        error: (err) => {
          this.modal.alert(err.error?.message || 'Failed to open shared message', 'Error');
        },
      });
    } else if (notification.type === 'direct_message' && notification.resourceId) {
      this.chatState.loadDirectConversations();
      this.api.getDirectConversation(notification.resourceId).subscribe({
        next: (dm) => {
          this.selectDirectConversation(dm);
        },
      });
    }
  }
}
