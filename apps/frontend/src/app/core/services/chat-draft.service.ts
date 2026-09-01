import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { IMentionOption } from '@enter-chat/shared-types';

export interface IChatDraft {
  text: string;
  attachedResources?: IMentionOption[];
  updatedAt?: number;
}

export type ChatDraftMap = Record<string, IChatDraft>;

export const TEMPORARY_NEW_CHAT_ID = '__new_chat__';

@Injectable({
  providedIn: 'root',
})
export class ChatDraftService {
  private authService = inject(AuthService);

  // In-memory fallback map: { [storageKey: string]: ChatDraftMap }
  private inMemoryDrafts = new Map<string, ChatDraftMap>();

  // Reactive signal for live draft tracking
  readonly activeDrafts = signal<ChatDraftMap>({});

  constructor() {
    this.initStorageListener();
    this.refreshActiveDrafts();
  }

  /**
   * Generates a safe, isolated storage key for the currently authenticated user.
   */
  getStorageKey(userId?: string): string {
    const uid = userId || this.authService.currentUser()?.id || 'anonymous';
    return `syntra_chat_drafts_${uid}`;
  }

  /**
   * Initializes multi-tab cross-synchronization listener.
   */
  private initStorageListener(): void {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', (event: StorageEvent) => {
        const currentKey = this.getStorageKey();
        if (event.key === currentKey) {
          this.refreshActiveDrafts();
        }
      });
    }
  }

  /**
   * Reloads drafts from storage into memory / signal.
   */
  refreshActiveDrafts(): void {
    const key = this.getStorageKey();
    const drafts = this.readFromStorage(key);
    this.activeDrafts.set({ ...drafts });
  }

  /**
   * Read drafts from localStorage with in-memory fallback.
   */
  private readFromStorage(key: string): ChatDraftMap {
    try {
      if (typeof localStorage === 'undefined') {
        return this.inMemoryDrafts.get(key) || {};
      }
      const raw = localStorage.getItem(key);
      if (!raw) {
        return this.inMemoryDrafts.get(key) || {};
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Normalize any string-based legacy drafts into IChatDraft
        const normalized: ChatDraftMap = {};
        for (const [id, val] of Object.entries(parsed)) {
          if (typeof val === 'string') {
            if (val.trim()) {
              normalized[id] = { text: val, attachedResources: [], updatedAt: Date.now() };
            }
          } else if (val && typeof (val as any).text === 'string') {
            if (
              (val as any).text.trim() ||
              ((val as any).attachedResources && (val as any).attachedResources.length > 0)
            ) {
              normalized[id] = {
                text: (val as any).text,
                attachedResources: Array.isArray((val as any).attachedResources)
                  ? (val as any).attachedResources
                  : [],
                updatedAt: (val as any).updatedAt || Date.now(),
              };
            }
          }
        }
        return normalized;
      }
      return this.inMemoryDrafts.get(key) || {};
    } catch {
      return this.inMemoryDrafts.get(key) || {};
    }
  }

  /**
   * Write drafts to localStorage with in-memory fallback.
   */
  private writeToStorage(key: string, data: ChatDraftMap): void {
    this.inMemoryDrafts.set(key, { ...data });
    this.activeDrafts.set({ ...data });

    try {
      if (typeof localStorage === 'undefined') return;
      if (Object.keys(data).length === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch {
      // Storage unavailable or quota exceeded; kept safely in memory
    }
  }

  /**
   * Get draft for a specific conversation.
   */
  getDraft(conversationId: string | null | undefined, userId?: string): IChatDraft | null {
    if (!conversationId) return null;
    const key = this.getStorageKey(userId);
    const map = this.readFromStorage(key);
    const draft = map[conversationId];
    if (!draft) return null;
    if (!draft.text?.trim() && (!draft.attachedResources || draft.attachedResources.length === 0)) {
      return null;
    }
    return draft;
  }

  /**
   * Convenience helper to get the draft text only.
   */
  getDraftText(conversationId: string | null | undefined, userId?: string): string {
    const draft = this.getDraft(conversationId, userId);
    return draft ? draft.text : '';
  }

  /**
   * Save draft for a specific conversation.
   */
  saveDraft(
    conversationId: string | null | undefined,
    text: string,
    attachedResources: IMentionOption[] = [],
    userId?: string,
  ): void {
    if (!conversationId) return;
    const key = this.getStorageKey(userId);
    const current = this.readFromStorage(key);

    const trimmedText = text || '';
    const validResources: IMentionOption[] = (attachedResources || [])
      .filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string')
      .map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        fileType: r.fileType || '',
        status: r.status || 'ready',
        detail: r.detail,
        folderPath: r.folderPath,
      }));

    if (!trimmedText.trim() && validResources.length === 0) {
      if (current[conversationId]) {
        delete current[conversationId];
        this.writeToStorage(key, current);
      }
      return;
    }

    current[conversationId] = {
      text: trimmedText,
      attachedResources: validResources,
      updatedAt: Date.now(),
    };

    this.writeToStorage(key, current);
  }

  /**
   * Clear draft for a specific conversation.
   */
  clearDraft(conversationId: string | null | undefined, userId?: string): void {
    if (!conversationId) return;
    const key = this.getStorageKey(userId);
    const current = this.readFromStorage(key);
    if (current[conversationId]) {
      delete current[conversationId];
      this.writeToStorage(key, current);
    }
  }

  /**
   * Migrates draft from a temporary/previous ID to a newly assigned permanent ID.
   */
  migrateDraft(oldConversationId: string, newConversationId: string, userId?: string): void {
    if (!oldConversationId || !newConversationId || oldConversationId === newConversationId) return;
    const key = this.getStorageKey(userId);
    const current = this.readFromStorage(key);
    const existingDraft = current[oldConversationId];

    if (existingDraft) {
      current[newConversationId] = { ...existingDraft };
      delete current[oldConversationId];
      this.writeToStorage(key, current);
    }
  }

  /**
   * Clear all drafts for a user.
   */
  clearAllDrafts(userId?: string): void {
    const key = this.getStorageKey(userId);
    this.inMemoryDrafts.delete(key);
    this.writeToStorage(key, {});
  }
}
