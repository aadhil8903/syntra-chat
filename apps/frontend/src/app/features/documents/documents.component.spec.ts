import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentsComponent } from './documents.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ModalDialogService } from '../../core/services/modal-dialog.service';
import { Router, ActivatedRoute } from '@angular/router';
import { of, BehaviorSubject, throwError } from 'rxjs';
import { DocumentStatus, SupportedDocumentFormat } from '@enter-chat/shared-types';

describe('DocumentsComponent (Responsive Navigation & Modal UX)', () => {
  let component: DocumentsComponent;
  let fixture: ComponentFixture<DocumentsComponent>;
  let mockApiService: any;
  let mockAuthService: any;
  let mockModalService: any;
  let mockRouter: any;
  let queryParamsSubject: BehaviorSubject<any>;

  const mockDocuments = [
    {
      id: 'doc-1',
      userId: 'user-1',
      filename: 'sales_q1.xlsx',
      originalName: 'sales_q1.xlsx',
      fileType: SupportedDocumentFormat.XLSX,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: 10240,
      storagePath: 'users/user-1/documents/sales_q1.xlsx',
      allowedDepartments: [],
      folder: 'Sales/2026/Q1',
      status: DocumentStatus.READY,
      chunkCount: 0,
      sheetNames: ['Summary'],
      sheets: [
        {
          sheetName: 'Summary',
          rowCount: 20,
          columnCount: 3,
          columns: [{ name: 'Revenue', dtype: 'float' }],
          previewRows: [{ Revenue: 50000 }],
        },
      ],
      totalRows: 20,
      sourceType: 'tabular',
      hasAccess: true,
      requestStatus: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'doc-2',
      userId: 'user-1',
      filename: 'handbook.pdf',
      originalName: 'handbook.pdf',
      fileType: SupportedDocumentFormat.PDF,
      mimeType: 'application/pdf',
      fileSize: 20480,
      storagePath: 'users/user-1/documents/handbook.pdf',
      allowedDepartments: [],
      folder: 'HR',
      status: DocumentStatus.READY,
      chunkCount: 15,
      sheetNames: [],
      sheets: [],
      totalRows: 0,
      sourceType: 'narrative',
      hasAccess: true,
      requestStatus: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(async () => {
    queryParamsSubject = new BehaviorSubject<any>({});

    mockApiService = {
      getDocuments: jest.fn().mockReturnValue(of(mockDocuments)),
      getFolders: jest.fn().mockReturnValue(of([])),
      updateFolderDownloadPolicy: jest.fn().mockReturnValue(of({ name: 'Sales', downloadPolicy: 'restricted' })),
      updateDocumentDownloadPolicy: jest.fn().mockReturnValue(of({ ...mockDocuments[0], downloadPolicy: 'allowed' })),
      downloadDocument: jest.fn().mockReturnValue(of(new Blob())),
      triggerFileDownload: jest.fn().mockResolvedValue(undefined),
      createFolder: jest.fn().mockReturnValue(of({ success: true })),
      deleteFolder: jest.fn().mockReturnValue(of({ success: true })),
      uploadDocument: jest.fn().mockReturnValue(of(mockDocuments[0])),
      replaceDocument: jest.fn().mockReturnValue(of({ ...mockDocuments[0], fileSize: 4096 })),
      updateDocumentFolder: jest.fn().mockReturnValue(of(mockDocuments[0])),
      createAccessRequest: jest.fn().mockReturnValue(of({ success: true })),
    };

    mockAuthService = {
      currentUser: jest.fn().mockReturnValue({ id: 'user-1', role: 'admin' }),
      isAdmin: jest.fn().mockReturnValue(true),
    };

    mockModalService = {
      confirmDanger: jest.fn().mockResolvedValue(true),
    };

    mockRouter = {
      navigate: jest.fn().mockImplementation((_commands, options) => {
        if (options && options.queryParams) {
          queryParamsSubject.next(options.queryParams);
        }
        return Promise.resolve(true);
      }),
    };

    await TestBed.configureTestingModule({
      imports: [DocumentsComponent],
      providers: [
        { provide: ApiService, useValue: mockApiService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ModalDialogService, useValue: mockModalService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: queryParamsSubject.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  describe('Folder Navigation & Router History', () => {
    it('1. should start at Root/All Files when no folder query param is present', () => {
      expect(component.activeFolder).toBeNull();
      expect(component.documents.length).toBe(2);
    });

    it('2. should navigate to folder and update queryParams when setActiveFolder is called', () => {
      component.setActiveFolder('Sales');
      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: expect.anything(),
        queryParams: { folder: 'Sales' },
      });
      expect(component.activeFolder).toBe('Sales');
    });

    it('3. should support nested folder history navigation (Sales -> 2026 -> Q1)', () => {
      component.setActiveFolder('Sales');
      expect(component.activeFolder).toBe('Sales');

      component.setActiveFolder('Sales/2026');
      expect(component.activeFolder).toBe('Sales/2026');

      component.setActiveFolder('Sales/2026/Q1');
      expect(component.activeFolder).toBe('Sales/2026/Q1');

      // Simulate Browser/Mouse Back button pop (queryParams emitted from Router)
      queryParamsSubject.next({ folder: 'Sales/2026' });
      expect(component.activeFolder).toBe('Sales/2026');

      queryParamsSubject.next({ folder: 'Sales' });
      expect(component.activeFolder).toBe('Sales');

      queryParamsSubject.next({});
      expect(component.activeFolder).toBeNull();
    });

    it('4. should correctly compute breadcrumb segments', () => {
      component.activeFolder = 'Sales/2026/Q1';
      const breadcrumbs = component.breadcrumbSegments;
      expect(breadcrumbs).toEqual([
        { name: 'Sales', path: 'Sales' },
        { name: '2026', path: 'Sales/2026' },
        { name: 'Q1', path: 'Sales/2026/Q1' },
      ]);
    });

    it('5. should filter documents strictly by active folder', () => {
      component.activeFolder = 'Sales/2026/Q1';
      expect(component.filteredDocuments.length).toBe(1);
      expect(component.filteredDocuments[0].originalName).toBe('sales_q1.xlsx');

      component.activeFolder = 'HR';
      expect(component.filteredDocuments.length).toBe(1);
      expect(component.filteredDocuments[0].originalName).toBe('handbook.pdf');
    });
  });

  describe('Modal Dismissal (Backdrop Click & ESC Key)', () => {
    it('6. should open preview modal and close via closeTabularPreview (backdrop click)', () => {
      component.openTabularPreview(mockDocuments[0]);
      expect(component.selectedTabularDoc).toBe(mockDocuments[0]);

      component.closeTabularPreview();
      expect(component.selectedTabularDoc).toBeNull();
    });

    it('7. should dismiss preview modal on ESC key press', () => {
      component.openTabularPreview(mockDocuments[0]);
      expect(component.selectedTabularDoc).toBe(mockDocuments[0]);

      component.onEscapeKey(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.selectedTabularDoc).toBeNull();
    });

    it('8. should dismiss move modal on ESC key press', () => {
      component.openMoveModal(mockDocuments[0]);
      expect(component.showMoveModal).toBe(true);

      component.onEscapeKey(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.showMoveModal).toBe(false);
      expect(component.moveTargetDoc).toBeNull();
    });

    it('9. should dismiss access request modal on ESC key press', () => {
      component.openAccessModal(mockDocuments[0]);
      expect(component.showAccessModal).toBe(true);

      component.onEscapeKey(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.showAccessModal).toBe(false);
      expect(component.targetAccessItem).toBeNull();
    });

    it('10. should dismiss quick new folder bar on ESC key press', () => {
      component.showNewFolderInput = true;
      component.newFolderName = 'Temp';

      component.onEscapeKey(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.showNewFolderInput).toBe(false);
      expect(component.newFolderName).toBe('');
    });
  });

  describe('Replace File Workflow', () => {
    it('11. should confirm and trigger file input click on triggerReplace', async () => {
      const mockInput = { click: jest.fn() } as any;
      await component.triggerReplace(mockDocuments[0], mockInput);

      expect(mockModalService.confirmDanger).toHaveBeenCalledWith(
        expect.stringContaining('sales_q1.xlsx'),
        expect.stringContaining('sales_q1.xlsx'),
        'Choose Replacement'
      );
      expect(component.replacingDoc).toBe(mockDocuments[0]);
      expect(mockInput.click).toHaveBeenCalled();
    });

    it('12. should execute replacement and reload documents on file selection', () => {
      const file = new File(['new binary data'], 'updated_sales.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      component.replacingDoc = mockDocuments[0];

      const mockEvent = {
        target: {
          files: [file],
          value: 'fake/path',
        },
      } as any;

      component.onReplaceFileSelected(mockEvent);

      expect(mockApiService.replaceDocument).toHaveBeenCalledWith(mockDocuments[0].id, file);
      expect(mockApiService.getDocuments).toHaveBeenCalled();
    });

    it('13. should handle replacement errors and restore document list without breaking', () => {
      mockApiService.replaceDocument.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Replacement failed' } }))
      );

      const file = new File(['bad data'], 'bad.xlsx', { type: 'application/octet-stream' });
      component.executeReplace(mockDocuments[0], file);

      expect(component.uploadError).toBe('Replacement failed');
      expect(mockApiService.getDocuments).toHaveBeenCalled();
    });
  });

  describe('Filter & Sorting Controls (Client-Side)', () => {
    const testDocList: any[] = [
      {
        id: 'doc-a',
        originalName: 'zebra.pdf',
        folder: 'Finance',
        uploadedAt: '2026-01-01T10:00:00.000Z',
        createdAt: '2026-01-01T10:00:00.000Z',
      },
      {
        id: 'doc-b',
        originalName: 'apple.docx',
        folder: 'Finance',
        uploadedAt: '2026-03-01T10:00:00.000Z',
        createdAt: '2026-03-01T10:00:00.000Z',
      },
      {
        id: 'doc-c',
        originalName: 'BETA_REPORT.xlsx',
        folder: 'HR',
        uploadedAt: '2026-02-01T10:00:00.000Z',
        createdAt: '2026-02-01T10:00:00.000Z',
      },
      {
        id: 'doc-d',
        originalName: 'alpha_guide.pdf',
        folder: 'Finance',
        uploadedAt: '2026-04-01T10:00:00.000Z',
        createdAt: '2026-04-01T10:00:00.000Z',
      },
    ];

    beforeEach(() => {
      component.documents = [...testDocList];
      component.activeFolder = null;
      component.searchQuery = '';
      component.selectedSort = 'newest';
    });

    it('14. should default to Newest first sorting (uploadedAt descending)', () => {
      expect(component.selectedSort).toBe('newest');
      const filtered = component.filteredDocuments;
      expect(filtered.map((d) => d.id)).toEqual(['doc-d', 'doc-b', 'doc-c', 'doc-a']);
    });

    it('15. should sort by Oldest first (uploadedAt ascending)', () => {
      component.selectedSort = 'oldest';
      const filtered = component.filteredDocuments;
      expect(filtered.map((d) => d.id)).toEqual(['doc-a', 'doc-c', 'doc-b', 'doc-d']);
    });

    it('16. should sort by Name A → Z (case-insensitive ascending)', () => {
      component.selectedSort = 'name_asc';
      const filtered = component.filteredDocuments;
      expect(filtered.map((d) => d.originalName)).toEqual([
        'alpha_guide.pdf',
        'apple.docx',
        'BETA_REPORT.xlsx',
        'zebra.pdf',
      ]);
    });

    it('17. should sort by Name Z → A (case-insensitive descending)', () => {
      component.selectedSort = 'name_desc';
      const filtered = component.filteredDocuments;
      expect(filtered.map((d) => d.originalName)).toEqual([
        'zebra.pdf',
        'BETA_REPORT.xlsx',
        'apple.docx',
        'alpha_guide.pdf',
      ]);
    });

    it('18. should apply search filtering first, then sort the results', () => {
      component.searchQuery = 'pdf'; // matches 'zebra.pdf' and 'alpha_guide.pdf'
      component.selectedSort = 'name_asc';
      const filtered = component.filteredDocuments;

      expect(filtered.length).toBe(2);
      expect(filtered.map((d) => d.originalName)).toEqual(['alpha_guide.pdf', 'zebra.pdf']);

      component.selectedSort = 'newest';
      const newestFiltered = component.filteredDocuments;
      expect(newestFiltered.map((d) => d.originalName)).toEqual(['alpha_guide.pdf', 'zebra.pdf']);
    });

    it('19. should apply folder filtering first, then sort the results', () => {
      component.activeFolder = 'Finance'; // matches doc-a, doc-b, doc-d (excludes doc-c in HR)
      component.selectedSort = 'name_asc';
      const filtered = component.filteredDocuments;

      expect(filtered.length).toBe(3);
      expect(filtered.map((d) => d.originalName)).toEqual([
        'alpha_guide.pdf',
        'apple.docx',
        'zebra.pdf',
      ]);

      component.selectedSort = 'oldest';
      const oldestFiltered = component.filteredDocuments;
      expect(oldestFiltered.map((d) => d.id)).toEqual(['doc-a', 'doc-b', 'doc-d']);
    });

    it('20. should fallback to createdAt when uploadedAt is not explicitly provided', () => {
      component.documents = [
        { id: 'd-1', originalName: 'doc1.pdf', createdAt: '2026-01-01T00:00:00Z' } as any,
        { id: 'd-2', originalName: 'doc2.pdf', createdAt: '2026-02-01T00:00:00Z' } as any,
      ];
      component.selectedSort = 'newest';
      expect(component.filteredDocuments.map((d) => d.id)).toEqual(['d-2', 'd-1']);

      component.selectedSort = 'oldest';
      expect(component.filteredDocuments.map((d) => d.id)).toEqual(['d-1', 'd-2']);
    });
  });

  describe('File-Manager Style Move Modal Workflow', () => {
    beforeEach(() => {
      component.documents = mockDocuments as any;
      component.folderList = [
        { id: 'f-1', name: 'Sales', allowedDepartments: [], downloadPolicy: 'allowed' },
        { id: 'f-2', name: 'Sales/2026', allowedDepartments: [], downloadPolicy: 'allowed' },
        { id: 'f-3', name: 'Sales/2026/Q1', allowedDepartments: [], downloadPolicy: 'allowed' },
        { id: 'f-4', name: 'Finance', allowedDepartments: [], downloadPolicy: 'restricted' },
        { id: 'f-5', name: 'HR', allowedDepartments: [], downloadPolicy: 'allowed' },
      ];
    });

    it('21. should open move modal with target doc and reset navigation state', () => {
      const doc = mockDocuments[0]; // in 'Sales/2026/Q1'
      component.openMoveModal(doc as any);

      expect(component.showMoveModal).toBe(true);
      expect(component.moveTargetDoc).toBe(doc);
      expect(component.moveModalCurrentNavPath).toBe('');
      expect(component.moveSelectedDestination).toBeNull();
      expect(component.isMovingFile).toBe(false);
      expect(component.moveErrorMessage).toBeNull();
    });

    it('22. should compute breadcrumbs correctly for root and nested paths', () => {
      component.moveModalCurrentNavPath = '';
      expect(component.moveBreadcrumbSegments).toEqual([{ label: 'All Files', path: '' }]);

      component.moveModalCurrentNavPath = 'Sales/2026/Q1';
      expect(component.moveBreadcrumbSegments).toEqual([
        { label: 'All Files', path: '' },
        { label: 'Sales', path: 'Sales' },
        { label: '2026', path: 'Sales/2026' },
        { label: 'Q1', path: 'Sales/2026/Q1' },
      ]);
    });

    it('23. should return subfolders for current navigation level', () => {
      // At root level
      const rootSubs = component.getMoveSubfolders('');
      const names = rootSubs.map((s) => s.name);
      expect(names).toContain('Sales');
      expect(names).toContain('Finance');
      expect(names).toContain('HR');

      // Under Sales
      const salesSubs = component.getMoveSubfolders('Sales');
      expect(salesSubs.map((s) => s.name)).toEqual(['2026']);
      expect(salesSubs[0].fullPath).toBe('Sales/2026');

      // Under Sales/2026
      const yearSubs = component.getMoveSubfolders('Sales/2026');
      expect(yearSubs.map((s) => s.name)).toEqual(['Q1']);
    });

    it('24. should navigate folders and navigate up properly', () => {
      component.navigateMoveFolder('Sales/2026');
      expect(component.moveModalCurrentNavPath).toBe('Sales/2026');

      component.navigateMoveFolderUp();
      expect(component.moveModalCurrentNavPath).toBe('Sales');

      component.navigateMoveFolderUp();
      expect(component.moveModalCurrentNavPath).toBe('');

      // Navigating up from root should remain root
      component.navigateMoveFolderUp();
      expect(component.moveModalCurrentNavPath).toBe('');
    });

    it('25. should identify when selected destination is the file current folder', () => {
      component.moveTargetDoc = mockDocuments[0] as any; // folder: 'Sales/2026/Q1'

      component.selectMoveDestination('Sales/2026/Q1');
      expect(component.isDestinationCurrentLocation()).toBe(true);

      component.selectMoveDestination('Finance');
      expect(component.isDestinationCurrentLocation()).toBe(false);

      component.selectMoveDestination('');
      expect(component.isDestinationCurrentLocation()).toBe(false);
    });

    it('26. should execute move and refresh documents and folders', () => {
      component.openMoveModal(mockDocuments[0] as any);
      component.selectMoveDestination('Finance');

      component.executeMove();

      expect(mockApiService.updateDocumentFolder).toHaveBeenCalledWith('doc-1', 'Finance');
      expect(component.showMoveModal).toBe(false);
      expect(component.isMovingFile).toBe(false);
      expect(mockApiService.getDocuments).toHaveBeenCalled();
      expect(mockApiService.getFolders).toHaveBeenCalled();
    });

    it('27. should prevent move if selected destination is the current location', () => {
      component.openMoveModal(mockDocuments[0] as any);
      component.selectMoveDestination('Sales/2026/Q1');

      component.executeMove();

      expect(mockApiService.updateDocumentFolder).not.toHaveBeenCalled();
    });

    it('28. should handle move errors and keep modal open with error message', () => {
      mockApiService.updateDocumentFolder.mockReturnValue(
        throwError(() => ({ error: { message: 'Destination folder is locked' } }))
      );

      component.openMoveModal(mockDocuments[0] as any);
      component.selectMoveDestination('Finance');

      component.executeMove();

      expect(component.isMovingFile).toBe(false);
      expect(component.showMoveModal).toBe(true);
      expect(component.moveErrorMessage).toBe('Destination folder is locked');
    });

    it('29. should close modal on closeMoveModal or escape key', () => {
      component.openMoveModal(mockDocuments[0] as any);
      expect(component.showMoveModal).toBe(true);

      component.onEscapeKey(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.showMoveModal).toBe(false);
      expect(component.moveTargetDoc).toBeNull();
    });

    it('30. Admin with restricted download has access but cannot download', () => {
      mockAuthService.isAdmin.mockReturnValue(true);
      const doc: any = { id: 'd-1', hasAccess: true, effectiveDownloadPolicy: 'restricted' };
      expect(component.canAccessDoc(doc)).toBe(true);
      expect(component.canDownloadDoc(doc)).toBe(false);
    });

    it('31. Admin has access even if doc.hasAccess is false (no Request Access for admin)', () => {
      mockAuthService.isAdmin.mockReturnValue(true);
      const doc: any = { id: 'd-2', hasAccess: false, effectiveDownloadPolicy: 'restricted' };
      expect(component.canAccessDoc(doc)).toBe(true);
      expect(component.canDownloadDoc(doc)).toBe(false);
    });

    it('32. Normal user with access and restricted download has access but cannot download', () => {
      mockAuthService.isAdmin.mockReturnValue(false);
      const doc: any = { id: 'd-3', hasAccess: true, effectiveDownloadPolicy: 'restricted' };
      expect(component.canAccessDoc(doc)).toBe(true);
      expect(component.canDownloadDoc(doc)).toBe(false);
    });

    it('33. Normal user without access cannot access and cannot download', () => {
      mockAuthService.isAdmin.mockReturnValue(false);
      const doc: any = { id: 'd-4', hasAccess: false, effectiveDownloadPolicy: 'allowed' };
      expect(component.canAccessDoc(doc)).toBe(false);
      expect(component.canDownloadDoc(doc)).toBe(false);
    });

    it('34. Normal user with access and allowed download can access and can download', () => {
      mockAuthService.isAdmin.mockReturnValue(false);
      const doc: any = { id: 'd-5', hasAccess: true, effectiveDownloadPolicy: 'allowed' };
      expect(component.canAccessDoc(doc)).toBe(true);
      expect(component.canDownloadDoc(doc)).toBe(true);
    });

    it('35. Admin selecting file triggers upload modal with default inherit policy', () => {
      mockAuthService.isAdmin.mockReturnValue(true);
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const event = { target: { files: [mockFile], value: 'test.pdf' } } as any;

      component.onFileSelected(event);

      expect(component.showUploadModal).toBe(true);
      expect(component.pendingUploadFile).toBe(mockFile);
      expect(component.uploadDownloadPolicy).toBe('inherit');
    });

    it('36. Confirming upload calls apiService.uploadDocument with selected download policy', () => {
      mockAuthService.isAdmin.mockReturnValue(true);
      const mockFile = new File(['content'], 'handbook.pdf', { type: 'application/pdf' });
      component.pendingUploadFile = mockFile;
      component.uploadDownloadPolicy = 'restricted';
      component.showUploadModal = true;

      component.confirmUpload();

      expect(mockApiService.uploadDocument).toHaveBeenCalledWith(
        mockFile,
        undefined,
        [],
        'restricted',
      );
      expect(component.showUploadModal).toBe(false);
      expect(component.pendingUploadFile).toBeNull();
    });

    it('37. Escape key closes upload modal', () => {
      component.showUploadModal = true;
      component.pendingUploadFile = new File([''], 'doc.pdf');

      component.onEscapeKey(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(component.showUploadModal).toBe(false);
      expect(component.pendingUploadFile).toBeNull();
    });

    it('38. Clicking three-dot button opens action menu with positioning', () => {
      const mockDoc = mockDocuments[0] as any;
      const dummyButton = document.createElement('button');
      jest.spyOn(dummyButton, 'getBoundingClientRect').mockReturnValue({
        top: 200,
        bottom: 232,
        left: 800,
        right: 832,
        width: 32,
        height: 32,
      } as DOMRect);

      const event = {
        currentTarget: dummyButton,
        stopPropagation: jest.fn(),
      } as any;

      component.toggleActionMenu(mockDoc, event);

      expect(component.activeActionMenuDoc).toBe(mockDoc);
      expect(component.menuPosition.top).toBe(236); // 232 + 4
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('39. Toggling action menu again or for another row closes previous menu', () => {
      const doc1 = mockDocuments[0] as any;
      const doc2 = mockDocuments[1] as any;
      const dummyButton = document.createElement('button');
      jest.spyOn(dummyButton, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 132,
        left: 500,
        right: 532,
        width: 32,
        height: 32,
      } as DOMRect);

      const event = { currentTarget: dummyButton, stopPropagation: jest.fn() } as any;

      // Open doc1
      component.toggleActionMenu(doc1, event);
      expect(component.activeActionMenuDoc).toBe(doc1);

      // Open doc2 -> replaces doc1
      component.toggleActionMenu(doc2, event);
      expect(component.activeActionMenuDoc).toBe(doc2);

      // Toggle doc2 again -> closes
      component.toggleActionMenu(doc2, event);
      expect(component.activeActionMenuDoc).toBeNull();
    });

    it('40. Escape key closes open action menu', () => {
      component.activeActionMenuDoc = mockDocuments[0] as any;

      component.onEscapeKey(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(component.activeActionMenuDoc).toBeNull();
    });

    it('41. Document click and window change close action menu', () => {
      component.activeActionMenuDoc = mockDocuments[0] as any;

      component.onDocumentClick();
      expect(component.activeActionMenuDoc).toBeNull();

      component.activeActionMenuDoc = mockDocuments[0] as any;
      component.onWindowChange();
      expect(component.activeActionMenuDoc).toBeNull();
    });

    it('42. Action menu flips upward when clicked near bottom of viewport', () => {
      const mockDoc = mockDocuments[0] as any;
      const dummyButton = document.createElement('button');
      // Position near bottom of 800px window
      jest.spyOn(dummyButton, 'getBoundingClientRect').mockReturnValue({
        top: 750,
        bottom: 782,
        left: 500,
        right: 532,
        width: 32,
        height: 32,
      } as DOMRect);

      const event = { currentTarget: dummyButton, stopPropagation: jest.fn() } as any;
      mockAuthService.isAdmin.mockReturnValue(true);

      component.toggleActionMenu(mockDoc, event);

      expect(component.activeActionMenuDoc).toBe(mockDoc);
      // Flipped upward: 750 - 210 - 4 = 536
      expect(component.menuPosition.top).toBeLessThan(750);
    });

    it('43. Selecting an action closes the menu immediately', () => {
      const mockDoc = mockDocuments[0] as any;
      component.activeActionMenuDoc = mockDoc;

      jest.spyOn(component, 'openMoveModal').mockImplementation();
      component.handleMenuMove(mockDoc);

      expect(component.activeActionMenuDoc).toBeNull();
      expect(component.openMoveModal).toHaveBeenCalledWith(mockDoc);
    });

    it('44. Clicking download policy pill with event opens compact popover with positioning', () => {
      const mockDoc = mockDocuments[0] as any;
      mockAuthService.isAdmin.mockReturnValue(true);

      const dummyButton = document.createElement('button');
      jest.spyOn(dummyButton, 'getBoundingClientRect').mockReturnValue({
        top: 300,
        bottom: 330,
        left: 400,
        right: 490,
        width: 90,
        height: 30,
      } as DOMRect);

      const event = { currentTarget: dummyButton, stopPropagation: jest.fn() } as any;

      component.openDownloadPolicyModal(mockDoc, event);

      expect(component.editingDownloadPolicyDoc).toBe(mockDoc);
      expect(component.downloadPolicyMenuPosition.top).toBe(334); // 330 + 4
      expect(component.downloadPolicyMenuPosition.left).toBe(400);
      expect(component.downloadPolicyOpenUpward).toBe(false);
    });

    it('44b. Detects low viewport space and opens download popover upward', () => {
      const mockDoc = mockDocuments[0] as any;
      mockAuthService.isAdmin.mockReturnValue(true);

      // Simulate button positioned near bottom of 768px window
      const dummyButton = document.createElement('button');
      jest.spyOn(dummyButton, 'getBoundingClientRect').mockReturnValue({
        top: 680,
        bottom: 710,
        left: 400,
        right: 490,
        width: 90,
        height: 30,
      } as DOMRect);

      const event = { currentTarget: dummyButton, stopPropagation: jest.fn() } as any;

      component.openDownloadPolicyModal(mockDoc, event);

      expect(component.editingDownloadPolicyDoc).toBe(mockDoc);
      expect(component.downloadPolicyOpenUpward).toBe(true);
    });

    it('45. Selecting a policy via setDocDownloadPolicy saves and closes the popover', () => {
      const mockDoc = mockDocuments[0] as any;
      mockAuthService.isAdmin.mockReturnValue(true);
      component.editingDownloadPolicyDoc = mockDoc;
      component.documents = [{ ...mockDoc }];

      component.setDocDownloadPolicy('restricted');

      expect(mockApiService.updateDocumentDownloadPolicy).toHaveBeenCalledWith(mockDoc.id, 'restricted');
      expect(component.editingDownloadPolicyDoc).toBeNull();
    });

    it('45b. Closes download policy dropdown when target row scrolls out of view or on escape/click', () => {
      const mockDoc = mockDocuments[0] as any;
      mockAuthService.isAdmin.mockReturnValue(true);
      component.editingDownloadPolicyDoc = mockDoc;

      component.onEscapeKey(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.editingDownloadPolicyDoc).toBeNull();

      component.editingDownloadPolicyDoc = mockDoc;
      component.onDocumentClick();
      expect(component.editingDownloadPolicyDoc).toBeNull();
    });
  });

  describe('Move + Undo Notification System', () => {
    it('46. Drag-and-drop moving a file pushes a move undo notification', () => {
      const mockDoc = { ...mockDocuments[0], folder: 'Sales/2026/Q1' };
      component.draggedDoc = mockDoc as any;
      mockAuthService.isAdmin.mockReturnValue(true);

      const event = { preventDefault: jest.fn() } as any;
      component.onFolderDrop(event, 'HR');

      expect(mockApiService.updateDocumentFolder).toHaveBeenCalledWith(mockDoc.id, 'HR');
      expect(component.moveUndoNotifications.length).toBe(1);
      const notif = component.moveUndoNotifications[0];
      expect(notif.documentId).toBe(mockDoc.id);
      expect(notif.documentName).toBe(mockDoc.originalName);
      expect(notif.sourcePath).toBe('Sales/2026/Q1');
      expect(notif.destinationPath).toBe('HR');
    });

    it('47. Modal move file pushes a move undo notification and closes modal', () => {
      const mockDoc = { ...mockDocuments[1], folder: 'HR' };
      component.openMoveModal(mockDoc as any);
      component.selectMoveDestination('Marketing');

      component.executeMove();

      expect(mockApiService.updateDocumentFolder).toHaveBeenCalledWith(mockDoc.id, 'Marketing');
      expect(component.showMoveModal).toBe(false);
      expect(component.moveUndoNotifications.length).toBe(1);
      const notif = component.moveUndoNotifications[0];
      expect(notif.sourcePath).toBe('HR');
      expect(notif.destinationPath).toBe('Marketing');
    });

    it('48. Clicking undo calls updateDocumentFolder with original sourcePath and removes notification', () => {
      jest.useFakeTimers();
      const mockDoc = { ...mockDocuments[0], folder: 'HR' };
      component.documents = [mockDoc as any];
      component.pushMoveUndoNotification(mockDoc.id, mockDoc.originalName, 'Sales', 'HR');

      expect(component.moveUndoNotifications.length).toBe(1);
      const notif = component.moveUndoNotifications[0];

      component.undoMove(notif);

      expect(mockApiService.updateDocumentFolder).toHaveBeenCalledWith(mockDoc.id, 'Sales');
      expect(component.moveUndoNotifications.length).toBe(0);
      expect(component.toastMessage).toContain('moved back to Sales');
      jest.useRealTimers();
    });

    it('49. Undo handles error and displays error toast', () => {
      mockApiService.updateDocumentFolder.mockReturnValueOnce(throwError(() => new Error('Server error')));
      const mockDoc = { ...mockDocuments[0], folder: 'HR' };
      component.documents = [mockDoc as any];
      component.pushMoveUndoNotification(mockDoc.id, mockDoc.originalName, 'Sales', 'HR');

      const notif = component.moveUndoNotifications[0];
      component.undoMove(notif);

      expect(component.toastMessage).toContain("Couldn't undo move");
      expect(notif.isUndoing).toBe(false);
    });

    it('50. Concurrency / Stale safety: prevents undo if document moved again', () => {
      const mockDoc = { ...mockDocuments[0], folder: 'Finance' }; // was moved to Finance after HR
      component.documents = [mockDoc as any];
      component.pushMoveUndoNotification(mockDoc.id, mockDoc.originalName, 'Sales', 'HR');

      const notif = component.moveUndoNotifications[0];
      component.undoMove(notif);

      expect(component.toastMessage).toContain('The file has changed since the move');
      expect(mockApiService.updateDocumentFolder).not.toHaveBeenCalledWith(mockDoc.id, 'Sales');
    });

    it('51. Auto-dismiss notification after timer expires', () => {
      jest.useFakeTimers();
      component.pushMoveUndoNotification('doc-1', 'test.pdf', 'HR', 'Sales');
      expect(component.moveUndoNotifications.length).toBe(1);

      jest.advanceTimersByTime(7500);

      expect(component.moveUndoNotifications.length).toBe(0);
      jest.useRealTimers();
    });

    it('52. Stack limits queue to max 4 items by discarding oldest', () => {
      component.pushMoveUndoNotification('doc-1', '1.pdf', 'A', 'B');
      component.pushMoveUndoNotification('doc-2', '2.pdf', 'A', 'B');
      component.pushMoveUndoNotification('doc-3', '3.pdf', 'A', 'B');
      component.pushMoveUndoNotification('doc-4', '4.pdf', 'A', 'B');
      component.pushMoveUndoNotification('doc-5', '5.pdf', 'A', 'B');

      expect(component.moveUndoNotifications.length).toBe(4);
      expect(component.moveUndoNotifications[0].documentId).toBe('doc-2');
      expect(component.moveUndoNotifications[3].documentId).toBe('doc-5');
    });
  });
});
