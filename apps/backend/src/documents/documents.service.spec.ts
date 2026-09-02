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
import { DocumentStatus, SupportedDocumentFormat } from '@enter-chat/shared-types';

describe('DocumentsService - Dynamic Duplicate Filename Handling', () => {
  let service: DocumentsService;
  let mockDocumentModel: any;
  let mockStorageService: any;
  let mockAiGatewayService: any;
  let existingDocuments: any[] = [];

  beforeEach(async () => {
    existingDocuments = [];

    // Mock Document Model Constructor and queries
    mockDocumentModel = jest.fn().mockImplementation((docData) => {
      const docInstance = {
        ...docData,
        _id: new Types.ObjectId(),
        save: jest.fn().mockImplementation(async () => {
          existingDocuments.push(docInstance);
          return docInstance;
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

    mockDocumentModel.findById = jest.fn().mockImplementation((id: string) => ({
      exec: jest.fn().mockResolvedValue(
        existingDocuments.find((d) => d._id.toString() === id.toString()) || null,
      ),
    }));

    mockDocumentModel.findByIdAndUpdate = jest.fn().mockImplementation((id: string, update: any) => {
      const doc = existingDocuments.find((d) => d._id.toString() === id.toString());
      if (doc && update.$set) {
        Object.assign(doc, update.$set);
      }
      return Promise.resolve(doc);
    });

    mockDocumentModel.findOneAndUpdate = jest.fn().mockImplementation((filter: any, update: any) => {
      const doc = existingDocuments.find((d) => d._id.toString() === filter._id.toString());
      if (doc) {
        Object.assign(doc, update.$set);
      }
      return Promise.resolve(doc);
    });

    mockStorageService = {
      saveFile: jest.fn().mockImplementation(async (_buf, _dest, filename) => ({
        filename: `stored_${filename}`,
        storagePath: `users/user-1/documents/stored_${filename}`,
        fileSize: 1024,
      })),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    mockAiGatewayService = {
      inspectDataset: jest.fn().mockResolvedValue({ status: 'ready', sheetNames: [], sheets: [], totalRows: 0 }),
      ingestDocument: jest.fn().mockResolvedValue({ chunkCount: 5 }),
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
          useValue: {},
        },
        {
          provide: AccessRequestsService,
          useValue: {},
        },
        {
          provide: AclResolverService,
          useValue: {},
        },
        {
          provide: FoldersService,
          useValue: {},
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
});
