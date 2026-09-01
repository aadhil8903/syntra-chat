import { TestBed } from '@angular/core/testing';
import { ChatComponent } from './chat.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatStateService } from '../../core/services/chat-state.service';
import { ChatDraftService, TEMPORARY_NEW_CHAT_ID } from '../../core/services/chat-draft.service';
import { ModalDialogService } from '../../core/services/modal-dialog.service';
import { PdfReportService } from '../../core/services/pdf-report.service';
import { CollectionsWalkthroughService } from '../../core/services/collections-walkthrough.service';
import { VoiceRecognitionService } from '../../core/services/voice-recognition.service';
import { provideRouter } from '@angular/router';
import { of, Subject, EMPTY } from 'rxjs';
import { signal, NO_ERRORS_SCHEMA } from '@angular/core';
import { IConversation, MentionResourceType } from '@enter-chat/shared-types';

describe('ChatComponent (Per-Chat Draft Persistence & Switching)', () => {
  let component: ChatComponent;
  let chatDraftServiceMock: any;
  let chatStateMock: any;
  let apiServiceMock: any;
  let modalMock: any;

  let mockDraftStore: Record<string, any>;

  const mockConvA: IConversation = {
    id: 'conv-a',
    title: 'Chat Alpha',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockConvB: IConversation = {
    id: 'conv-b',
    title: 'Chat Beta',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    mockDraftStore = {};

    apiServiceMock = {
      getConversations: jest.fn().mockReturnValue(of([mockConvA, mockConvB])),
      getMessages: jest.fn().mockReturnValue(of([])),
      createConversation: jest.fn((dto: any) =>
        of({ id: 'conv-new-123', title: dto?.title || 'New Chat', userId: 'user-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as IConversation)
      ),
      deleteConversation: jest.fn().mockReturnValue(of({ success: true })),
      searchMentions: jest.fn().mockReturnValue(of({ results: [] })),
      getCollections: jest.fn().mockReturnValue(of([])),
      getRecentStarters: jest.fn().mockReturnValue(of([])),
      searchConversations: jest.fn().mockReturnValue(of([])),
      getDocuments: jest.fn().mockReturnValue(of([])),
      getDatasets: jest.fn().mockReturnValue(of([])),
    };

    chatStateMock = {
      isGenerating: jest.fn().mockReturnValue(false),
      activeGenerationsCount: jest.fn().mockReturnValue(0),
      getCachedMessages: jest.fn().mockReturnValue([]),
      setMessages: jest.fn(),
      deleteConversationState: jest.fn(),
      getError: jest.fn().mockReturnValue(''),
      clearError: jest.fn(),
      sendMessageStream: jest.fn().mockResolvedValue(undefined),
      generationStates: signal({}),
      activeGenerations: signal([]),
    };

    chatDraftServiceMock = {
      getDraft: jest.fn((id: string) => mockDraftStore[id] || null),
      getDraftText: jest.fn((id: string) => mockDraftStore[id]?.text || ''),
      saveDraft: jest.fn((id: string, text: string, resources?: any[]) => {
        if (!text?.trim() && (!resources || resources.length === 0)) {
          delete mockDraftStore[id];
        } else {
          mockDraftStore[id] = { text, attachedResources: resources || [] };
        }
      }),
      clearDraft: jest.fn((id: string) => {
        delete mockDraftStore[id];
      }),
      migrateDraft: jest.fn((oldId: string, newId: string) => {
        if (mockDraftStore[oldId]) {
          mockDraftStore[newId] = mockDraftStore[oldId];
          delete mockDraftStore[oldId];
        }
      }),
      activeDrafts: signal({}),
    };

    modalMock = {
      confirmDanger: jest.fn().mockResolvedValue(true),
      confirm: jest.fn().mockResolvedValue(true),
    };

    const voiceTranscript$ = new Subject();
    const voiceError$ = new Subject();

    await TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiServiceMock },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'user-1', email: 'test@test.com', firstName: 'Test', lastName: 'User', role: 'user' }) } },
        { provide: ChatStateService, useValue: chatStateMock },
        { provide: ChatDraftService, useValue: chatDraftServiceMock },
        { provide: ModalDialogService, useValue: modalMock },
        { provide: PdfReportService, useValue: { exportFullConversation: jest.fn() } },
        { provide: CollectionsWalkthroughService, useValue: { checkAndTrigger: jest.fn() } },
        { provide: VoiceRecognitionService, useValue: { isListening: false, transcript$: voiceTranscript$.asObservable(), error$: voiceError$.asObservable(), toggleListening: jest.fn(), stopListening: jest.fn() } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(ChatComponent, {
        set: { template: '<div></div>' },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(ChatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Chat Switching & Draft Persistence', () => {
    it('1. should persist Chat A draft and load Chat B draft when switching conversations', () => {
      component.selectConversation(mockConvA);
      component.inputText = 'Draft for Alpha conversation';
      component.attachedResources = [
        { id: 'res-1', name: 'File1.txt', type: MentionResourceType.DOCUMENT, fileType: 'txt', status: 'ready' },
      ];

      component.selectConversation(mockConvB);

      expect(chatDraftServiceMock.saveDraft).toHaveBeenCalledWith(
        'conv-a',
        'Draft for Alpha conversation',
        expect.arrayContaining([expect.objectContaining({ id: 'res-1' })]),
      );
    });

    it('2. should restore Chat A draft when switching back from Chat B', () => {
      // Select Chat A and type a draft
      component.selectConversation(mockConvA);
      component.inputText = 'Pre-existing alpha draft';

      // Switch to Chat B — should save A's draft, load B (empty)
      component.selectConversation(mockConvB);
      expect(chatDraftServiceMock.saveDraft).toHaveBeenCalledWith('conv-a', 'Pre-existing alpha draft', []);

      // Type something in B
      component.inputText = 'Beta draft';

      // Switch back to A — should save B, restore A
      component.selectConversation(mockConvA);

      expect(chatDraftServiceMock.saveDraft).toHaveBeenCalledWith('conv-b', 'Beta draft', []);
      expect(component.inputText).toBe('Pre-existing alpha draft');
    });

    it('3. should start new conversation with empty composer', () => {
      component.selectConversation(mockConvA);
      component.inputText = 'Alpha draft before new';

      component.createNewConversation();

      expect(chatDraftServiceMock.saveDraft).toHaveBeenCalledWith('conv-a', 'Alpha draft before new', []);
    });
  });

  describe('Send Message & Failure Safety', () => {
    it('4. should clear draft on successful message submission', () => {
      component.selectConversation(mockConvA);
      component.inputText = 'Question to send';
      mockDraftStore['conv-a'] = { text: 'Question to send', attachedResources: [] };

      component.sendUserMessage();

      expect(component.inputText).toBe('');
      expect(chatDraftServiceMock.clearDraft).toHaveBeenCalledWith('conv-a');
    });

    it('5. should restore draft if message streaming fails', async () => {
      chatStateMock.sendMessageStream.mockRejectedValue(new Error('Network failure'));

      component.selectConversation(mockConvA);
      component.inputText = 'Important unsent prompt';

      component.sendUserMessage();
      await new Promise((r) => setTimeout(r, 50));

      expect(chatDraftServiceMock.saveDraft).toHaveBeenCalledWith('conv-a', 'Important unsent prompt', []);
      expect(component.inputText).toBe('Important unsent prompt');
    });
  });

  describe('Component Lifecycle & Navigation', () => {
    it('6. should persist active draft on ngOnDestroy', () => {
      component.selectConversation(mockConvA);
      component.inputText = 'Draft before navigating away';

      component.ngOnDestroy();

      expect(chatDraftServiceMock.saveDraft).toHaveBeenCalledWith('conv-a', 'Draft before navigating away', []);
    });

    it('7. should persist active draft on window beforeunload', () => {
      component.selectConversation(mockConvA);
      component.inputText = 'Draft before browser refresh';

      component.onBeforeUnload();

      expect(chatDraftServiceMock.saveDraft).toHaveBeenCalledWith('conv-a', 'Draft before browser refresh', []);
    });

    it('8. should remove draft when conversation is deleted', async () => {
      component.conversations = [mockConvA, mockConvB];
      component.filteredConversations = [mockConvA, mockConvB];
      component.activeConversation = mockConvA;

      const mouseEvent = new MouseEvent('click');
      await component.deleteConversation('conv-a', mouseEvent);

      expect(chatDraftServiceMock.clearDraft).toHaveBeenCalledWith('conv-a');
    });
  });
});
