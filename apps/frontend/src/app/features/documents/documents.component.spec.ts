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
});
