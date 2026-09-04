import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatStateService } from '../../core/services/chat-state.service';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';

describe('DashboardComponent (AI-First Workspace)', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let apiServiceMock: any;
  let authServiceMock: any;
  let chatStateMock: any;
  let router: Router;

  const mockUser = {
    id: 'u123',
    firstName: 'Aadil',
    lastName: 'Mansuri',
    email: 'aadil@example.com',
    role: 'user',
  };

  const mockConvs = [
    { id: 'c1', title: 'Sales Pipeline Analysis', updatedAt: new Date().toISOString() },
    { id: 'c2', title: 'Quarterly Revenue Review', updatedAt: new Date(Date.now() - 86400000).toISOString(), collectionId: 'col1' },
  ];

  const mockDocs = [
    { id: 'd1', originalName: 'Architecture Reference.pdf', fileType: 'pdf', chunkCount: 14, status: 'ready' },
  ];

  const mockDatasets = [
    { id: 'ds1', originalName: 'Product Pricing.xlsx', fileType: 'xlsx', totalRows: 1200, status: 'ready' },
  ];

  const mockCollections = [
    { id: 'col1', name: 'Sales', userId: 'u123', createdAt: new Date().toISOString() },
  ];

  beforeEach(async () => {
    apiServiceMock = {
      getDocuments: jest.fn().mockReturnValue(of(mockDocs)),
      getDatasets: jest.fn().mockReturnValue(of(mockDatasets)),
      getConversations: jest.fn().mockReturnValue(of(mockConvs)),
      getCollections: jest.fn().mockReturnValue(of(mockCollections)),
      createConversation: jest.fn().mockReturnValue(of({ id: 'c_new', title: 'Test Chat' })),
      searchMentions: jest.fn().mockReturnValue(of({ results: [] })),
    };

    authServiceMock = {
      currentUser: signal(mockUser),
    };

    chatStateMock = {
      sendMessageStream: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: ChatStateService, useValue: chatStateMock },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('1. should render authenticated user display name in greeting', () => {
    const heading = fixture.nativeElement.querySelector('h1');
    expect(heading.textContent).toContain('Aadil');
  });

  it('2. should render the AI-first hero and subtitle "What are you working on?"', () => {
    const sub = fixture.nativeElement.querySelector('p');
    expect(sub.textContent).toContain('What are you working on?');
  });

  it('3. should render the primary AI composer input box', () => {
    const textarea = fixture.nativeElement.querySelector('textarea');
    expect(textarea).toBeTruthy();
    expect(textarea.getAttribute('placeholder')).toContain('Ask Syntra');
  });

  it('4. should render quick action chips and apply prompt on click', () => {
    expect(component.quickActions.length).toBeGreaterThanOrEqual(3);
    const analyzeAction = component.quickActions.find((a) => a.label.includes('Analyze data'));
    expect(analyzeAction).toBeTruthy();

    component.applyQuickAction(analyzeAction!);
    expect(component.inputText).toContain('Analyze');
  });

  it('5. should submit composer and seamlessly navigate to chat with stream including all attached resource IDs', fakeAsync(() => {
    component.inputText = 'Analyze our Q3 sales numbers';
    component.attachedResources = [
      { id: 'd1', name: 'Architecture Reference.pdf', type: 'document' as any },
      { id: 'ds1', name: 'Product Pricing.xlsx', type: 'dataset' as any },
      { id: 'd2', name: 'Security Policy.pdf', type: 'document' as any },
      { id: 'd3', name: 'Budget 2026.pdf', type: 'document' as any },
      { id: 'd4', name: 'Marketing Strategy.docx', type: 'document' as any },
    ];
    component.submitComposer();
    tick();

    expect(apiServiceMock.createConversation).toHaveBeenCalled();
    expect(chatStateMock.sendMessageStream).toHaveBeenCalledWith(
      'c_new',
      'Analyze our Q3 sales numbers',
      ['d1', 'ds1', 'd2', 'd3', 'd4']
    );
    expect(router.navigate).toHaveBeenCalledWith(['/chat', 'c_new']);
  }));

  it('6. should allow selecting 5+ resources and prevent duplicate attachments', () => {
    expect(component.attachedResources.length).toBe(0);

    const r1 = { id: 'r1', name: 'File1.pdf', type: 'document' as any };
    const r2 = { id: 'r2', name: 'File2.pdf', type: 'document' as any };
    const r3 = { id: 'r3', name: 'File3.xlsx', type: 'dataset' as any };
    const r4 = { id: 'r4', name: 'File4.pdf', type: 'document' as any };
    const r5 = { id: 'r5', name: 'File5.pdf', type: 'document' as any };

    component.onMentionSelected(r1);
    component.onMentionSelected(r2);
    component.onMentionSelected(r3);
    component.onMentionSelected(r4);
    component.onMentionSelected(r5);

    expect(component.attachedResources.length).toBe(5);

    // Duplicate selection should not add extra chip
    component.onMentionSelected(r1);
    expect(component.attachedResources.length).toBe(5);
  });

  it('6b. should not insert @filename into inputText when mention is selected', () => {
    component.inputText = 'Compare @arch and summarize findings';
    // Simulate selection at the @arch position
    component.onMentionSelected({ id: 'd1', name: 'Architecture.pdf', type: 'document' as any });

    // The @arch trigger should be removed and inputText should remain clean user text
    expect(component.inputText).not.toContain('@Architecture.pdf');
    expect(component.inputText).toBe('Compare and summarize findings');
    expect(component.attachedResources.some((r) => r.id === 'd1')).toBe(true);
  });

  it('7. should remove individual attached resource correctly on removeAttachedResource', () => {
    const r1 = { id: 'r1', name: 'File1.pdf', type: 'document' as any };
    const r2 = { id: 'r2', name: 'File2.pdf', type: 'document' as any };
    const r3 = { id: 'r3', name: 'File3.xlsx', type: 'dataset' as any };

    component.onMentionSelected(r1);
    component.onMentionSelected(r2);
    component.onMentionSelected(r3);
    expect(component.attachedResources.length).toBe(3);

    component.removeAttachedResource('r2');
    expect(component.attachedResources.length).toBe(2);
    expect(component.attachedResources.map((r) => r.id)).toEqual(['r1', 'r3']);
  });

  it('8. should render Recent Chats list and format dates cleanly', () => {
    const recentHeading = fixture.nativeElement.textContent;
    expect(recentHeading).toContain('Recent Chats');
    expect(recentHeading).toContain('Sales Pipeline Analysis');
    expect(component.formatChatDate(new Date().toISOString())).toBe('Today');
  });

  it('9. should render compact Collections and Files sections without large statistic cards', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Collections');
    expect(text).toContain('Files');
    expect(text).toContain('1 documents');
    expect(text).toContain('1 datasets');

    // Verify old giant statistic card headings are absent
    expect(text).not.toContain('KNOWLEDGE DOCUMENTS\n13');
    expect(text).not.toContain('New AI Session');
  });

  it('10. should navigate to /chat when New Chat button is clicked', () => {
    component.createNewChat();
    expect(router.navigate).toHaveBeenCalledWith(['/chat']);
  });

  it('11. should handle empty conversation state gracefully', () => {
    component.conversations = [];
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('No conversations yet.');
  });
});
