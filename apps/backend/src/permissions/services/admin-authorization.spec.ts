import { Test, TestingModule } from '@nestjs/testing';
import { DatasetsService } from '../../datasets/datasets.service';
import { DocumentsService } from '../../documents/documents.service';
import { getModelToken } from '@nestjs/mongoose';
import { DatasetEntity } from '../../datasets/schemas/dataset.schema';
import { DocumentEntity } from '../../documents/schemas/document.schema';
import { UsersService } from '../../users/users.service';
import { AccessRequestsService } from '../../access-requests/access-requests.service';
import { AclResolverService } from './acl-resolver.service';
import { FoldersService } from '../../folders/folders.service';
import { STORAGE_SERVICE } from '../../storage/storage.interface';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('Administrator Authorization Override & Isolation (Datasets & Documents)', () => {
  let datasetsService: DatasetsService;
  let documentsService: DocumentsService;
  let usersService: jest.Mocked<any>;
  let accessRequestsService: jest.Mocked<any>;
  let aclResolver: jest.Mocked<any>;
  let foldersService: jest.Mocked<any>;
  let mockDatasetModel: any;
  let mockDocumentModel: any;

  const adminUserId = '507f1f77bcf86cd799439099';
  const normalUserId = '507f1f77bcf86cd799439011';
  const ownerUserId = '507f1f77bcf86cd799439022';
  const datasetId = '607f1f77bcf86cd799439001';
  const documentId = '607f1f77bcf86cd799439002';

  const mockAdminUser = {
    id: adminUserId,
    _id: adminUserId,
    email: 'admin@syntrachat.internal',
    role: 'admin',
    departments: ['IT'],
    allowedFolders: ['Public'],
  };

  const mockNormalUser = {
    id: normalUserId,
    _id: normalUserId,
    email: 'user@syntrachat.internal',
    role: 'user',
    departments: ['Marketing'],
    allowedFolders: ['Public'],
  };

  const mockDatasetDoc = {
    _id: new Types.ObjectId(datasetId),
    userId: new Types.ObjectId(ownerUserId),
    originalName: 'Financial_Analytics.csv',
    filename: 'financial_analytics.csv',
    fileType: 'csv',
    folder: 'Restricted/Finance',
    allowedDepartments: ['Finance'],
    status: 'ready',
    sheets: [{ name: 'Sheet1', rowCount: 100, columns: [{ name: 'Revenue', type: 'number' }] }],
    sheetNames: ['Sheet1'],
    totalRows: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDocumentDoc = {
    _id: new Types.ObjectId(documentId),
    userId: new Types.ObjectId(ownerUserId),
    originalName: 'Company_Strategy.pdf',
    filename: 'company_strategy.pdf',
    fileType: 'pdf',
    folder: 'Restricted/Confidential',
    allowedDepartments: ['Executive'],
    status: 'ready',
    chunkCount: 15,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    usersService = {
      findById: jest.fn(),
    };

    accessRequestsService = {
      getApprovedResourceIdsForUser: jest.fn().mockResolvedValue([]),
      getUserRequests: jest.fn().mockResolvedValue([]),
      createRequest: jest.fn(),
    };

    aclResolver = {
      canUserAccessFolder: jest.fn(),
    };

    foldersService = {
      findAll: jest.fn().mockResolvedValue([]),
    };

    mockDatasetModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockDatasetDoc]),
        }),
      }),
      findById: jest.fn(),
      findOne: jest.fn(),
    };

    mockDocumentModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockDocumentDoc]),
        }),
      }),
      findById: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetsService,
        DocumentsService,
        { provide: getModelToken(DatasetEntity.name), useValue: mockDatasetModel },
        { provide: getModelToken(DocumentEntity.name), useValue: mockDocumentModel },
        { provide: UsersService, useValue: usersService },
        { provide: AccessRequestsService, useValue: accessRequestsService },
        { provide: AclResolverService, useValue: aclResolver },
        { provide: FoldersService, useValue: foldersService },
        { provide: STORAGE_SERVICE, useValue: {} },
        { provide: AiGatewayService, useValue: {} },
      ],
    }).compile();

    datasetsService = module.get<DatasetsService>(DatasetsService);
    documentsService = module.get<DocumentsService>(DocumentsService);
  });

  describe('Datasets Authorization', () => {
    it('admin can list all datasets and receives full access with intact sheets', async () => {
      usersService.findById.mockResolvedValue(mockAdminUser);

      const datasets = await datasetsService.findAllAccessible(adminUserId);
      expect(datasets.length).toBe(1);
      expect(datasets[0].hasAccess).toBe(true);
      expect(datasets[0].requestStatus).toBeNull();
      expect(datasets[0].sheets.length).toBe(1);
      expect(datasets[0].sheetNames).toContain('Sheet1');
    });

    it('admin can view a restricted dataset owned by another user', async () => {
      usersService.findById.mockResolvedValue(mockAdminUser);
      mockDatasetModel.findById.mockResolvedValue(mockDatasetDoc);

      const dataset = await datasetsService.findOneAccessible(adminUserId, datasetId);
      expect(dataset).toBeDefined();
      expect(dataset.hasAccess).toBe(true);
      expect(dataset.originalName).toBe('Financial_Analytics.csv');
    });

    it('normal unauthorized user receives hasAccess=false and stripped sheets in list', async () => {
      usersService.findById.mockResolvedValue(mockNormalUser);
      aclResolver.canUserAccessFolder.mockResolvedValue(false);

      const datasets = await datasetsService.findAllAccessible(normalUserId);
      expect(datasets.length).toBe(1);
      expect(datasets[0].hasAccess).toBe(false);
      expect(datasets[0].sheets.length).toBe(0);
      expect(datasets[0].sheetNames.length).toBe(0);
    });

    it('normal unauthorized user is rejected with NotFoundException on findOneAccessible', async () => {
      usersService.findById.mockResolvedValue(mockNormalUser);
      mockDatasetModel.findById.mockResolvedValue(mockDatasetDoc);
      aclResolver.canUserAccessFolder.mockResolvedValue(false);

      await expect(datasetsService.findOneAccessible(normalUserId, datasetId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('normal user with approved access request can access the dataset', async () => {
      usersService.findById.mockResolvedValue(mockNormalUser);
      mockDatasetModel.findById.mockResolvedValue(mockDatasetDoc);
      accessRequestsService.getApprovedResourceIdsForUser.mockResolvedValue([datasetId]);

      const dataset = await datasetsService.findOneAccessible(normalUserId, datasetId);
      expect(dataset.hasAccess).toBe(true);
    });
  });

  describe('Documents Authorization', () => {
    it('admin can list all documents and receives full access unconditionally', async () => {
      usersService.findById.mockResolvedValue(mockAdminUser);

      const docs = await documentsService.findAllAccessible(adminUserId);
      expect(docs.length).toBe(1);
      expect(docs[0].hasAccess).toBe(true);
      expect(docs[0].requestStatus).toBeNull();
    });

    it('admin can view a restricted document owned by another user', async () => {
      usersService.findById.mockResolvedValue(mockAdminUser);
      mockDocumentModel.findById.mockResolvedValue(mockDocumentDoc);

      const doc = await documentsService.findOneAccessible(adminUserId, documentId);
      expect(doc).toBeDefined();
      expect(doc.hasAccess).toBe(true);
      expect(doc.originalName).toBe('Company_Strategy.pdf');
    });

    it('normal unauthorized user is denied access to restricted document', async () => {
      usersService.findById.mockResolvedValue(mockNormalUser);
      mockDocumentModel.findById.mockResolvedValue(mockDocumentDoc);
      aclResolver.canUserAccessFolder.mockResolvedValue(false);

      await expect(documentsService.findOneAccessible(normalUserId, documentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
