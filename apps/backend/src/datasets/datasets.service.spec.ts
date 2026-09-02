import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { DatasetsService } from './datasets.service';
import { DatasetEntity } from './schemas/dataset.schema';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { UsersService } from '../users/users.service';
import { AccessRequestsService } from '../access-requests/access-requests.service';
import { AclResolverService } from '../permissions/services/acl-resolver.service';
import { FoldersService } from '../folders/folders.service';
import { Types } from 'mongoose';

describe('DatasetsService - Dynamic Duplicate Filename Handling', () => {
  let service: DatasetsService;
  let mockDatasetModel: any;
  let mockStorageService: any;
  let mockAiGatewayService: any;
  let existingDatasets: any[] = [];

  beforeEach(async () => {
    existingDatasets = [];

    mockDatasetModel = jest.fn().mockImplementation((dsData) => {
      const dsInstance = {
        ...dsData,
        _id: new Types.ObjectId(),
        save: jest.fn().mockImplementation(async () => {
          existingDatasets.push(dsInstance);
          return dsInstance;
        }),
      };
      return dsInstance;
    });

    mockDatasetModel.find = jest.fn().mockImplementation((filter: any) => {
      let filtered = [...existingDatasets];
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

    mockDatasetModel.findById = jest.fn().mockImplementation((id: string) => ({
      exec: jest.fn().mockResolvedValue(
        existingDatasets.find((d) => d._id.toString() === id.toString()) || null,
      ),
    }));

    mockDatasetModel.findByIdAndUpdate = jest.fn().mockImplementation((id: string, update: any) => {
      const doc = existingDatasets.find((d) => d._id.toString() === id.toString());
      if (doc && update.$set) {
        Object.assign(doc, update.$set);
      }
      return Promise.resolve(doc);
    });

    mockDatasetModel.findOneAndUpdate = jest.fn().mockImplementation((filter: any, update: any) => {
      const doc = existingDatasets.find((d) => d._id.toString() === filter._id.toString());
      if (doc) {
        Object.assign(doc, update.$set);
      }
      return Promise.resolve(doc);
    });

    mockStorageService = {
      saveFile: jest.fn().mockImplementation(async (_buf, _dest, filename) => ({
        filename: `stored_${filename}`,
        storagePath: `users/user-1/datasets/stored_${filename}`,
        fileSize: 2048,
      })),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    mockAiGatewayService = {
      inspectDataset: jest.fn().mockResolvedValue({ status: 'ready', sheetNames: ['Sheet1'], sheets: [], totalRows: 100 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetsService,
        {
          provide: getModelToken(DatasetEntity.name),
          useValue: mockDatasetModel,
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

    service = module.get<DatasetsService>(DatasetsService);
  });

  it('should sequentially assign dynamic unique filenames when uploading 4 identical datasets to the same folder', async () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: '11_sales_pipeline.xlsx',
      encoding: '7bit',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 2048,
      buffer: Buffer.from('mock'),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const upload1 = await service.uploadDataset('507f1f77bcf86cd799439011', mockFile, 'Analytics');
    expect(upload1.originalName).toBe('11_sales_pipeline.xlsx');

    const upload2 = await service.uploadDataset('507f1f77bcf86cd799439011', mockFile, 'Analytics');
    expect(upload2.originalName).toBe('11_sales_pipeline (1).xlsx');

    const upload3 = await service.uploadDataset('507f1f77bcf86cd799439011', mockFile, 'Analytics');
    expect(upload3.originalName).toBe('11_sales_pipeline (2).xlsx');

    const upload4 = await service.uploadDataset('507f1f77bcf86cd799439011', mockFile, 'Analytics');
    expect(upload4.originalName).toBe('11_sales_pipeline (3).xlsx');
  });
});
