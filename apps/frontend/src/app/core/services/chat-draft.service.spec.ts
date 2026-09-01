import { ChatDraftService, TEMPORARY_NEW_CHAT_ID } from './chat-draft.service';
import { AuthService } from './auth.service';
import { signal, createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { MentionResourceType } from '@enter-chat/shared-types';

describe('ChatDraftService (Per-Chat Draft Persistence & User Isolation)', () => {
  let service: ChatDraftService;
  let authServiceMock: any;
  let currentUserSignal: any;
  let storageMap: Record<string, string>;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    storageMap = {};

    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn((key: string) => storageMap[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        storageMap[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete storageMap[key];
      }),
      clear: jest.fn(() => {
        storageMap = {};
      }),
    };

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    currentUserSignal = signal({ id: 'user-alpha', email: 'alpha@enterprise.com' });
    authServiceMock = {
      currentUser: currentUserSignal,
    };

    injector = createEnvironmentInjector([
      { provide: AuthService, useValue: authServiceMock },
    ]);

    service = runInInjectionContext(injector, () => new ChatDraftService());
    service.refreshActiveDrafts();
  });

  afterEach(() => {
    injector.destroy();
    jest.clearAllMocks();
  });

  describe('Core Per-Chat Draft Storage & Retrieval', () => {
    it('1. should save draft for a specific conversation ID', () => {
      service.saveDraft('chat-1', 'Hello world for Chat 1');

      const draft = service.getDraft('chat-1');
      expect(draft).not.toBeNull();
      expect(draft?.text).toBe('Hello world for Chat 1');
      expect(service.getDraftText('chat-1')).toBe('Hello world for Chat 1');
    });

    it('2. should maintain independent drafts across different conversations', () => {
      service.saveDraft('chat-1', 'Draft for Chat 1');
      service.saveDraft('chat-2', 'Draft for Chat 2');
      service.saveDraft('chat-3', 'Draft for Chat 3');

      expect(service.getDraftText('chat-1')).toBe('Draft for Chat 1');
      expect(service.getDraftText('chat-2')).toBe('Draft for Chat 2');
      expect(service.getDraftText('chat-3')).toBe('Draft for Chat 3');
      expect(service.getDraftText('chat-nonexistent')).toBe('');
    });

    it('3. should safely persist and restore attached mention resources without corrupting objects', () => {
      const mentions = [
        {
          id: 'doc-123',
          name: 'Q3_Financials.pdf',
          type: MentionResourceType.DOCUMENT,
          fileType: 'pdf',
          status: 'ready',
        },
      ];

      service.saveDraft('chat-with-doc', 'Analyze this quarterly report', mentions);

      const draft = service.getDraft('chat-with-doc');
      expect(draft?.text).toBe('Analyze this quarterly report');
      expect(draft?.attachedResources?.length).toBe(1);
      expect(draft?.attachedResources?.[0].id).toBe('doc-123');
      expect(draft?.attachedResources?.[0].name).toBe('Q3_Financials.pdf');
    });

    it('4. should remove draft entry when text is empty or only whitespace with no attachments', () => {
      service.saveDraft('chat-to-clear', 'Initial draft text');
      expect(service.getDraft('chat-to-clear')).not.toBeNull();

      // Clear draft with empty text
      service.saveDraft('chat-to-clear', '   ', []);
      expect(service.getDraft('chat-to-clear')).toBeNull();
      expect(service.getDraftText('chat-to-clear')).toBe('');
    });

    it('5. should explicitly clear draft when clearDraft is invoked', () => {
      service.saveDraft('chat-delete', 'Some text to delete');
      expect(service.getDraft('chat-delete')).not.toBeNull();

      service.clearDraft('chat-delete');
      expect(service.getDraft('chat-delete')).toBeNull();
    });
  });

  describe('User Isolation & Namespace Protection', () => {
    it('6. should isolate drafts between different authenticated user accounts', () => {
      // User Alpha writes a draft
      currentUserSignal.set({ id: 'user-alpha', email: 'alpha@enterprise.com' });
      service.saveDraft('shared-chat-id', 'Confidential draft from User Alpha');

      expect(service.getDraftText('shared-chat-id')).toBe('Confidential draft from User Alpha');

      // Switch to User Beta
      currentUserSignal.set({ id: 'user-beta', email: 'beta@enterprise.com' });
      service.refreshActiveDrafts();

      // User Beta must NOT see User Alpha's draft
      expect(service.getDraft('shared-chat-id')).toBeNull();
      expect(service.getDraftText('shared-chat-id')).toBe('');

      // User Beta writes their own draft in the same chat ID
      service.saveDraft('shared-chat-id', 'User Beta thoughts');
      expect(service.getDraftText('shared-chat-id')).toBe('User Beta thoughts');

      // Switch back to User Alpha -> Alpha draft intact
      currentUserSignal.set({ id: 'user-alpha', email: 'alpha@enterprise.com' });
      service.refreshActiveDrafts();
      expect(service.getDraftText('shared-chat-id')).toBe('Confidential draft from User Alpha');
    });
  });

  describe('Draft Migration (Temporary to Permanent Conversation IDs)', () => {
    it('7. should migrate draft seamlessly from temporary ID to permanent conversation ID', () => {
      service.saveDraft(TEMPORARY_NEW_CHAT_ID, 'New unsaved conversation draft');
      expect(service.getDraftText(TEMPORARY_NEW_CHAT_ID)).toBe('New unsaved conversation draft');

      // Migrate to backend-assigned ID
      service.migrateDraft(TEMPORARY_NEW_CHAT_ID, 'conv-perm-999');

      expect(service.getDraftText('conv-perm-999')).toBe('New unsaved conversation draft');
      expect(service.getDraft(TEMPORARY_NEW_CHAT_ID)).toBeNull();
    });
  });

  describe('Storage Resilience & In-Memory Fallback', () => {
    it('8. should fallback to in-memory store if localStorage throws quota or access exception', () => {
      // Mock localStorage throwing error (e.g. storage disabled or quota exceeded)
      (window.localStorage.setItem as jest.Mock).mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => {
        service.saveDraft('chat-fallback', 'In-memory preserved draft');
      }).not.toThrow();

      // Should still be retrievable from in-memory cache
      expect(service.getDraftText('chat-fallback')).toBe('In-memory preserved draft');
    });
  });
});
