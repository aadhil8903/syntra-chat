import { TestBed } from '@angular/core/testing';
import { ChatComponent } from './chat.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatStateService } from '../../core/services/chat-state.service';
import { ChatDraftService, TEMPORARY_NEW_CHAT_ID } from '../../core/services/chat-draft.service';
import { ModalDialogService } from '../../core/services/modal-dialog.service';
import { PdfReportService } from '../../core/services/pdf-report.service';
import { WalkthroughService } from '../../core/services/walkthrough.service';
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
      moveConversationToCollection: jest.fn().mockReturnValue(of({ success: true })),
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

    let isDemoModeSig = signal(false);
    let demoColsSig = signal<ICollection[]>([
      { id: 'demo-col-titan', name: 'Project Titan', userId: 'demo-user', createdAt: '', updatedAt: '' },
    ]);
    let demoConvsSig = signal<IConversation[]>([
      { id: 'demo-conv-1', title: 'Sprint Planning & Milestones', collectionId: null, userId: 'demo-user', createdAt: '', updatedAt: '' },
    ]);

    const collectionsWalkthroughMock = {
      checkAndTrigger: jest.fn(),
      isDemoMode: isDemoModeSig,
      demoCollections: demoColsSig,
      demoConversations: demoConvsSig,
      start: jest.fn((idx = 0) => {
        isDemoModeSig.set(true);
      }),
      finish: jest.fn(() => {
        isDemoModeSig.set(false);
        demoColsSig.set([]);
        demoConvsSig.set([]);
      }),
      skip: jest.fn(() => {
        isDemoModeSig.set(false);
        demoColsSig.set([]);
        demoConvsSig.set([]);
      }),
      moveDemoConversation: jest.fn((convId: string, colId: string | null) => {
        demoConvsSig.set(
          demoConvsSig().map((c) => (c.id === convId ? { ...c, collectionId: colId } : c))
        );
      }),
    };

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
        { provide: WalkthroughService, useValue: collectionsWalkthroughMock },
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

    it('9. should automatically expand parent collection when selecting a chat belonging to a collection', () => {
      const convInCol: IConversation = {
        id: 'conv-col-1',
        title: 'Project Titan Database Details',
        collectionId: 'col-test-2',
        userId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      component.collections = [{ id: 'col-test-2', name: 'test2', userId: 'user-1', createdAt: '', updatedAt: '' }];
      component.isCollectionsGroupExpanded = false;
      component.expandedCollectionIds = new Set();

      component.selectConversation(convInCol);

      expect(component.isCollectionsGroupExpanded).toBe(true);
      expect(component.isCollectionExpanded('col-test-2')).toBe(true);
    });
  });

  describe('Spec Round 28 — Drag-and-Drop Refinements & Demo Walkthrough', () => {
    let walkthroughService: WalkthroughService;

    beforeEach(() => {
      walkthroughService = TestBed.inject(WalkthroughService);
    });

    it('10. should handle auto-scroll calculation during drag over scroll container', () => {
      const mockScrollDiv = document.createElement('div');
      Object.defineProperty(mockScrollDiv, 'getBoundingClientRect', {
        value: () => ({ top: 100, bottom: 600, height: 500, left: 0, right: 300, width: 300 }),
      });
      component.convScrollContainer = { nativeElement: mockScrollDiv } as any;
      component.draggedConversation = mockConvA;

      // Drag near top edge (clientY = 110 -> 10px from top)
      const topEvent = { clientY: 110 } as DragEvent;
      component.onDragOverScrollContainer(topEvent);
      expect((component as any).autoScrollSpeed).toBeLessThan(0);

      // Drag in middle (clientY = 350 -> no scroll)
      const midEvent = { clientY: 350 } as DragEvent;
      component.onDragOverScrollContainer(midEvent);
      expect((component as any).autoScrollSpeed).toBe(0);

      // Drag near bottom edge (clientY = 590 -> 10px from bottom)
      const bottomEvent = { clientY: 590 } as DragEvent;
      component.onDragOverScrollContainer(bottomEvent);
      expect((component as any).autoScrollSpeed).toBeGreaterThan(0);

      // Drag end stops auto-scroll
      component.onDragEndChat();
      expect((component as any).autoScrollSpeed).toBe(0);
      expect(component.draggedConversation).toBeNull();
    });

    it('11. should allow dragging a chat out of a collection into Recent Chats drop zone', () => {
      const convInCol: IConversation = {
        ...mockConvA,
        collectionId: 'col-1',
      };
      component.conversations = [convInCol];
      component.draggedConversation = convInCol;

      const dropEvent = { preventDefault: jest.fn() } as unknown as DragEvent;
      component.onDropOnRecentChats(dropEvent);

      expect(dropEvent.preventDefault).toHaveBeenCalled();
      expect(convInCol.collectionId).toBeNull();
      expect(apiServiceMock.moveConversationToCollection).toHaveBeenCalledWith('conv-a', null);
      expect(component.undoToast).toBeTruthy();
      expect(component.undoToast?.message).toContain('Moved "Chat Alpha" to Recent Chats');
    });

    it('12. should render ephemeral demo data during walkthrough and make 0 API calls', () => {
      component.collections = [];
      component.conversations = [];

      walkthroughService.start(0);
      expect(walkthroughService.isDemoMode()).toBe(true);

      // Should display ephemeral demo items in template getters
      expect(component.displayedCollections.length).toBeGreaterThan(0);
      expect(component.displayedConversations.length).toBeGreaterThan(0);

      const demoConv = component.displayedConversations[0];
      component.draggedConversation = demoConv;

      const dropEvent = { preventDefault: jest.fn() } as unknown as DragEvent;
      component.onDropOnCollection('demo-col-titan', dropEvent);

      // No API call should be executed during demo walkthrough!
      expect(apiServiceMock.moveConversationToCollection).not.toHaveBeenCalled();

      // Demo data should be updated in memory
      expect(demoConv.collectionId).toBe('demo-col-titan');

      // Finishing walkthrough clears demo data completely
      walkthroughService.finish();
      expect(walkthroughService.isDemoMode()).toBe(false);
      expect(component.displayedCollections.length).toBe(0);
      expect(component.displayedConversations.length).toBe(0);
    });
  });
});
