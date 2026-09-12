import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { DocumentsService } from './documents.service';
import { DocumentEntity } from './schemas/document.schema';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { UsersService } from '../users/users.service';
import { AccessRequestsService } from '../access-requests/access-requests.service';
import { AclResolverService } from '../permissions/services/acl-resolver.service';
import { FoldersService } from '../folders/folders.service';
import { Types } from 'mongoose';
import { DocumentStatus, SupportedDocumentFormat, UserRole } from '@enter-chat/shared-types';

describe('DocumentsService - Dynamic Duplicate Filename Handling', () => {
  let service: DocumentsService;
  let mockDocumentModel: any;
  let mockStorageService: any;
  let mockAiGatewayService: any;
  let mockUsersService: any;
  let mockAccessRequestsService: any;
  let mockAclResolver: any;
  let existingDocuments: any[] = [];

  beforeEach(async () => {
    existingDocuments = [];

    // Mock Document Model Constructor and queries
    mockDocumentModel = jest.fn().mockImplementation((docData) => {
      const docInstance = {
        ...docData,
        _id: new Types.ObjectId(),
        save: jest.fn().mockImplementation(async function (this: any) {
          const self = this || docInstance;
          const idx = existingDocuments.findIndex((d) => d._id.toString() === self._id.toString());
          if (idx >= 0) {
            existingDocuments[idx] = self;
          } else {
            existingDocuments.push(self);
          }
          return self;
        }),
      };
      return docInstance;
    });

    mockDocumentModel.find = jest.fn().mockImplementation((filter: any) => {
      let filtered = [...existingDocuments];
      if (filter.folder !== undefined) {
        filtered = filtered.filter((d) => (d.folder || '') === filter.folder);
      }
      if (filter.originalName?.$regex) {
        const regex: RegExp = filter.originalName.$regex;
        filtered = filtered.filter((d) => regex.test(d.originalName));
      }
      return {
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(filtered),
          }),
        }),
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(filtered),
        }),
      };
    });

    mockDocumentModel.findById = jest.fn().mockImplementation((id: string) => {
      const found = existingDocuments.find((d) => d._id.toString() === id.toString()) || null;
      return {
        ...(found || {}),
        _id: found?._id,
        userId: found?.userId,
        originalName: found?.originalName,
        folder: found?.folder,
        downloadPolicy: found?.downloadPolicy,
        storagePath: found?.storagePath,
        fileType: found?.fileType,
        sourceType: found?.sourceType,
        status: found?.status,
        chunkCount: found?.chunkCount,
        mimeType: found?.mimeType,
        fileSize: found?.fileSize,
        then: (resolve: any) => Promise.resolve(found).then(resolve),
        exec: jest.fn().mockResolvedValue(found),
      };
    });

    mockDocumentModel.countDocuments = jest.fn().mockImplementation((filter: any) => {
      const count = existingDocuments.filter((d) => (d.folder || '') === (filter.folder || '')).length;
      return Promise.resolve(count);
    });

    mockDocumentModel.findByIdAndUpdate = jest.fn().mockImplementation((id: string, update: any) => {
      const doc = existingDocuments.find((d) => d._id.toString() === id.toString());
      if (doc && update.$set) {
        Object.assign(doc, update.$set);
      }
      return {
        ...doc,
        then: (resolve: any) => Promise.resolve(doc).then(resolve),
        exec: jest.fn().mockResolvedValue(doc),
      };
    });

    mockDocumentModel.findOneAndUpdate = jest.fn().mockImplementation((filter: any, update: any) => {
      const doc = existingDocuments.find((d) => d._id.toString() === filter._id.toString());
      if (doc) {
        Object.assign(doc, update.$set);
      }
      return Promise.resolve(doc);
    });

    let fileCounter = 0;
    mockStorageService = {
      saveFile: jest.fn().mockImplementation(async (_buf, _dest, filename) => {
        fileCounter++;
        return {
          filename: `stored_${fileCounter}_${filename}`,
          storagePath: `users/user-1/documents/stored_${fileCounter}_${filename}`,
          fileSize: 1024,
        };
      }),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    mockAiGatewayService = {
      inspectDataset: jest.fn().mockResolvedValue({ status: 'ready', sheetNames: [], sheets: [], totalRows: 0 }),
      ingestDocument: jest.fn().mockResolvedValue({ chunkCount: 5 }),
    };

    mockUsersService = {
      findById: jest.fn().mockImplementation((id: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(id),
          id,
          role: id === '507f1f77bcf86cd799439011' ? UserRole.ADMIN : UserRole.USER,
          departments: [],
        }),
      ),
    };

    mockAccessRequestsService = {
      getApprovedResourceIdsForUser: jest.fn().mockResolvedValue([]),
      getUserRequests: jest.fn().mockResolvedValue([]),
    };

    mockAclResolver = {
      canUserAccessFolder: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: getModelToken(DocumentEntity.name),
          useValue: mockDocumentModel,
        },
        {
          provide: STORAGE_SERVICE,
          useValue: mockStorageService,
        },
        {
          provide: AiGatewayService,
          useValue: mockAiGatewayService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: AccessRequestsService,
          useValue: mockAccessRequestsService,
        },
        {
          provide: AclResolverService,
          useValue: mockAclResolver,
        },
        {
          provide: FoldersService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([
              { name: 'Finance', downloadPolicy: 'restricted', allowedDepartments: [] },
              { name: 'Sales', downloadPolicy: 'allowed', allowedDepartments: [] },
              { name: 'HR', downloadPolicy: 'allowed', allowedDepartments: [] },
            ]),
            findByName: jest.fn().mockImplementation((name: string) => {
              if (name === 'Finance') return Promise.resolve({ name: 'Finance', downloadPolicy: 'restricted' });
              if (name === 'Sales') return Promise.resolve({ name: 'Sales', downloadPolicy: 'allowed' });
              if (name === 'HR') return Promise.resolve({ name: 'HR', downloadPolicy: 'allowed' });
              return Promise.resolve(null);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  it('should sequentially assign dynamic unique filenames when uploading 4 identical files to the same folder', async () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: '11_sales_pipeline.xlsx',
      encoding: '7bit',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 1024,
      buffer: Buffer.from('mock'),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const upload1 = await service.uploadDocument('507f1f77bcf86cd799439011', mockFile, 'Sales');
    expect(upload1.originalName).toBe('11_sales_pipeline.xlsx');

    const upload2 = await service.uploadDocument('507f1f77bcf86cd799439011', mockFile, 'Sales');
    expect(upload2.originalName).toBe('11_sales_pipeline (1).xlsx');

    const upload3 = await service.uploadDocument('507f1f77bcf86cd799439011', mockFile, 'Sales');
    expect(upload3.originalName).toBe('11_sales_pipeline (2).xlsx');

    const upload4 = await service.uploadDocument('507f1f77bcf86cd799439011', mockFile, 'Sales');
    expect(upload4.originalName).toBe('11_sales_pipeline (3).xlsx');
  });

  it('should allow the same filename in different folders without collision', async () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'report.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('mock'),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const folderA = await service.uploadDocument('507f1f77bcf86cd799439011', mockFile, 'Folder A');
    expect(folderA.originalName).toBe('report.pdf');

    const folderB = await service.uploadDocument('507f1f77bcf86cd799439011', mockFile, 'Folder B');
    expect(folderB.originalName).toBe('report.pdf');
  });

  it('should fill numeric gaps when duplicates are removed or missing', async () => {
    // Manually add report.pdf, report (1).pdf, and report (3).pdf to folder 'Finance'
    existingDocuments.push(
      { _id: new Types.ObjectId(), originalName: 'report.pdf', folder: 'Finance' },
      { _id: new Types.ObjectId(), originalName: 'report (1).pdf', folder: 'Finance' },
      { _id: new Types.ObjectId(), originalName: 'report (3).pdf', folder: 'Finance' },
    );

    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'report.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('mock'),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const uploaded = await service.uploadDocument('507f1f77bcf86cd799439011', mockFile, 'Finance');
    expect(uploaded.originalName).toBe('report (2).pdf');
  });

  describe('Replace File Functionality', () => {
    it('1. should replace an existing document successfully without creating a duplicate', async () => {
      const mockFile1: Express.Multer.File = {
        fieldname: 'file',
        originalname: '11_sales_pipeline.xlsx',
        encoding: '7bit',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 1024,
        buffer: Buffer.from('initial version'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const initialDoc = await service.uploadDocument('507f1f77bcf86cd799439011', mockFile1, 'Sales');
      expect(initialDoc.originalName).toBe('11_sales_pipeline.xlsx');
      expect(initialDoc.folder).toBe('Sales');
      expect(existingDocuments.length).toBe(1);

      // Now replace with updated_sales_pipeline_v2.xlsx
      const replacementFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'updated_sales_pipeline_v2.xlsx',
        encoding: '7bit',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 2048,
        buffer: Buffer.from('updated version with 32 rows'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const replacedDoc = await service.replaceDocument('507f1f77bcf86cd799439011', initialDoc.id, replacementFile);

      // Verify ID, originalName, folder, and count remain preserved
      expect(replacedDoc.id).toBe(initialDoc.id);
      expect(replacedDoc.originalName).toBe('11_sales_pipeline.xlsx');
      expect(replacedDoc.folder).toBe('Sales');
      expect(replacedDoc.fileSize).toBe(2048);
      expect(replacedDoc.status).toBe(DocumentStatus.PROCESSING);
      expect(existingDocuments.length).toBe(1); // Exactly 1 document, NO duplicate created!

      // Storage cleanup should be called for old storage path
      expect(mockStorageService.deleteFile).toHaveBeenCalled();
    });

    it('2. should reject replacement when cross-family format mismatch (e.g. tabular to PDF)', async () => {
      const initialFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'sales_data.csv',
        encoding: '7bit',
        mimetype: 'text/csv',
        size: 512,
        buffer: Buffer.from('a,b,c'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const initialDoc = await service.uploadDocument('507f1f77bcf86cd799439011', initialFile, 'Sales');

      const invalidReplacement: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'handbook.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 4096,
        buffer: Buffer.from('%PDF-1.4'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await expect(
        service.replaceDocument('507f1f77bcf86cd799439011', initialDoc.id, invalidReplacement),
      ).rejects.toThrow('Cannot replace a tabular dataset with a narrative document');

      // Original document should remain untouched
      expect(existingDocuments.length).toBe(1);
      expect(existingDocuments[0].originalName).toBe('sales_data.csv');
    });

    it('3. should reject replacement when user is unauthorized', async () => {
      const initialFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'confidential.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('confidential text'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const initialDoc = await service.uploadDocument('507f1f77bcf86cd799439011', initialFile, 'Legal');

      const replacementFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'confidential_v2.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('confidential text v2'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      // User 2 is not admin and not the document owner
      await expect(
        service.replaceDocument('507f1f77bcf86cd799439022', initialDoc.id, replacementFile),
      ).rejects.toThrow();
    });
  });

  describe('Move File - Folder Navigation & Policy Recalculation', () => {
    it('1. should move document to destination folder and recalculate inherited download policy', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'report.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 2048,
        buffer: Buffer.from('%PDF-1.4 report'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      // Upload to Sales (allowed download policy), default inherit
      const doc = await service.uploadDocument('507f1f77bcf86cd799439011', file, 'Sales');
      expect(doc.effectiveDownloadPolicy).toBe('allowed');

      // Move to Finance (restricted download policy)
      const moved = await service.updateFolderAndDeps('507f1f77bcf86cd799439011', doc.id, 'Finance');
      expect(moved.folder).toBe('Finance');
      expect(moved.effectiveDownloadPolicy).toBe('restricted');
    });

    it('2. should handle duplicate filename collision on move by appending suffix', async () => {
      const file1: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'budget.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 budget 1'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const file2: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'budget.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 budget 2'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      // file1 in Finance
      await service.uploadDocument('507f1f77bcf86cd799439011', file1, 'Finance');
      // file2 in Sales
      const doc2 = await service.uploadDocument('507f1f77bcf86cd799439011', file2, 'Sales');

      // Move doc2 to Finance where budget.pdf already exists
      const moved = await service.updateFolderAndDeps('507f1f77bcf86cd799439011', doc2.id, 'Finance');
      expect(moved.folder).toBe('Finance');
      expect(moved.originalName).toBe('budget (1).pdf');
    });

    it('3. should move document to Root ("") and set download policy as allowed', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'guide.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 guide'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const doc = await service.uploadDocument('507f1f77bcf86cd799439011', file, 'Finance');
      expect(doc.effectiveDownloadPolicy).toBe('restricted');

      // Move to Root
      const moved = await service.updateFolderAndDeps('507f1f77bcf86cd799439011', doc.id, '');
      expect(moved.folder).toBe('');
      expect(moved.effectiveDownloadPolicy).toBe('allowed');
    });

    it('4. should preserve explicit file download override when moved to a restricted folder', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'public_release.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 public release'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      // Explicit allowed override
      const doc = await service.uploadDocument('507f1f77bcf86cd799439011', file, 'Sales', undefined, 'allowed');
      expect(doc.downloadPolicy).toBe('allowed');
      expect(doc.effectiveDownloadPolicy).toBe('allowed');

      // Move to Finance (which has restricted folder policy)
      const moved = await service.updateFolderAndDeps('507f1f77bcf86cd799439011', doc.id, 'Finance');
      expect(moved.folder).toBe('Finance');
      expect(moved.downloadPolicy).toBe('allowed');
      expect(moved.effectiveDownloadPolicy).toBe('allowed');
    });

    it('5. should reject move when user is not admin and not owner', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'secret.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 secret'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const doc = await service.uploadDocument('507f1f77bcf86cd799439011', file, 'Sales');

      await expect(
        service.updateFolderAndDeps('507f1f77bcf86cd799439022', doc.id, 'HR'),
      ).rejects.toThrow('You do not have permission to move this document');
    });

    it('6. should reject move when destination folder does not exist', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'notes.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 notes'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const doc = await service.uploadDocument('507f1f77bcf86cd799439011', file, 'Sales');

      await expect(
        service.updateFolderAndDeps('507f1f77bcf86cd799439011', doc.id, 'NonExistentFolder_12345'),
      ).rejects.toThrow('Destination folder "NonExistentFolder_12345" not found');
    });
  });

  describe('Document Access vs Download Permission Separation', () => {
    const adminId = '507f1f77bcf86cd799439011';
    const normalUserId = '507f1f77bcf86cd799439022';

    it('1. Admin + document access allowed + download allowed -> visible + downloadable', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'admin_open.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 open'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const doc = await service.uploadDocument(adminId, file, 'Sales');
      const allDocs = await service.findAllAccessible(adminId);
      const found = allDocs.find((d) => d.id === doc.id);
      expect(found).toBeDefined();
      expect(found!.hasAccess).toBe(true);

      const check = await service.canUserDownloadDocument(adminId, doc.id);
      expect(check.canDownload).toBe(true);
    });

    it('2. Admin + document access allowed + download restricted -> visible + restricted + NO Request Access', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'financial_report.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 financial'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const doc = await service.uploadDocument(adminId, file, 'Finance');
      await service.updateDownloadPolicy(adminId, doc.id, 'restricted');

      const allDocs = await service.findAllAccessible(adminId);
      const found = allDocs.find((d) => d.id === doc.id);
      expect(found).toBeDefined();
      expect(found!.hasAccess).toBe(true);
      expect(found!.effectiveDownloadPolicy).toBe('restricted');

      const check = await service.canUserDownloadDocument(adminId, doc.id);
      expect(check.canDownload).toBe(false);
      expect(check.reason).toBe('DOWNLOAD_RESTRICTED');
    });

    it('3. Normal user + document access allowed + download allowed -> visible + downloadable', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'user_doc.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 user'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const doc = await service.uploadDocument(normalUserId, file, 'Sales');
      const check = await service.canUserDownloadDocument(normalUserId, doc.id);
      expect(check.canDownload).toBe(true);
    });

    it('4. Normal user + document access allowed + download restricted -> visible + restricted + NO Download', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'user_restricted.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 user restricted'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const doc = await service.uploadDocument(normalUserId, file, 'Sales');
      await service.updateDownloadPolicy(adminId, doc.id, 'restricted');

      const check = await service.canUserDownloadDocument(normalUserId, doc.id);
      expect(check.canDownload).toBe(false);
      expect(check.reason).toBe('DOWNLOAD_RESTRICTED');
    });

    it('5. Normal user + document access denied -> ACCESS_DENIED + NO Download', async () => {
      mockUsersService.findById.mockResolvedValueOnce({
        id: '507f1f77bcf86cd799439099',
        role: 'user',
        departments: ['Marketing'],
      });
      mockAclResolver.canUserAccessFolder.mockResolvedValueOnce(false);

      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'secret_finance.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 secret'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const doc = await service.uploadDocument(adminId, file, 'Finance');
      const check = await service.canUserDownloadDocument('507f1f77bcf86cd799439099', doc.id);
      expect(check.canDownload).toBe(false);
      expect(check.reason).toBe('ACCESS_DENIED');
    });

    it('6. Admin + restricted folder download policy -> files remain visible to admin with restricted download', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'finance_budget.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 budget'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const doc = await service.uploadDocument(adminId, file, 'Finance');
      const allDocs = await service.findAllAccessible(adminId);
      const found = allDocs.find((d) => d.id === doc.id);
      expect(found).toBeDefined();
      expect(found!.hasAccess).toBe(true);
      expect(found!.effectiveDownloadPolicy).toBe('restricted');
    });

    it('7. File-level Restricted override inside an Allowed folder -> file is not downloadable', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'special_sales.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 special'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const doc = await service.uploadDocument(adminId, file, 'Sales');
      await service.updateDownloadPolicy(adminId, doc.id, 'restricted');

      const check = await service.canUserDownloadDocument(adminId, doc.id);
      expect(check.canDownload).toBe(false);
      expect(check.reason).toBe('DOWNLOAD_RESTRICTED');
    });

    it('8. File-level Allowed override inside a Restricted folder -> downloadable if user has access', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'public_finance.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 public finance'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const doc = await service.uploadDocument(adminId, file, 'Finance');
      await service.updateDownloadPolicy(adminId, doc.id, 'allowed');

      const check = await service.canUserDownloadDocument(adminId, doc.id);
      expect(check.canDownload).toBe(true);
    });
  });

  describe('Natural Language File Discovery (No @mentions Required)', () => {
    const adminId = '507f1f77bcf86cd799439011';

    beforeEach(async () => {
      const file1: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'Leave_Policy.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF leave'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const file2: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'Employee_Handbook.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF handbook'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      const file3: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'Reimbursement_Policy.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF reimb'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
      await service.uploadDocument(adminId, file1, 'HR');
      await service.uploadDocument(adminId, file2, 'HR');
      await service.uploadDocument(adminId, file3, 'HR');
    });

    it('Scenario 1: Resolves natural language file request without @mention', async () => {
      const res = await service.resolvePdfRequest(adminId, 'Can I download the employee handbook?');
      expect(res.found).toBe(true);
      expect(res.matchType).toBe('exact');
      expect(res.document?.originalName).toBe('Employee_Handbook.pdf');
      expect(res.canDownload).toBe(true);
    });

    it('Scenario 2: Resolves contextual "Give me the file" using conversation history', async () => {
      const history = [
        { role: 'user', content: 'What are the rules for taking time off?' },
        { role: 'assistant', content: 'According to the Leave_Policy.pdf, employees receive 20 days off annually.' },
      ];
      const res = await service.resolvePdfRequest(adminId, 'Give me the file', null, history);
      expect(res.found).toBe(true);
      expect(res.matchType).toBe('exact');
      expect(res.document?.originalName).toBe('Leave_Policy.pdf');
    });

    it('Scenario 3: Returns ambiguous clarification when multiple files match a generic topic', async () => {
      const res = await service.resolvePdfRequest(adminId, 'Give me the HR policy file');
      expect(res.matchType).toBe('ambiguous');
      expect(res.candidates && res.candidates.length).toBeGreaterThanOrEqual(2);
    });

    it('Scenario 4: Returns none when file does not exist', async () => {
      const res = await service.resolvePdfRequest(adminId, 'Give me the quarterly spaceship report');
      expect(res.found).toBe(false);
      expect(res.matchType).toBe('none');
    });
  });

  describe('uploadDirectAttachment — Direct Message Attachment Flow', () => {
    const testUserId = new Types.ObjectId().toString();

    it('successfully stores attachment in GridFS and creates DocumentEntity with READY status', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'Project_Spec.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 2048,
        buffer: Buffer.from('%PDF dummy content'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const doc = await service.uploadDirectAttachment(testUserId, mockFile);
      expect(doc).toBeDefined();
      expect(doc.originalName).toBe('Project_Spec.pdf');
      expect(doc.status).toBe(DocumentStatus.READY);
      expect(doc.downloadPolicy).toBe('allowed');
      expect(mockStorageService.saveFile).toHaveBeenCalledWith(
        mockFile.buffer,
        `users/${testUserId}/direct_attachments`,
        'Project_Spec.pdf',
      );
    });

    it('rejects unsupported file formats', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'malicious.exe',
        encoding: '7bit',
        mimetype: 'application/x-msdownload',
        size: 1024,
        buffer: Buffer.from('MZ...'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await expect(service.uploadDirectAttachment(testUserId, mockFile)).rejects.toThrow(
        'Unsupported file format: .exe',
      );
    });

    it('cleans up GridFS file if DocumentEntity creation fails to prevent orphaned files', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'Corrupted_Doc.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF...'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      // Force documentModel save to fail on service instance
      const originalModel = (service as any).documentModel;
      const failingModel: any = jest.fn().mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(new Error('MongoDB write timeout')),
      }));
      failingModel.find = originalModel.find;
      (service as any).documentModel = failingModel;

      await expect(service.uploadDirectAttachment(testUserId, mockFile)).rejects.toThrow(
        'MongoDB write timeout',
      );
      expect(mockStorageService.deleteFile).toHaveBeenCalled();

      // Restore mock
      (service as any).documentModel = originalModel;
    });
  });
});

