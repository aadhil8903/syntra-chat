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
        save: jest.fn().mockImplementation(async function (this: any) {
          const self = this || dsInstance;
          const idx = existingDatasets.findIndex((d) => d._id.toString() === self._id.toString());
          if (idx >= 0) {
            existingDatasets[idx] = self;
          } else {
            existingDatasets.push(self);
          }
          return self;
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
      exec: jest.fn().mockImplementation(() => {
        const found = existingDatasets.find((d) => d._id.toString() === id.toString()) || null;
        return Promise.resolve(found);
      }),
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
          useValue: {
            findById: jest.fn().mockImplementation((id: string) =>
              Promise.resolve({
                _id: new Types.ObjectId(id),
                id,
                role: id === '507f1f77bcf86cd799439011' ? 'ADMIN' : 'MEMBER',
              }),
            ),
          },
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
      size: 1024,
      buffer: Buffer.from('mock'),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const upload1 = await service.uploadDataset('507f1f77bcf86cd799439011', mockFile, 'Sales');
    expect(upload1.originalName).toBe('11_sales_pipeline.xlsx');

    const upload2 = await service.uploadDataset('507f1f77bcf86cd799439011', mockFile, 'Sales');
    expect(upload2.originalName).toBe('11_sales_pipeline (1).xlsx');

    const upload3 = await service.uploadDataset('507f1f77bcf86cd799439011', mockFile, 'Sales');
    expect(upload3.originalName).toBe('11_sales_pipeline (2).xlsx');

    const upload4 = await service.uploadDataset('507f1f77bcf86cd799439011', mockFile, 'Sales');
    expect(upload4.originalName).toBe('11_sales_pipeline (3).xlsx');
  });

  it('should replace an existing dataset without creating duplicates', async () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: '11_sales_pipeline.xlsx',
      encoding: '7bit',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 1024,
      buffer: Buffer.from('initial'),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const upload1 = await service.uploadDataset('507f1f77bcf86cd799439011', mockFile, 'Sales');
    expect(upload1.originalName).toBe('11_sales_pipeline.xlsx');
    expect(existingDatasets.length).toBe(1);

    const replacement: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'new_pipeline.xlsx',
      encoding: '7bit',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 3048,
      buffer: Buffer.from('updated content'),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const replaced = await service.replaceDataset('507f1f77bcf86cd799439011', upload1.id, replacement);
    expect(replaced.id).toBe(upload1.id);
    expect(replaced.originalName).toBe('11_sales_pipeline.xlsx');
    expect(replaced.fileSize).toBe(3048);
    expect(existingDatasets.length).toBe(1);
  });
});
