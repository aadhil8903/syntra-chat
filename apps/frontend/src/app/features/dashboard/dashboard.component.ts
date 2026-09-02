import { Component, OnInit, OnDestroy, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatStateService } from '../../core/services/chat-state.service';
import { VoiceRecognitionService } from '../../core/services/voice-recognition.service';
import { IDocument, IDataset, IConversation, ICollection, IMentionOption } from '@enter-chat/shared-types';
import { MentionAutocompleteComponent } from '../chat/mention-autocomplete/mention-autocomplete.component';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface IQuickAction {
  label: string;
  promptText: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MentionAutocompleteComponent],
  template: `
    <div class="p-4 sm:p-6 lg:p-10 max-w-5xl mx-auto space-y-6 sm:space-y-10 animate-fade-in text-[#fafafa]">
      <!-- 1. Hero Greeting Section -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div class="space-y-1">
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {{ greeting() }}, {{ user()?.firstName || 'there' }}.
          </h1>
          <p class="text-sm text-[#a1a1aa] font-medium">
            What are you working on?
          </p>
        </div>
        <button
          type="button"
          (click)="createNewChat()"
          class="px-4 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-white border border-[#27272a] hover:border-zinc-700 text-xs font-semibold flex items-center gap-2 transition-colors flex-shrink-0 shadow-sm self-start sm:self-auto"
          title="Start fresh new chat"
        >
          <svg class="w-4 h-4 text-white" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>New Chat</span>
        </button>
      </div>

      <!-- 2. Primary Action: AI Composer Box -->
      <div class="space-y-3">
        <div class="relative bg-[#111114] border border-[#27272a] focus-within:border-white rounded-2xl p-3 sm:p-4 transition-all">
          <!-- Autocomplete Dropdown Component -->
          <app-mention-autocomplete
            [isOpen]="isMentionOpen"
            [options]="mentionOptions"
            (optionSelected)="onMentionSelected($event)"
            (closed)="isMentionOpen = false"
          ></app-mention-autocomplete>

          <!-- Attached Mention Chips -->
          @if (attachedResources.length > 0) {
            <div class="flex flex-wrap gap-2 mb-2.5">
              @for (res of attachedResources; track res.id) {
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#18181b] border border-[#3f3f46] text-white text-xs font-mono">
                  <span>&#64;{{ res.name }}</span>
                  <button (click)="removeAttachedResource(res.id)" class="hover:text-white font-bold ml-1" title="Remove attachment">×</button>
                </span>
              }
            </div>
          }

          <div class="flex items-start gap-2">
            <!-- Textarea Composer Input -->
            <textarea
              #inputArea
              [(ngModel)]="inputText"
              (input)="onInputChange($event)"
              (keydown)="onKeyDown($event)"
              placeholder="Ask Syntra about your documents, data, or anything..."
              rows="2"
              class="w-full bg-transparent border-0 text-white text-sm sm:text-base px-2 py-1 focus:outline-none resize-none min-h-[56px] max-h-48 leading-relaxed placeholder:text-zinc-500"
              aria-label="Ask Syntra AI"
            ></textarea>

            <!-- Voice / Microphone Button in Top-Right of Input Box -->
            <button
              type="button"
              (click)="toggleVoiceInput()"
              [ngClass]="voiceService.isListening ? 'bg-white text-black font-semibold border border-white' : 'text-zinc-400 hover:text-white hover:bg-[#18181b] border border-transparent hover:border-[#27272a]'"
              class="p-2 rounded-xl text-xs flex items-center justify-center transition-all flex-shrink-0 mt-0.5"
              [title]="voiceService.isListening ? 'Listening... Click to stop recording' : 'Voice input (Click to speak)'"
            >
              <svg class="w-4 h-4" [ngClass]="voiceService.isListening ? 'text-black' : 'text-zinc-400 hover:text-white'" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-[#27272a]/80 mt-1">
            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="triggerMentionMenu()"
                class="px-2.5 py-1.5 rounded-lg text-[#a1a1aa] hover:text-white hover:bg-[#18181b] border border-[#27272a] text-xs flex items-center gap-1.5 transition-colors"
                title="Attach & mention document or dataset"
              >
                <span class="text-white font-bold">&#64;</span>
                <span class="font-medium">Mention</span>
              </button>

              <span class="text-[11px] text-[#71717a] hidden sm:inline font-mono">Folder & File Scoped AI</span>
            </div>

            <button
              type="button"
              (click)="submitComposer()"
              [disabled]="isSubmitting || (!inputText.trim() && attachedResources.length === 0)"
              class="px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0"
              title="Submit prompt (Enter)"
            >
              <span>{{ isSubmitting ? 'Starting...' : 'Ask Syntra' }}</span>
              <svg class="w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>

        <!-- 3. Quick Action Chips -->
        <div class="flex items-center gap-2 flex-wrap pt-1">
          <span class="text-xs text-[#71717a] font-medium mr-1">Quick actions:</span>
          @for (action of quickActions; track action.label) {
            <button
              type="button"
              (click)="applyQuickAction(action)"
              class="px-3 py-1.5 rounded-xl bg-[#111114] hover:bg-[#18181b] border border-[#27272a] hover:border-zinc-600 text-xs text-[#a1a1aa] hover:text-white transition-all flex items-center gap-1.5"
            >
              <span>{{ action.label }}</span>
            </button>
          }
        </div>
      </div>

      <!-- 4. Main Secondary Section: Recent Chats -->
      <div class="bg-[#111114] border border-[#27272a] rounded-2xl p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-base font-semibold text-white tracking-tight">Recent Chats</h2>
            <span class="text-xs text-[#71717a] font-mono">({{ conversations.length }})</span>
          </div>
          <a routerLink="/chat" class="text-xs text-white hover:underline font-medium">View all</a>
        </div>

        @if (conversations.length === 0) {
          <div class="text-center py-8 space-y-2">
            <p class="text-sm text-zinc-300 font-medium">No conversations yet.</p>
            <p class="text-xs text-[#71717a]">Start a conversation with Syntra above to get started.</p>
          </div>
        } @else {
          <div class="divide-y divide-[#27272a]/60">
            @for (c of conversations.slice(0, 5); track c.id) {
              <a
                [routerLink]="['/chat', c.id]"
                class="flex items-center justify-between py-3 px-2 -mx-2 rounded-xl hover:bg-[#18181b] transition-colors group cursor-pointer"
              >
                <div class="flex items-center gap-3 truncate min-w-0 pr-4">
                  <div class="w-7 h-7 rounded-lg bg-[#18181b] border border-[#3f3f46] text-white flex items-center justify-center flex-shrink-0 group-hover:border-zinc-400 transition-colors">
                    <svg class="w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <span class="text-sm text-[#e4e4e7] group-hover:text-white truncate font-medium">
                    {{ c.title }}
                  </span>
                </div>
                <span class="text-xs text-[#71717a] font-mono flex-shrink-0">
                  {{ formatChatDate(c.updatedAt) }}
                </span>
              </a>
            }
          </div>
        }
      </div>

      <!-- 5. Bottom Two-Column Grid: Collections Preview & Knowledge Preview -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Compact Collections Preview -->
        <div class="bg-[#111114] border border-[#27272a] rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-semibold text-white tracking-tight">Collections</h3>
                <span class="text-xs text-[#71717a] font-mono">({{ collections.length }})</span>
              </div>
              <a routerLink="/chat" class="text-xs text-white hover:underline font-medium">View all</a>
            </div>

            @if (collections.length === 0) {
              <div class="py-6 text-center text-xs text-[#71717a]">
                No collections created yet. Group sibling chats in the Chat sidebar for shared context.
              </div>
            } @else {
              <div class="space-y-1.5 pt-1">
                @for (col of collections.slice(0, 4); track col.id) {
                  <div class="rounded-xl bg-[#0c0c0e] border border-[#27272a] p-2.5 space-y-1">
                    <div
                      (click)="toggleCollection(col.id)"
                      class="flex items-center justify-between cursor-pointer text-xs group"
                    >
                      <div class="flex items-center gap-2 truncate">
                        <svg
                          class="w-3 h-3 text-zinc-500 transition-transform flex-shrink-0"
                          [ngClass]="expandedColIds.has(col.id) ? 'rotate-90 text-zinc-300' : ''"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                        </svg>
                        <span class="font-medium text-zinc-200 group-hover:text-white truncate">📁 {{ col.name }}</span>
                      </div>
                      <span class="text-[10px] text-zinc-500 font-mono">
                        {{ getChatsForCollection(col.id).length }} chats
                      </span>
                    </div>

                    @if (expandedColIds.has(col.id)) {
                      <div class="pl-5 pt-1 space-y-1 border-t border-[#27272a]/40 mt-1">
                        @for (chat of getChatsForCollection(col.id).slice(0, 3); track chat.id) {
                          <a
                            [routerLink]="['/chat', chat.id]"
                            class="block text-[11px] text-zinc-400 hover:text-white truncate py-0.5"
                          >
                            {{ chat.title }}
                          </a>
                        }
                        @if (getChatsForCollection(col.id).length === 0) {
                          <span class="text-[10px] text-zinc-600 italic">Empty collection</span>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
          <p class="text-[11px] text-[#71717a] pt-2">Chats inside a collection share contextual memory.</p>
        </div>

        <!-- Compact Knowledge Preview -->
        <div class="bg-[#111114] border border-[#27272a] rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-semibold text-white tracking-tight">Knowledge</h3>
              </div>
              <a routerLink="/documents" class="text-xs text-white hover:underline font-medium">View all</a>
            </div>

            <!-- Subtle Count Summary Pill -->
            <div class="text-xs text-zinc-400 font-mono">
              <span>{{ documents.length }} documents</span>
              <span class="text-zinc-600 mx-1.5">·</span>
              <span>{{ datasets.length }} datasets</span>
            </div>

            <!-- Recently Added Knowledge Items -->
            <div class="space-y-1.5 pt-1">
              @for (item of recentKnowledgeItems.slice(0, 3); track item.id) {
                <div class="flex items-center justify-between p-2.5 rounded-xl bg-[#0c0c0e] border border-[#27272a]">
                  <div class="flex items-center gap-2.5 truncate">
                    <span class="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#18181b] text-zinc-300 border border-[#3f3f46]">
                      {{ item.fileType }}
                    </span>
                    <span class="text-xs text-zinc-200 truncate">{{ item.originalName }}</span>
                  </div>
                  <span class="text-[10px] text-zinc-500 font-mono">
                    {{ item.type === 'dataset' ? (item.totalRows || 0) + ' rows' : (item.chunkCount || 0) + ' chunks' }}
                  </span>
                </div>
              }
              @if (recentKnowledgeItems.length === 0) {
                <div class="py-4 text-center text-xs text-[#71717a]">
                  No accessible documents or datasets found.
                </div>
              }
            </div>
          </div>
          <p class="text-[11px] text-[#71717a] pt-2">Grounded retrieval with strict ACL authorization.</p>
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private chatState = inject(ChatStateService);
  voiceService = inject(VoiceRecognitionService);
  private voiceSub?: Subscription;

  @ViewChild('inputArea') inputArea?: ElementRef<HTMLTextAreaElement>;

  user = this.auth.currentUser;
  documents: IDocument[] = [];
  datasets: IDataset[] = [];
  conversations: IConversation[] = [];
  collections: ICollection[] = [];
  expandedColIds = new Set<string>();

  // AI Composer State
  inputText = '';
  isSubmitting = false;
  isMentionOpen = false;
  mentionOptions: IMentionOption[] = [];
  attachedResources: IMentionOption[] = [];

  readonly quickActions: IQuickAction[] = [
    { label: 'Analyze data', promptText: 'Analyze dataset trends and provide a statistical summary.' },
    { label: 'Search documents', promptText: 'Search my documents for relevant insights.' },
    { label: 'Compare files', promptText: 'Compare the following files and highlight key differences.' },
  ];

  greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  get recentKnowledgeItems(): any[] {
    const docs = this.documents.map((d) => ({ ...d, type: 'document' }));
    const data = this.datasets.map((d) => ({ ...d, type: 'dataset' }));
    return [...docs, ...data].slice(0, 4);
  }

  private voiceBaseText = '';

  ngOnInit(): void {
    forkJoin({
      docs: this.api.getDocuments().pipe(catchError(() => of([]))),
      datasets: this.api.getDatasets().pipe(catchError(() => of([]))),
      convs: this.api.getConversations().pipe(catchError(() => of([]))),
      cols: this.api.getCollections().pipe(catchError(() => of([]))),
    }).subscribe(({ docs, datasets, convs, cols }) => {
      this.documents = docs;
      this.datasets = datasets;
      this.conversations = convs;
      this.collections = cols;
      if (cols.length > 0) {
        this.expandedColIds.add(cols[0].id);
      }
    });

    // Voice recognition subscription
    this.voiceSub = this.voiceService.transcript$.subscribe((res) => {
      if (res.transcript) {
        this.inputText = this.voiceBaseText ? `${this.voiceBaseText} ${res.transcript}` : res.transcript;
        this.adjustTextareaHeight();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.voiceService.isListening) {
      this.voiceService.stopListening();
    }
    this.voiceSub?.unsubscribe();
  }

  toggleVoiceInput(): void {
    if (!this.voiceService.isListening) {
      this.voiceBaseText = this.inputText.trimEnd();
    }
    this.voiceService.toggleListening();
  }

  private adjustTextareaHeight(): void {
    if (this.inputArea?.nativeElement) {
      this.inputArea.nativeElement.style.height = 'auto';
      this.inputArea.nativeElement.style.height = `${Math.min(this.inputArea.nativeElement.scrollHeight, 240)}px`;
    }
  }

  createNewChat(): void {
    this.router.navigate(['/chat']);
  }

  submitComposer(): void {
    const text = this.inputText.trim();
    if (!text && this.attachedResources.length === 0) return;
    if (this.isSubmitting) return;

    this.isSubmitting = true;
    const resourceIds = this.attachedResources.map((r) => r.id);

    // Create a new conversation and seamlessly send the prompt
    this.api.createConversation({ title: text.slice(0, 30) || 'New AI Session' }).subscribe({
      next: (newConv) => {
        // Send the initial user message into the newly created conversation stream
        this.chatState.sendMessageStream(newConv.id, text, resourceIds);
        // Navigate directly to the active chat
        this.router.navigate(['/chat', newConv.id]);
      },
      error: () => {
        this.isSubmitting = false;
        this.router.navigate(['/chat']);
      },
    });
  }

  applyQuickAction(action: IQuickAction): void {
    if (this.inputText.trim()) {
      this.inputText = `${action.promptText} ${this.inputText.trim()}`.trim();
    } else {
      this.inputText = action.promptText;
    }
    if (this.inputArea?.nativeElement) {
      this.inputArea.nativeElement.focus();
    }
  }

  triggerMentionMenu(): void {
    this.isMentionOpen = true;
    this.api.searchMentions('').subscribe((res) => {
      this.mentionOptions = res.results || [];
    });
  }

  onInputChange(event: Event): void {
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

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (!this.isMentionOpen) {
        event.preventDefault();
        this.submitComposer();
      }
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
    setTimeout(() => {
      if (this.inputArea?.nativeElement) {
        this.inputArea.nativeElement.focus();
        const newPos = atIdx !== -1 ? atIdx : this.inputText.length;
        this.inputArea.nativeElement.setSelectionRange(newPos, newPos);
      }
    }, 50);
  }

  removeAttachedResource(id: string): void {
    this.attachedResources = this.attachedResources.filter((r) => r.id !== id);
  }

  toggleCollection(colId: string): void {
    if (this.expandedColIds.has(colId)) {
      this.expandedColIds.delete(colId);
    } else {
      this.expandedColIds.add(colId);
    }
  }

  getChatsForCollection(colId: string): IConversation[] {
    return this.conversations.filter((c) => c.collectionId === colId);
  }

  formatChatDate(dateStr?: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return 'Today';
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
