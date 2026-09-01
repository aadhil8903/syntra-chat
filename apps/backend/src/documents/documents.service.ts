import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentEntity, DocumentEntityDocument } from './schemas/document.schema';
import {
  IDocument,
  DocumentStatus,
  SupportedDocumentFormat,
  IUser,
  UserRole,
  isUserAdmin,
} from '@enter-chat/shared-types';
import { IStorageService, STORAGE_SERVICE } from '../storage/storage.interface';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import * as path from 'path';
import { UsersService } from '../users/users.service';
import { AccessRequestsService } from '../access-requests/access-requests.service';
import { AclResolverService } from '../permissions/services/acl-resolver.service';
import { FoldersService } from '../folders/folders.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentEntityDocument>,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    private readonly aiGatewayService: AiGatewayService,
    private readonly usersService: UsersService,
    private readonly accessRequestsService: AccessRequestsService,
    private readonly aclResolver: AclResolverService,
    private readonly foldersService: FoldersService,
  ) {}

  private mapFileType(extension: string): SupportedDocumentFormat {
    const cleanExt = extension.toLowerCase().replace('.', '');
    switch (cleanExt) {
      case 'pdf':
        return SupportedDocumentFormat.PDF;
      case 'docx':
        return SupportedDocumentFormat.DOCX;
      case 'txt':
        return SupportedDocumentFormat.TXT;
      case 'md':
      case 'markdown':
        return SupportedDocumentFormat.MD;
      case 'json':
        return SupportedDocumentFormat.JSON;
      case 'csv':
        return SupportedDocumentFormat.CSV;
      case 'xlsx':
        return SupportedDocumentFormat.XLSX;
      case 'xls':
        return SupportedDocumentFormat.XLS;
      default:
        throw new BadRequestException(
          `Unsupported file format: .${cleanExt}. Supported: pdf, docx, txt, md, json, csv, xlsx, xls`,
        );
    }
  }

  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
    folder: string = '',
    allowedDepartments: string[] = []
  ): Promise<IDocument> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const ext = path.extname(file.originalname);
    const fileType = this.mapFileType(ext);
    const isTabular = ['csv', 'xlsx', 'xls'].includes(fileType);

    // Save to user-isolated folder
    const destinationSubdir = `users/${userId}/documents`;
    const saveResult = await this.storageService.saveFile(
      file.buffer,
      destinationSubdir,
      file.originalname,
    );

    const doc = new this.documentModel({
      userId: new Types.ObjectId(userId),
      filename: saveResult.filename,
      originalName: file.originalname,
      fileType,
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath: saveResult.storagePath,
      folder: folder.trim(),
      allowedDepartments,
      status: DocumentStatus.PROCESSING,
      sourceType: isTabular ? 'tabular' : 'narrative',
      chunkCount: 0,
      sheetNames: [],
      sheets: [],
      totalRows: 0,
    });

    const savedDoc = await doc.save();
    const docId = savedDoc._id.toString();

    // Trigger AI RAG Ingestion asynchronously in background
    this.triggerIngestion(userId, docId, saveResult.storagePath, file.originalname, fileType);

    return this.toIDocument(savedDoc);
  }

  async retryIngestion(userId: string, documentId: string): Promise<IDocument> {
    const doc = await this.findOneAccessible(userId, documentId);
    await this.documentModel.findByIdAndUpdate(documentId, {
      $set: { status: DocumentStatus.PROCESSING, errorMessage: '' },
    });
    this.triggerIngestion(userId, documentId, doc.storagePath, doc.originalName, doc.fileType);
    return this.findOneAccessible(userId, documentId);
  }

  private async triggerIngestion(
    userId: string,
    documentId: string,
    storagePath: string,
    filename: string,
    fileType: string,
  ): Promise<void> {
    const isTabular = ['csv', 'xlsx', 'xls'].includes(fileType.toLowerCase().replace('.', ''));

    try {
      if (isTabular) {
        // 1. Inspect sheet schema, columns, and preview rows
        const inspectRes = await this.aiGatewayService.inspectDataset({
          userId,
          datasetId: documentId,
          storagePath,
          filename,
          fileType,
        });

        // 2. Also generate embeddings for semantic retrieval across the spreadsheet
        const ingestRes = await this.aiGatewayService.ingestDocument({
          userId,
          documentId,
          storagePath,
          filename,
          fileType,
        }).catch(() => ({ status: 'ready', chunkCount: 1 }));

        await this.documentModel.findByIdAndUpdate(documentId, {
          $set: {
            status: inspectRes.status === 'ready' || (inspectRes.sheets && inspectRes.sheets.length > 0) ? DocumentStatus.READY : DocumentStatus.FAILED,
            sheetNames: inspectRes.sheetNames || [],
            sheets: inspectRes.sheets || [],
            totalRows: inspectRes.totalRows || 0,
            chunkCount: ingestRes.chunkCount || 0,
            sourceType: 'tabular',
            errorMessage: inspectRes.errorMessage,
          },
        });
        this.logger.log(`Tabular dataset ${documentId} (${filename}) inspected: ${inspectRes.totalRows} rows across ${inspectRes.sheetNames?.length || 0} sheets`);
      } else {
        // Narrative text document
        const result = await this.aiGatewayService.ingestDocument({
          userId,
          documentId,
          storagePath,
          filename,
          fileType,
        });

        if (result.status === 'failed' || result.chunkCount === 0) {
          await this.documentModel.findByIdAndUpdate(documentId, {
            $set: {
              status: DocumentStatus.FAILED,
              chunkCount: 0,
              sourceType: 'narrative',
              errorMessage: result.errorMessage || 'No text extracted from document',
            },
          });
          this.logger.warn(`Document ${documentId} ingestion failed: ${result.errorMessage || '0 chunks extracted'}`);
        } else {
          await this.documentModel.findByIdAndUpdate(documentId, {
            $set: {
              status: DocumentStatus.READY,
              chunkCount: result.chunkCount || 0,
              sourceType: 'narrative',
              errorMessage: null,
            },
          });
          this.logger.log(`Document ${documentId} ingested successfully with ${result.chunkCount} chunks`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to ingest document ${documentId}: ${err.message}`);
      await this.documentModel.findByIdAndUpdate(documentId, {
        $set: {
          status: DocumentStatus.FAILED,
          errorMessage: err.message || 'Failed to ingest document',
        },
      });
    }
  }

  async updateFolderAndDeps(
    userId: string,
    documentId: string,
    folder: string,
    allowedDepartments?: string[]
  ): Promise<IDocument> {
    if (!Types.ObjectId.isValid(documentId)) {
      throw new NotFoundException('Document not found');
    }

    const update: any = { folder: folder.trim() };
    if (allowedDepartments) {
      update.allowedDepartments = allowedDepartments;
    }

    const doc = await this.documentModel.findOneAndUpdate(
      { _id: new Types.ObjectId(documentId) },
      { $set: update },
      { new: true },
    );

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    return this.toIDocument(doc);
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

  async findAllAccessible(userId: string): Promise<IDocument[]> {
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

    const allDocs = await this.documentModel.find({}).sort({ createdAt: -1 }).exec();
    const userDepartments = user?.departments || [];

    const allFolders = await this.foldersService.findAll();
    const foldersMap = new Map<string, string[]>();
    for (const f of allFolders) {
      foldersMap.set(f.name, f.allowedDepartments || []);
    }

    const results: IDocument[] = [];
    for (const d of allDocs) {
      const docDto = this.toIDocument(d);
      const docIdStr = d._id.toString();

      if (isAdmin) {
        docDto.hasAccess = true;
        docDto.requestStatus = null;
      } else if (d.userId.toString() === userId || approvedIds.includes(docIdStr)) {
        docDto.hasAccess = true;
        docDto.requestStatus = requestStatusMap.get(docIdStr) || (d.folder ? requestStatusMap.get(d.folder) : null) || null;
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

        docDto.hasAccess = hasDeptAccess && hasFolderAccess;
        docDto.requestStatus = requestStatusMap.get(docIdStr) || (d.folder ? requestStatusMap.get(d.folder) : null) || null;
      }

      results.push(docDto);
    }
    return results;
  }

  async findOneAccessible(userId: string, documentId: string): Promise<IDocument> {
    if (!Types.ObjectId.isValid(documentId)) {
      throw new NotFoundException('Document not found');
    }

    const user = await this.usersService.findById(userId);
    const isAdmin = isUserAdmin(user);
    let approvedIds: string[] = [];

    if (!isAdmin) {
      approvedIds = await this.accessRequestsService.getApprovedResourceIdsForUser(userId);
    }

    const doc = await this.documentModel.findById(documentId);

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    if (isAdmin) {
      const docDto = this.toIDocument(doc);
      docDto.hasAccess = true;
      return docDto;
    }

    const isOwner = doc.userId.toString() === userId;
    const hasDeptAccess =
      !doc.allowedDepartments ||
      doc.allowedDepartments.length === 0 ||
      doc.allowedDepartments.some((dept) => (user?.departments || []).includes(dept));

    const hasFolderAccess = await this.aclResolver.canUserAccessFolder(userId, doc.folder || '', user);

    if (!isOwner && !approvedIds.includes(documentId) && (!hasDeptAccess || !hasFolderAccess)) {
      throw new NotFoundException('Document not found or access denied');
    }

    const docDto = this.toIDocument(doc);
    docDto.hasAccess = true;
    return docDto;
  }

  async deleteDocument(userId: string, documentId: string): Promise<void> {
    if (!Types.ObjectId.isValid(documentId)) {
      throw new NotFoundException('Document not found');
    }

    const doc = await this.documentModel.findOneAndDelete({
      _id: new Types.ObjectId(documentId)
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    // Delete stored file
    await this.storageService.deleteFile(doc.storagePath);
  }

  toIDocument(doc: DocumentEntityDocument): IDocument {
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
      chunkCount: doc.chunkCount || 0,
      sheetNames: doc.sheetNames || [],
      sheets: doc.sheets || [],
      totalRows: doc.totalRows || 0,
      sourceType: (doc.sourceType as any) || (['csv', 'xlsx', 'xls'].includes(doc.fileType) ? 'tabular' : 'narrative'),
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: doc.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }
}
