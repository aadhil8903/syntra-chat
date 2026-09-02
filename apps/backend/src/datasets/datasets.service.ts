import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DatasetEntity, DatasetEntityDocument } from './schemas/dataset.schema';
import {
  IDataset,
  DatasetStatus,
  SupportedDatasetFormat,
  IUser,
  UserRole,
  isUserAdmin,
} from '@enter-chat/shared-types';
import { IStorageService, STORAGE_SERVICE } from '../storage/storage.interface';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { UsersService } from '../users/users.service';
import { AccessRequestsService } from '../access-requests/access-requests.service';
import { AclResolverService } from '../permissions/services/acl-resolver.service';
import { FoldersService } from '../folders/folders.service';
import * as path from 'path';
import {
  resolveUniqueFilenameForModel,
  normalizeFolder,
} from '../common/utils/filename-uniqueness.util';

@Injectable()
export class DatasetsService {
  private readonly logger = new Logger(DatasetsService.name);

  constructor(
    @InjectModel(DatasetEntity.name)
    private readonly datasetModel: Model<DatasetEntityDocument>,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    private readonly aiGatewayService: AiGatewayService,
    private readonly usersService: UsersService,
    private readonly accessRequestsService: AccessRequestsService,
    private readonly aclResolver: AclResolverService,
    private readonly foldersService: FoldersService,
  ) {}

  private mapFileType(extension: string): SupportedDatasetFormat {
    const cleanExt = extension.toLowerCase().replace('.', '');
    switch (cleanExt) {
      case 'csv':
        return SupportedDatasetFormat.CSV;
      case 'xlsx':
        return SupportedDatasetFormat.XLSX;
      case 'xls':
        return SupportedDatasetFormat.XLS;
      default:
        throw new BadRequestException(
          `Unsupported dataset format: .${cleanExt}. Supported: csv, xlsx, xls`,
        );
    }
  }

  async uploadDataset(
    userId: string,
    file: Express.Multer.File,
    folder: string = '',
    allowedDepartments: string[] = [],
  ): Promise<IDataset> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const ext = path.extname(file.originalname);
    const fileType = this.mapFileType(ext);

    const targetFolder = (folder || '').trim();

    // Compute unique filename dynamically to prevent duplicates
    const uniqueOriginalName = await resolveUniqueFilenameForModel(
      this.datasetModel,
      file.originalname,
      targetFolder,
    );

    // Save physical file with canonical unique name
    const destinationSubdir = `users/${userId}/datasets`;
    const saveResult = await this.storageService.saveFile(
      file.buffer,
      destinationSubdir,
      uniqueOriginalName,
    );

    const dataset = new this.datasetModel({
      userId: new Types.ObjectId(userId),
      filename: saveResult.filename,
      originalName: uniqueOriginalName,
      fileType,
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath: saveResult.storagePath,
      folder: targetFolder,
      allowedDepartments,
      status: DatasetStatus.PROCESSING,
      sheetNames: [],
      sheets: [],
      totalRows: 0,
    });

    const saved = await dataset.save();
    const datasetId = saved._id.toString();

    // Trigger AI inspect asynchronously with canonical unique originalName
    this.triggerInspection(userId, datasetId, saveResult.storagePath, saved.originalName, fileType);

    return this.toIDataset(saved);
  }

  async replaceDataset(
    userId: string,
    datasetId: string,
    file: Express.Multer.File,
  ): Promise<IDataset> {
    if (!file) {
      throw new BadRequestException('No replacement file provided');
    }
    if (!Types.ObjectId.isValid(datasetId)) {
      throw new NotFoundException('Dataset not found');
    }

    const existingDs = await this.datasetModel.findById(datasetId).exec();
    if (!existingDs) {
      throw new NotFoundException('Dataset not found');
    }

    // Permission check: User must be admin or dataset owner
    const user = await this.usersService.findById(userId);
    const isAdmin = isUserAdmin(user);
    const isOwner = existingDs.userId ? existingDs.userId.toString() === userId : false;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('You do not have permission to replace this dataset');
    }

    // Validate replacement format (must be csv/xlsx/xls)
    const newExt = path.extname(file.originalname);
    const newFileType = this.mapFileType(newExt);

    const oldStoragePath = existingDs.storagePath;

    // Save replacement file into user's storage with existing canonical originalName
    const destinationSubdir = `users/${existingDs.userId}/datasets`;
    const saveResult = await this.storageService.saveFile(
      file.buffer,
      destinationSubdir,
      existingDs.originalName,
    );

    // Update dataset record while preserving ID, folder, originalName, allowedDepartments, ownership
    existingDs.filename = saveResult.filename;
    existingDs.storagePath = saveResult.storagePath;
    existingDs.fileSize = file.size;
    existingDs.mimeType = file.mimetype;
    existingDs.fileType = newFileType;
    existingDs.status = DatasetStatus.PROCESSING;
    existingDs.errorMessage = '';
    existingDs.sheetNames = [];
    existingDs.sheets = [];
    existingDs.totalRows = 0;

    const saved = await existingDs.save();

    // Safely delete old physical storage file if different
    if (oldStoragePath && oldStoragePath !== saveResult.storagePath) {
      try {
        await this.storageService.deleteFile(oldStoragePath);
      } catch (err: any) {
        this.logger.warn(`Could not delete old dataset file at ${oldStoragePath}: ${err.message}`);
      }
    }

    // Trigger AI inspect asynchronously
    this.triggerInspection(
      userId,
      datasetId,
      saveResult.storagePath,
      saved.originalName,
      newFileType,
    );

    return this.toIDataset(saved);
  }

  async retryInspection(userId: string, datasetId: string): Promise<IDataset> {
    const ds = await this.findOneAccessible(userId, datasetId);
    await this.datasetModel.findByIdAndUpdate(datasetId, {
      $set: { status: DatasetStatus.PROCESSING, errorMessage: '' },
    });
    this.triggerInspection(userId, datasetId, ds.storagePath, ds.originalName, ds.fileType);
    return this.findOneAccessible(userId, datasetId);
  }

  private async triggerInspection(
    userId: string,
    datasetId: string,
    storagePath: string,
    filename: string,
    fileType: string,
  ): Promise<void> {
    try {
      const result = await this.aiGatewayService.inspectDataset({
        userId,
        datasetId,
        storagePath,
        filename,
        fileType,
      });

      await this.datasetModel.findByIdAndUpdate(datasetId, {
        $set: {
          status: result.status === 'ready' ? DatasetStatus.READY : DatasetStatus.FAILED,
          sheetNames: result.sheetNames || [],
          sheets: result.sheets || [],
          totalRows: result.totalRows || 0,
          errorMessage: result.errorMessage,
        },
      });
      this.logger.log(`Dataset ${datasetId} inspected successfully with ${result.totalRows} rows`);
    } catch (err: any) {
      this.logger.error(`Failed to inspect dataset ${datasetId}: ${err.message}`);
      await this.datasetModel.findByIdAndUpdate(datasetId, {
        $set: {
          status: DatasetStatus.FAILED,
          errorMessage: err.message || 'Failed to inspect dataset',
        },
      });
    }
  }

  async updateFolderAndDeps(
    userId: string,
    datasetId: string,
    folder: string,
    allowedDepartments?: string[]
  ): Promise<IDataset> {
    if (!Types.ObjectId.isValid(datasetId)) {
      throw new NotFoundException('Dataset not found');
    }

    const existingDs = await this.datasetModel.findById(datasetId);
    if (!existingDs) {
      throw new NotFoundException('Dataset not found');
    }

    const targetFolder = normalizeFolder(folder);
    let finalOriginalName = existingDs.originalName;

    if (existingDs.folder !== targetFolder) {
      finalOriginalName = await resolveUniqueFilenameForModel(
        this.datasetModel,
        existingDs.originalName,
        targetFolder,
        existingDs._id,
      );
    }

    const update: any = { folder: targetFolder, originalName: finalOriginalName };
    if (allowedDepartments) {
      update.allowedDepartments = allowedDepartments;
    }

    const ds = await this.datasetModel.findOneAndUpdate(
      { _id: new Types.ObjectId(datasetId) },
      { $set: update },
      { new: true },
    );

    return this.toIDataset(ds!);
  }

  private buildAccessQuery(user: IUser, approvedIds: string[] = []): any {
    if (isUserAdmin(user)) {
      return {};
    }
    const userObjId = Types.ObjectId.isValid(user.id) ? new Types.ObjectId(user.id) : null;
    const objIds = approvedIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));

    const baseClauses: any[] = [];
    if (userObjId) baseClauses.push({ userId: userObjId });
    if (objIds.length > 0) baseClauses.push({ _id: { $in: objIds } });

    if (user.departments && user.departments.length > 0) {
      baseClauses.push({ allowedDepartments: { $in: user.departments } });
    }
    baseClauses.push({ allowedDepartments: { $size: 0 } }, { allowedDepartments: { $exists: false } }, { allowedDepartments: null });

    // Folder ACL filter: Strictly limit to the exact allowedFolders chosen for the user
    if (user.allowedFolders && user.allowedFolders.length > 0) {
      return {
        $and: [
          { $or: baseClauses },
          {
            $or: [
              ...(userObjId ? [{ userId: userObjId }] : []),
              ...(objIds.length > 0 ? [{ _id: { $in: objIds } }] : []),
              { folder: { $in: user.allowedFolders } },
            ],
          },
        ],
      };
    }

    return { $or: baseClauses };
  }

  async findAllAccessible(userId: string): Promise<IDataset[]> {
    const user = await this.usersService.findById(userId);
    const isAdmin = isUserAdmin(user);
    let approvedIds: string[] = [];
    const requestStatusMap = new Map<string, 'pending' | 'approved' | 'rejected'>();

    if (!isAdmin) {
      approvedIds = await this.accessRequestsService.getApprovedResourceIdsForUser(userId);
      const userRequests = await this.accessRequestsService.getUserRequests(userId);
      for (const req of userRequests) {
        requestStatusMap.set(req.resourceId, req.status as any);
        if (req.folderPath) {
          requestStatusMap.set(req.folderPath, req.status as any);
        }
      }
    }

    const allDatasets = await this.datasetModel.find({}).sort({ createdAt: -1 }).exec();
    const userDepartments = user?.departments || [];

    const allFolders = await this.foldersService.findAll();
    const foldersMap = new Map<string, string[]>();
    for (const f of allFolders) {
      foldersMap.set(f.name, f.allowedDepartments || []);
    }

    const results: IDataset[] = [];
    for (const d of allDatasets) {
      const dsDto = this.toIDataset(d);
      const dsIdStr = d._id.toString();

      if (isAdmin) {
        dsDto.hasAccess = true;
        dsDto.requestStatus = null;
      } else if (d.userId.toString() === userId || approvedIds.includes(dsIdStr)) {
        dsDto.hasAccess = true;
        dsDto.requestStatus = requestStatusMap.get(dsIdStr) || (d.folder ? requestStatusMap.get(d.folder) : null) || null;
      } else {
        const hasDeptAccess =
          !d.allowedDepartments ||
          d.allowedDepartments.length === 0 ||
          d.allowedDepartments.some((dept) => userDepartments.includes(dept));

        const hasFolderAccess = await this.aclResolver.canUserAccessFolder(
          userId,
          d.folder || '',
          user,
          foldersMap,
        );

        dsDto.hasAccess = hasDeptAccess && hasFolderAccess;
        dsDto.requestStatus = requestStatusMap.get(dsIdStr) || (d.folder ? requestStatusMap.get(d.folder) : null) || null;
      }

      if (!dsDto.hasAccess) {
        dsDto.sheets = [];
        dsDto.sheetNames = [];
      }

      results.push(dsDto);
    }
    return results;
  }

  async findOneAccessible(userId: string, datasetId: string): Promise<IDataset> {
    if (!Types.ObjectId.isValid(datasetId)) {
      throw new NotFoundException('Dataset not found');
    }

    const user = await this.usersService.findById(userId);
    const isAdmin = isUserAdmin(user);
    let approvedIds: string[] = [];

    if (!isAdmin) {
      approvedIds = await this.accessRequestsService.getApprovedResourceIdsForUser(userId);
    }

    const dataset = await this.datasetModel.findById(datasetId);

    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }

    if (isAdmin) {
      const dsDto = this.toIDataset(dataset);
      dsDto.hasAccess = true;
      return dsDto;
    }

    const isOwner = dataset.userId.toString() === userId;
    const hasDeptAccess =
      !dataset.allowedDepartments ||
      dataset.allowedDepartments.length === 0 ||
      dataset.allowedDepartments.some((dept) => (user?.departments || []).includes(dept));

    const hasFolderAccess = await this.aclResolver.canUserAccessFolder(userId, dataset.folder || '', user);

    if (!isOwner && !approvedIds.includes(datasetId) && (!hasDeptAccess || !hasFolderAccess)) {
      throw new NotFoundException('Dataset not found or access denied');
    }

    const dsDto = this.toIDataset(dataset);
    dsDto.hasAccess = true;
    return dsDto;
  }

  async deleteDataset(userId: string, datasetId: string): Promise<void> {
    if (!Types.ObjectId.isValid(datasetId)) {
      throw new NotFoundException('Dataset not found');
    }

    const dataset = await this.datasetModel.findOneAndDelete({
      _id: new Types.ObjectId(datasetId),
    });

    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }

    // Delete stored file
    await this.storageService.deleteFile(dataset.storagePath);
  }

  toIDataset(doc: DatasetEntityDocument): IDataset {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      filename: doc.filename,
      originalName: doc.originalName,
      fileType: doc.fileType,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      storagePath: doc.storagePath,
      allowedDepartments: doc.allowedDepartments || [],
      folder: doc.folder || '',
      status: doc.status,
      sheetNames: doc.sheetNames,
      sheets: doc.sheets,
      totalRows: doc.totalRows,
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: doc.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }
}
