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
import { of, Subject, EMPTY, throwError } from 'rxjs';
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
      uploadDirectMessageAttachment: jest.fn((convId: string, file: File) =>
        of({
          id: 'doc-att-123',
          originalName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/pdf',
          status: 'ready',
        })
      ),
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
      sendDirectMessage: jest.fn().mockReturnValue(of({})),
      directConversations: signal([]),
      sharedConversations: signal([]),
      loadDirectConversations: jest.fn(),
      loadSharedConversations: jest.fn(),
      generationStates: signal({}),
      activeGenerations: signal([]),
      incomingMessage$: new Subject(),
      setActiveConversationId: jest.fn(),
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
      alert: jest.fn().mockResolvedValue(undefined),
      prompt: jest.fn().mockResolvedValue(''),
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

      // Target collection should be automatically expanded
      expect(component.isCollectionExpanded('demo-col-titan')).toBe(true);

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

    it('13. should automatically expand collections group when dragging over or dropping on collections header', () => {
      component.isCollectionsGroupExpanded = false;
      const dragOverEvent = {
        preventDefault: jest.fn(),
        dataTransfer: { dropEffect: 'none' },
      } as unknown as DragEvent;

      component.onDragOverCollectionsHeader(dragOverEvent);
      expect(component.isCollectionsGroupExpanded).toBe(true);
      expect(component.isDragOverCollectionsHeader).toBe(true);

      component.onDragLeaveCollectionsHeader(dragOverEvent);
      expect(component.isDragOverCollectionsHeader).toBe(false);

      expect(component.isCollectionsGroupExpanded).toBe(true);
    });

    it('14. should enable Temporary Chat from persistent chat as a separate empty session without altering persistent chat', () => {
      component.selectConversation(mockConvA);
      expect(component.activeConversation?.id).toBe(mockConvA.id);
      expect(component.isTemporaryMode).toBe(false);

      // Enable temporary mode
      component.enableTemporaryChat();

      expect(component.isTemporaryMode).toBe(true);
      expect(component.activeConversation?.id).toMatch(/^temp-session-/);
      expect(component.previousPersistentConversation?.id).toBe(mockConvA.id);
      expect(mockConvA.title).toBe('Chat Alpha'); // Unaltered
      expect(component.messages).toEqual([]); // Fresh empty session
      expect(apiServiceMock.createConversation).not.toHaveBeenCalled();
    });

    it('15. should return to previous persistent chat when exiting Temporary Chat', () => {
      component.selectConversation(mockConvA);
      component.enableTemporaryChat();
      expect(component.isTemporaryMode).toBe(true);

      // Exit temporary mode
      component.exitTemporaryChat();

      expect(component.isTemporaryMode).toBe(false);
      expect(component.activeConversation?.id).toBe(mockConvA.id);
      expect(component.previousPersistentConversation).toBeNull();
    });

    it('16. should create a fresh temporary session without MongoDB call when creating new chat while in temporary mode', () => {
      component.enableTemporaryChat();
      const firstTempId = component.activeConversation?.id;

      component.createNewConversation();

      expect(component.isTemporaryMode).toBe(true);
      expect(component.activeConversation?.id).toMatch(/^temp-session-/);
      expect(component.activeConversation?.id).not.toBe(firstTempId);
      expect(apiServiceMock.createConversation).not.toHaveBeenCalled();
    });

    it('17. should exit temporary mode cleanly when user clicks a persistent chat from the sidebar list', () => {
      component.enableTemporaryChat();
      expect(component.isTemporaryMode).toBe(true);

      // User clicks Chat B in the sidebar
      component.selectConversation(mockConvB);

      expect(component.isTemporaryMode).toBe(false);
      expect(component.activeConversation?.id).toBe(mockConvB.id);
      expect(component.temporaryConversation).toBeNull();
    });

    it('18. should archive a conversation, call API, and display in archived chats list', () => {
      apiServiceMock.archiveConversation = jest.fn().mockReturnValue(of({ ...mockConvA, archived: true }));
      component.conversations = [{ ...mockConvA, archived: false }, { ...mockConvB, archived: false }];
      component.filteredConversations = [...component.conversations];

      component.toggleArchive(component.conversations[0]);

      expect(apiServiceMock.archiveConversation).toHaveBeenCalledWith('conv-a');
      expect(component.getArchivedChats().length).toBe(1);
      expect(component.getArchivedChats()[0].id).toBe('conv-a');
      expect(component.getRecentUncollectedChats().length).toBe(1);
    });

    it('19. should preserve archived chats on conversation reload (simulating refresh)', () => {
      const convWithArchived = [
        { ...mockConvA, archived: true },
        { ...mockConvB, archived: false },
      ];
      apiServiceMock.getConversations.mockReturnValue(of(convWithArchived));

      component.isArchivedView = true;
      component.loadConversations();

      expect(component.conversations.length).toBe(2);
      expect(component.getArchivedChats().length).toBe(1);
      expect(component.getArchivedChats()[0].id).toBe('conv-a');
    });

    it('20. should unarchive an archived conversation and restore to recent chats', () => {
      apiServiceMock.unarchiveConversation = jest.fn().mockReturnValue(of({ ...mockConvA, archived: false }));
      component.conversations = [{ ...mockConvA, archived: true }, { ...mockConvB, archived: false }];
      component.filteredConversations = [...component.conversations];
      component.isArchivedView = true;

      component.toggleArchive(component.conversations[0]);

      expect(apiServiceMock.unarchiveConversation).toHaveBeenCalledWith('conv-a');
      expect(component.getArchivedChats().length).toBe(0);
      expect(component.getRecentUncollectedChats().length).toBe(2);
    });
  });

  describe('New Chat Persistence Lifecycle (Deferred Creation)', () => {
    it('Scenario A: clicking New Chat and navigating away without sending does NOT call createConversation', () => {
      apiServiceMock.createConversation.mockClear();

      component.createNewConversation();

      expect(component.activeConversation).toBeNull();
      expect(component.isTemporaryMode).toBe(false);
      expect(apiServiceMock.createConversation).not.toHaveBeenCalled();

      // Navigate away
      component.ngOnDestroy();
      expect(apiServiceMock.createConversation).not.toHaveBeenCalled();
    });

    it('Scenario B: typing a draft in New Chat and navigating away saves draft locally but does NOT create DB conversation', () => {
      apiServiceMock.createConversation.mockClear();

      component.createNewConversation();
      component.inputText = 'Unsent draft text for new chat';

      // Save on unload/navigation
      component.onBeforeUnload();
      component.ngOnDestroy();

      expect(chatDraftServiceMock.saveDraft).toHaveBeenCalledWith(
        TEMPORARY_NEW_CHAT_ID,
        'Unsent draft text for new chat',
        []
      );
      expect(apiServiceMock.createConversation).not.toHaveBeenCalled();
    });

    it('Scenario C: sending the first message creates the MongoDB conversation with real ID and migrates draft', async () => {
      apiServiceMock.createConversation.mockClear();
      apiServiceMock.createConversation.mockReturnValue(
        of({
          id: 'conv-persisted-999',
          title: 'What is our Q3 forecast?',
          userId: 'user-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as IConversation)
      );

      component.createNewConversation();
      component.inputText = 'What is our Q3 forecast?';
      mockDraftStore[TEMPORARY_NEW_CHAT_ID] = { text: 'What is our Q3 forecast?', attachedResources: [] };

      component.sendUserMessage();

      expect(apiServiceMock.createConversation).toHaveBeenCalledTimes(1);
      expect(apiServiceMock.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'What is our Q3 forecast?',
        })
      );
      expect(component.activeConversation?.id).toBe('conv-persisted-999');
      expect(component.conversations.some((c) => c.id === 'conv-persisted-999')).toBe(true);
      expect(chatDraftServiceMock.migrateDraft).toHaveBeenCalledWith(TEMPORARY_NEW_CHAT_ID, 'conv-persisted-999');
      expect(chatStateMock.sendMessageStream).toHaveBeenCalledWith(
        'conv-persisted-999',
        'What is our Q3 forecast?',
        expect.any(Array),
        expect.any(Function),
        false
      );
    });

    it('Scenario F: sending a message in an existing persistent chat does NOT create a new conversation', () => {
      apiServiceMock.createConversation.mockClear();
      component.selectConversation(mockConvA);
      component.inputText = 'Follow-up question';

      component.sendUserMessage();

      expect(apiServiceMock.createConversation).not.toHaveBeenCalled();
      expect(chatStateMock.sendMessageStream).toHaveBeenCalledWith(
        'conv-a',
        'Follow-up question',
        expect.any(Array),
        expect.any(Function),
        false
      );
    });

    it('Scenario G: sending a message in Temporary Chat streams directly without calling createConversation', () => {
      apiServiceMock.createConversation.mockClear();
      component.enableTemporaryChat();
      const tempId = component.activeConversation?.id;
      component.inputText = 'Temporary query';

      component.sendUserMessage();

      expect(apiServiceMock.createConversation).not.toHaveBeenCalled();
      expect(chatStateMock.sendMessageStream).toHaveBeenCalledWith(
        tempId,
        'Temporary query',
        expect.any(Array),
        expect.any(Function),
        true
      );
    });

    it('Scenario H: double-click send on New Chat creates only 1 conversation (concurrency protection)', () => {
      apiServiceMock.createConversation.mockClear();
      const createSubject = new Subject<IConversation>();
      apiServiceMock.createConversation.mockReturnValue(createSubject.asObservable());

      component.createNewConversation();
      component.inputText = 'Double clicked prompt';

      // First click
      component.sendUserMessage();
      // Second click immediately while creation is in-flight
      component.sendUserMessage();

      expect(apiServiceMock.createConversation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Direct Message File Attachments via Paperclip', () => {
    const mockDmConv: IConversation = {
      id: 'dm-conv-1',
      title: 'Jane Doe',
      userId: 'user-2',
      type: 'direct',
      participants: ['user-1', 'user-2'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    beforeEach(() => {
      component.activeConversation = mockDmConv;
    });

    it('Scenario 1: triggers file input click when triggerDmFileUpload is called', () => {
      const mockInput = document.createElement('input');
      mockInput.id = 'dm-file-upload-input';
      const clickSpy = jest.spyOn(mockInput, 'click');
      document.body.appendChild(mockInput);

      component.triggerDmFileUpload();

      expect(clickSpy).toHaveBeenCalled();
      document.body.removeChild(mockInput);
    });

    it('Scenario 2: rejects file exceeding 50 MB limit client-side before making HTTP request', () => {
      const largeFile = new File(['a'.repeat(100)], 'huge-file.pdf', { type: 'application/pdf' });
      Object.defineProperty(largeFile, 'size', { value: 55 * 1024 * 1024 });

      const event = {
        target: {
          files: [largeFile],
          value: 'fake-path',
        },
      } as unknown as Event;

      component.onDmFileSelected(event);

      expect(modalMock.alert).toHaveBeenCalledWith(
        'File size exceeds the 50 MB limit. Please select a smaller file.',
        'File Too Large'
      );
      expect(apiServiceMock.uploadDirectMessageAttachment).not.toHaveBeenCalled();
      expect(component.isUploadingDmFile).toBe(false);
    });

    it('Scenario 3: successfully uploads attachment and sends direct message with downloadableFile payload', () => {
      const validFile = new File(['dummy content'], 'report.pdf', { type: 'application/pdf' });
      Object.defineProperty(validFile, 'size', { value: 1024 * 50 });

      const event = {
        target: {
          files: [validFile],
        },
      } as unknown as Event;

      component.onDmFileSelected(event);

      expect(apiServiceMock.uploadDirectMessageAttachment).toHaveBeenCalledWith('dm-conv-1', validFile);
      expect(chatStateMock.sendDirectMessage).toHaveBeenCalledWith(
        'dm-conv-1',
        'Shared file: report.pdf',
        [],
        expect.anything(),
        {
          documentId: 'doc-att-123',
          fileName: 'report.pdf',
          fileSize: 51200,
          mimeType: 'application/pdf',
        }
      );
      expect(component.isUploadingDmFile).toBe(false);
    });

    it('Scenario 4: handles upload failure, resets loading state, and displays modal alert', () => {
      apiServiceMock.uploadDirectMessageAttachment.mockReturnValue(
        throwError(() => ({ error: { message: 'You are not a participant in this direct conversation' } }))
      );

      const validFile = new File(['dummy content'], 'forbidden.pdf', { type: 'application/pdf' });
      const event = {
        target: {
          files: [validFile],
        },
      } as unknown as Event;

      component.onDmFileSelected(event);

      expect(component.isUploadingDmFile).toBe(false);
      expect(component.localError).toBe('You are not a participant in this direct conversation');
      expect(modalMock.alert).toHaveBeenCalledWith(
        'You are not a participant in this direct conversation',
        'Upload Failed'
      );
    });
  });

  describe('@Syntra Composer Mention Token Rendering', () => {
    it('Scenario 1: styles only @Syntra with theme-aware rose classes and leaves following text unstyled', () => {
      component.inputText = '@Syntra what is the meaning of RAG?';

      expect(component.hasSyntraMention).toBe(true);
      const html = component.highlightedComposerHtml;

      expect(html).toContain('<span class="composer-syntra-token text-rose-600 dark:text-rose-400 font-medium">@Syntra</span> what is the meaning of RAG?');
      expect(html.startsWith('<span class="composer-syntra-token text-rose-600 dark:text-rose-400 font-medium">@Syntra</span>')).toBe(true);
      // Verify text after @Syntra is plain unstyled text
      expect(html.endsWith('what is the meaning of RAG?')).toBe(true);
    });

    it('Scenario 2: correctly formats @Syntra when immediately followed by punctuation like commas and colons', () => {
      component.inputText = '@Syntra, please analyze this file:';
      const commaHtml = component.highlightedComposerHtml;
      expect(commaHtml).toBe('<span class="composer-syntra-token text-rose-600 dark:text-rose-400 font-medium">@Syntra</span>, please analyze this file:');

      component.inputText = '@Syntra: summarize the document';
      const colonHtml = component.highlightedComposerHtml;
      expect(colonHtml).toBe('<span class="composer-syntra-token text-rose-600 dark:text-rose-400 font-medium">@Syntra</span>: summarize the document');
    });

    it('Scenario 3: handles case-insensitivity (@syntra, @SYNTRA, @Syntra)', () => {
      component.inputText = '@syntra help me';
      expect(component.highlightedComposerHtml).toBe('<span class="composer-syntra-token text-rose-600 dark:text-rose-400 font-medium">@syntra</span> help me');

      component.inputText = '@SYNTRA help me';
      expect(component.highlightedComposerHtml).toBe('<span class="composer-syntra-token text-rose-600 dark:text-rose-400 font-medium">@SYNTRA</span> help me');
    });

    it('Scenario 4: highlights multiple @Syntra mentions in one prompt', () => {
      component.inputText = 'Ask @Syntra first and then ping @Syntra again.';
      const html = component.highlightedComposerHtml;
      const occurrences = (html.match(/composer-syntra-token/g) || []).length;
      expect(occurrences).toBe(2);
      expect(html).toBe('Ask <span class="composer-syntra-token text-rose-600 dark:text-rose-400 font-medium">@Syntra</span> first and then ping <span class="composer-syntra-token text-rose-600 dark:text-rose-400 font-medium">@Syntra</span> again.');
    });

    it('Scenario 5: returns hasSyntraMention=false when no @Syntra is present', () => {
      component.inputText = 'Regular message to team';
      expect(component.hasSyntraMention).toBe(false);
      expect(component.highlightedComposerHtml).toBe('Regular message to team');
    });

    it('Scenario 6: safely escapes HTML entities in user input while highlighting @Syntra', () => {
      component.inputText = '@Syntra <script>alert("xss")</script> & "quotes"';
      const html = component.highlightedComposerHtml;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;quotes&quot;');
      expect(html).toContain('<span class="composer-syntra-token text-rose-600 dark:text-rose-400 font-medium">@Syntra</span>');
    });

    it('Scenario 7: submitted message text and backend payload remains raw untouched string', () => {
      component.selectConversation(mockConvA);
      component.inputText = '@Syntra explain transformers';

      component.sendUserMessage();

      expect(chatStateMock.sendMessageStream).toHaveBeenCalledWith(
        'conv-a',
        '@Syntra explain transformers',
        expect.any(Array),
        expect.any(Function),
        false
      );
    });
  });
});

