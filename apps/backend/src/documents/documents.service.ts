import {
  Injectable,
  Inject,
  Optional,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentEntity, DocumentEntityDocument } from './schemas/document.schema';
import { DatasetEntity, DatasetEntityDocument } from '../datasets/schemas/dataset.schema';
import {
  IDocument,
  DocumentStatus,
  SupportedDocumentFormat,
  IUser,
  UserRole,
  isUserAdmin,
  IActiveScope,
  DocumentDownloadPolicy,
  DownloadPolicyState,
} from '@enter-chat/shared-types';
import { IStorageService, STORAGE_SERVICE } from '../storage/storage.interface';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import * as path from 'path';
import { UsersService } from '../users/users.service';
import { AccessRequestsService } from '../access-requests/access-requests.service';
import { AclResolverService } from '../permissions/services/acl-resolver.service';
import { FoldersService } from '../folders/folders.service';
import {
  resolveUniqueFilenameForModel,
  normalizeFolder,
} from '../common/utils/filename-uniqueness.util';

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
    @Optional()
    @InjectModel(DatasetEntity.name)
    private readonly datasetModel?: Model<DatasetEntityDocument>,
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
    allowedDepartments: string[] = [],
    downloadPolicy: 'inherit' | 'allowed' | 'restricted' = 'inherit',
  ): Promise<IDocument> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const ext = path.extname(file.originalname);
    const fileType = this.mapFileType(ext);
    const isTabular = ['csv', 'xlsx', 'xls'].includes(fileType);
    const targetFolder = normalizeFolder(folder);

    // Dynamically resolve unique filename in target folder
    const uniqueOriginalName = await resolveUniqueFilenameForModel(
      this.documentModel,
      file.originalname,
      targetFolder,
    );

    // Save to user-isolated folder
    const destinationSubdir = `users/${userId}/documents`;
    const saveResult = await this.storageService.saveFile(
      file.buffer,
      destinationSubdir,
      uniqueOriginalName,
    );

    const doc = new this.documentModel({
      userId: new Types.ObjectId(userId),
      filename: saveResult.filename,
      originalName: uniqueOriginalName,
      fileType,
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath: saveResult.storagePath,
      folder: targetFolder,
      allowedDepartments,
      downloadPolicy: downloadPolicy || 'inherit',
      status: DocumentStatus.PROCESSING,
      sourceType: isTabular ? 'tabular' : 'narrative',
      chunkCount: 0,
      sheetNames: [],
      sheets: [],
      totalRows: 0,
    });

    const savedDoc = await doc.save();
    const docId = savedDoc._id.toString();

    // Trigger AI RAG Ingestion asynchronously in background with canonical unique originalName
    this.triggerIngestion(userId, docId, saveResult.storagePath, savedDoc.originalName, fileType);

    let folderPolicy: string | undefined;
    if (targetFolder && this.foldersService?.findByName) {
      const f = await this.foldersService.findByName(targetFolder);
      if (f) folderPolicy = f.downloadPolicy;
    }

    return this.toIDocument(savedDoc, folderPolicy);
  }

  async uploadDirectAttachment(
    userId: string,
    file: Express.Multer.File,
  ): Promise<IDocument> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const ext = path.extname(file.originalname);
    const fileType = this.mapFileType(ext);
    const isTabular = ['csv', 'xlsx', 'xls'].includes(fileType);

    // Dynamically resolve unique filename
    const uniqueOriginalName = await resolveUniqueFilenameForModel(
      this.documentModel,
      file.originalname,
      '',
    );

    // Save to user-isolated folder in GridFS
    const destinationSubdir = `users/${userId}/direct_attachments`;
    const saveResult = await this.storageService.saveFile(
      file.buffer,
      destinationSubdir,
      uniqueOriginalName,
    );

    try {
      const doc = new this.documentModel({
        userId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : (userId as any),
        filename: saveResult.filename,
        originalName: uniqueOriginalName,
        fileType,
        mimeType: file.mimetype || 'application/octet-stream',
        fileSize: file.size,
        storagePath: saveResult.storagePath,
        folder: '',
        allowedDepartments: [],
        downloadPolicy: 'allowed',
        status: DocumentStatus.READY,
        sourceType: isTabular ? 'tabular' : 'narrative',
        chunkCount: 0,
        sheetNames: [],
        sheets: [],
        totalRows: 0,
      });

      const savedDoc = await doc.save();
      return this.toIDocument(savedDoc);
    } catch (err) {
      this.logger.error(`Document metadata creation failed for direct attachment ${saveResult.storagePath}. Cleaning up GridFS file...`);
      await this.storageService.deleteFile(saveResult.storagePath).catch((cleanupErr: any) => {
        this.logger.warn(`Failed to cleanup orphaned GridFS file ${saveResult.storagePath}: ${cleanupErr.message}`);
      });
      throw err;
    }
  }

  async replaceDocument(
    userId: string,
    documentId: string,
    file: Express.Multer.File,
  ): Promise<IDocument> {
    if (!file) {
      throw new BadRequestException('No replacement file provided');
    }
    if (!Types.ObjectId.isValid(documentId)) {
      throw new NotFoundException('Document not found');
    }

    const existingDoc = await this.documentModel.findById(documentId).exec();
    if (!existingDoc) {
      throw new NotFoundException('Document not found');
    }

    // Permission check: User must be admin or document owner
    const user = await this.usersService.findById(userId);
    const isAdmin = isUserAdmin(user);
    const isOwner = existingDoc.userId ? existingDoc.userId.toString() === userId : false;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('You do not have permission to replace this document');
    }

    // Validate replacement format
    const newExt = path.extname(file.originalname);
    const newFileType = this.mapFileType(newExt);
    const isNewTabular = ['csv', 'xlsx', 'xls'].includes(newFileType);
    const isExistingTabular = ['csv', 'xlsx', 'xls'].includes(existingDoc.fileType);

    if (isNewTabular !== isExistingTabular) {
      throw new BadRequestException(
        `Cannot replace a ${isExistingTabular ? 'tabular dataset' : 'narrative document'} with a ${isNewTabular ? 'tabular dataset' : 'narrative document'}. Replacement must match the document format family.`,
      );
    }

    const oldStoragePath = existingDoc.storagePath;

    // Save replacement file into user's storage with existing canonical originalName
    const destinationSubdir = `users/${existingDoc.userId}/documents`;
    const saveResult = await this.storageService.saveFile(
      file.buffer,
      destinationSubdir,
      existingDoc.originalName,
    );

    // Update document record while preserving ID, folder, originalName, allowedDepartments, ownership
    existingDoc.filename = saveResult.filename;
    existingDoc.storagePath = saveResult.storagePath;
    existingDoc.fileSize = file.size;
    existingDoc.mimeType = file.mimetype;
    existingDoc.fileType = newFileType;
    existingDoc.status = DocumentStatus.PROCESSING;
    existingDoc.errorMessage = '';
    existingDoc.sourceType = isNewTabular ? 'tabular' : 'narrative';
    existingDoc.chunkCount = 0;
    existingDoc.sheetNames = [];
    existingDoc.sheets = [];
    existingDoc.totalRows = 0;

    const savedDoc = await existingDoc.save();

    // Safely delete old physical storage file if different
    if (oldStoragePath && oldStoragePath !== saveResult.storagePath) {
      try {
        await this.storageService.deleteFile(oldStoragePath);
      } catch (err: any) {
        this.logger.warn(`Could not delete old file at ${oldStoragePath}: ${err.message}`);
      }
    }

    // Trigger AI RAG Ingestion / Inspection asynchronously in background
    this.triggerIngestion(
      userId,
      documentId,
      saveResult.storagePath,
      savedDoc.originalName,
      newFileType,
    );

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

    const existingDoc = await this.documentModel.findById(documentId);
    if (!existingDoc) {
      throw new NotFoundException('Document not found');
    }

    const user = await this.usersService.findById(userId);
    const isAdmin = isUserAdmin(user);
    if (!isAdmin && existingDoc.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have permission to move this document');
    }

    const targetFolder = normalizeFolder(folder);

    let folderPolicy: string | undefined;
    if (targetFolder) {
      if (this.foldersService?.findByName) {
        const targetFolderDoc = await this.foldersService.findByName(targetFolder);
        if (!targetFolderDoc) {
          const count = await this.documentModel.countDocuments({ folder: targetFolder });
          if (count === 0) {
            throw new NotFoundException(`Destination folder "${targetFolder}" not found`);
          }
        } else {
          folderPolicy = targetFolderDoc.downloadPolicy;
        }
      }
    }

    let finalOriginalName = existingDoc.originalName;
    if (existingDoc.folder !== targetFolder) {
      finalOriginalName = await resolveUniqueFilenameForModel(
        this.documentModel,
        existingDoc.originalName,
        targetFolder,
        existingDoc._id,
      );
    }

    const update: any = { folder: targetFolder, originalName: finalOriginalName };
    if (allowedDepartments) {
      update.allowedDepartments = allowedDepartments;
    }

    const doc = await this.documentModel.findOneAndUpdate(
      { _id: new Types.ObjectId(documentId) },
      { $set: update },
      { new: true },
    );

    return this.toIDocument(doc!, folderPolicy);
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

  getEffectiveDownloadPolicy(
    doc: { downloadPolicy?: string; folder?: string },
    folderPolicy?: string,
  ): DownloadPolicyState {
    if (doc.downloadPolicy === 'allowed') return 'allowed';
    if (doc.downloadPolicy === 'restricted') return 'restricted';
    // 'inherit' or default
    if (folderPolicy) {
      return folderPolicy === 'restricted' ? 'restricted' : 'allowed';
    }
    return 'allowed';
  }

  async canUserDownloadDocument(
    userId: string,
    documentId: string,
  ): Promise<{ canDownload: boolean; reason?: string; document?: any }> {
    if (!Types.ObjectId.isValid(documentId)) {
      return { canDownload: false, reason: 'DOCUMENT_NOT_FOUND' };
    }
    let doc: any = await this.documentModel.findById(documentId).exec();
    if (!doc && this.datasetModel) {
      doc = await this.datasetModel.findById(documentId).exec();
    }
    if (!doc) {
      return { canDownload: false, reason: 'DOCUMENT_NOT_FOUND' };
    }

    const user = await this.usersService.findById(userId);
    if (!user || user.status === 'suspended') {
      return { canDownload: false, reason: 'UNAUTHORIZED_USER' };
    }

    const isAdmin = isUserAdmin(user);
    let hasAccess = false;

    if (isAdmin) {
      hasAccess = true;
    } else if (doc.userId.toString() === userId) {
      hasAccess = true;
    } else {
      const approvedIds = await this.accessRequestsService.getApprovedResourceIdsForUser(userId);
      if (approvedIds.includes(doc._id.toString())) {
        hasAccess = true;
      } else {
        const userDepartments = user.departments || [];
        const hasDeptAccess =
          !doc.allowedDepartments ||
          doc.allowedDepartments.length === 0 ||
          doc.allowedDepartments.some((dept) => userDepartments.includes(dept));

        let hasFolderAccess = true;
        if (doc.folder && doc.folder.trim()) {
          const folderDoc = await this.foldersService.findByName(doc.folder.trim());
          const foldersMap = new Map<string, string[]>();
          if (folderDoc) {
            foldersMap.set(folderDoc.name, folderDoc.allowedDepartments || []);
          }
          hasFolderAccess = await this.aclResolver.canUserAccessFolder(
            userId,
            doc.folder.trim(),
            user,
            foldersMap,
          );
        }
        hasAccess = hasDeptAccess && hasFolderAccess;
      }
    }

    if (!hasAccess) {
      return { canDownload: false, reason: 'ACCESS_DENIED', document: doc };
    }

    // Determine folder policy
    let folderPolicy: string | undefined;
    if (doc.folder && doc.folder.trim() && this.foldersService?.findByName) {
      const folderDoc = await this.foldersService.findByName(doc.folder.trim());
      if (folderDoc) folderPolicy = folderDoc.downloadPolicy;
    }

    const effectivePolicy = this.getEffectiveDownloadPolicy(doc, folderPolicy);
    if (effectivePolicy === 'restricted') {
      return { canDownload: false, reason: 'DOWNLOAD_RESTRICTED', document: doc };
    }

    return { canDownload: true, document: doc };
  }

  async updateDownloadPolicy(
    userId: string,
    documentId: string,
    policy: DocumentDownloadPolicy,
  ): Promise<IDocument> {
    if (!Types.ObjectId.isValid(documentId)) {
      throw new NotFoundException('Document not found');
    }
    const doc = await this.documentModel.findByIdAndUpdate(
      documentId,
      { $set: { downloadPolicy: policy } },
      { new: true },
    ).exec();
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    let folderPolicy: string | undefined;
    if (doc.folder && doc.folder.trim() && this.foldersService?.findByName) {
      const folderDoc = await this.foldersService.findByName(doc.folder.trim());
      if (folderDoc) folderPolicy = folderDoc.downloadPolicy;
    }

    return this.toIDocument(doc, folderPolicy);
  }

  async downloadDocument(userId: string, documentId: string, res: any): Promise<void> {
    const check = await this.canUserDownloadDocument(userId, documentId);
    if (!check.canDownload || !check.document) {
      if (check.reason === 'DOWNLOAD_RESTRICTED') {
        throw new ForbiddenException('This file is restricted from downloading.');
      }
      if (check.reason === 'ACCESS_DENIED') {
        throw new ForbiddenException('You do not have access to download this document.');
      }
      throw new NotFoundException('Document not found or inaccessible.');
    }

    const doc = check.document;
    const exists = await this.storageService.fileExists(doc.storagePath);
    if (!exists) {
      throw new NotFoundException('File not found in storage.');
    }

    const stream = await this.storageService.getFileStream(doc.storagePath);
    const safeFilename = encodeURIComponent(doc.originalName).replace(/['()]/g, escape);
    res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${doc.originalName.replace(/"/g, '')}"; filename*=UTF-8''${safeFilename}`,
    );
    if (doc.fileSize) {
      res.setHeader('Content-Length', doc.fileSize);
    }
    stream.pipe(res);
  }

  async resolvePdfRequest(
    userId: string,
    query: string,
    activeScope?: IActiveScope | null,
    history?: Array<{ role: string; content: string }>,
  ): Promise<{
    matchType: 'exact' | 'alternative' | 'ambiguous' | 'none';
    found: boolean;
    document?: IDocument;
    alternativeDocument?: IDocument;
    candidates?: IDocument[];
    canDownload: boolean;
    reason?: string;
  }> {
    const accessibleDocs = await this.findAllAccessible(userId);
    let allPdfs: IDocument[] = accessibleDocs.filter(
      (d) => d.fileType === SupportedDocumentFormat.PDF || (d.originalName || '').toLowerCase().endsWith('.pdf'),
    );
    if (this.datasetModel) {
      try {
        const allDatasets = await this.datasetModel.find({}).exec();
        for (const ds of allDatasets) {
          if (!allPdfs.some((p) => p.id === ds._id.toString() || p.originalName.toLowerCase() === ds.originalName.toLowerCase())) {
            allPdfs.push({
              id: ds._id.toString(),
              originalName: ds.originalName,
              fileType: ds.fileType as any,
              fileSize: ds.fileSize,
              mimeType: ds.mimeType,
              folder: ds.folder,
              hasAccess: true,
            } as any);
          }
        }
      } catch (e) {
        this.logger.warn(`Could not load datasets for resolvePdfRequest: ${e}`);
      }
    }
    const accessiblePdfs = allPdfs.filter((d) => d.hasAccess);

    if (allPdfs.length === 0) {
      return { matchType: 'none', found: false, canDownload: false, reason: 'NO_ACCESSIBLE_PDFS' };
    }

    const lowerQuery = query.toLowerCase().trim();

    // 0. Direct Active Scope resolution
    if (activeScope && activeScope.type !== 'folder') {
      const scopeDoc = accessibleDocs.find((d) => d.id === activeScope.id || (activeScope.name && d.originalName.toLowerCase() === activeScope.name.toLowerCase()));
      if (scopeDoc) {
        const isDlQuery = /\b(download|get|give me|send me|fetch|file|pdf|this|it|that)\b/i.test(lowerQuery);
        if (isDlQuery) {
          const authCheck = await this.canUserDownloadDocument(userId, scopeDoc.id);
          return {
            matchType: 'exact',
            found: true,
            document: scopeDoc,
            canDownload: authCheck.canDownload,
            reason: authCheck.reason,
          };
        }
      }
    }

    // 1. Direct @mention or explicit filename extraction
    const mentionMatch = query.match(/@([a-zA-Z0-9_\-\.\s]+?\.(?:pdf|docx|xlsx|csv|txt)|[a-zA-Z0-9_\-]+)/i);
    if (mentionMatch && mentionMatch[1]) {
      const cleanMention = mentionMatch[1].trim().toLowerCase();
      const mentionedDoc = allPdfs.find((d) => {
        const orig = d.originalName.toLowerCase();
        const noExt = orig.replace(/\.[a-zA-Z0-9]+$/i, '');
        return orig === cleanMention || orig === `${cleanMention}.pdf` || noExt === cleanMention || d.id === cleanMention;
      });
      if (mentionedDoc) {
        const authCheck = await this.canUserDownloadDocument(userId, mentionedDoc.id);
        return {
          matchType: 'exact',
          found: true,
          document: mentionedDoc,
          canDownload: authCheck.canDownload,
          reason: authCheck.reason,
        };
      }
    }

    // 2. Contextual Reference: "that file", "the file", "the pdf", "download it", "give me that", etc.
    const isReferential = /\b(that file|that pdf|that document|that dataset|the file|the pdf|the document|the dataset|this file|this pdf|this document|this dataset|download it|download this|download that|get it|get this|get that|give me that|give me this|give me the file|give me that file|i wanna download|i want to download|can i download)\b/i.test(lowerQuery);
    if (isReferential && history && history.length > 0) {
      // Look backward from most recent messages for any mentioned accessible document
      for (let i = history.length - 1; i >= 0; i--) {
        const msgContent = history[i].content.toLowerCase();
        for (const doc of accessiblePdfs) {
          const docName = doc.originalName.toLowerCase();
          const docNoExt = docName.replace(/\.[a-zA-Z0-9]+$/i, '');
          if (msgContent.includes(docName) || (docNoExt.length >= 4 && msgContent.includes(docNoExt))) {
            const authCheck = await this.canUserDownloadDocument(userId, doc.id);
            return {
              matchType: 'exact',
              found: true,
              document: doc,
              canDownload: authCheck.canDownload,
              reason: authCheck.reason,
            };
          }
        }
      }
    }

    // 3. Clean query for semantic and token matching
    let cleanQuery = lowerQuery
      .replace(/@[a-zA-Z0-9_\-\.]+/g, '')
      .replace(/^(give me that file|give me the file|give me that|give me this|give me the|give me|can i get the|can i get|can i download the|can i download that|can i download this|can i download|download that file|download the file|download that|download the|download|find the pdf for the|find the pdf for|find the pdf|find the file|find the|find|get me the pdf from the|get me the pdf from|get me the pdf|get me the file|get me the|get me|where is the|please send me the|show me the pdf for|show me the pdf|show me the|fetch the|open the|i need the|i need|send me the|send me|locate the)\s*/i, '')
      .replace(/\s+(?:from|in)\s+(?:the\s+)?([a-zA-Z0-9_\-\s]+?)\s+folder$/i, '')
      .replace(/\s*(i wanna download this|i wanna download that|i wanna download|i want to download this|i want to download that|i want to download|can i download|download this|download that|please download|for me)\s*$/i, '')
      .replace(/\s+(pdf|file|document)$/i, '')
      .replace(/^[.\s_\-]+|[.\s_\-]+$/g, '')
      .replace(/\.[a-zA-Z0-9]+$/i, '')
      .trim();

    // Check if query specifies a folder context
    let folderHint = '';
    const folderMatch = query.match(/(?:from|in)\s+(?:the\s+)?([a-zA-Z0-9_\-\s]+?)\s+folder/i);
    if (folderMatch && folderMatch[1]) {
      folderHint = folderMatch[1].trim().toLowerCase();
    } else if (activeScope && (activeScope.type === 'folder' || activeScope.id?.startsWith('folder:'))) {
      folderHint = (activeScope.id?.replace(/^folder:/, '') || activeScope.name || '').trim().toLowerCase();
    }

    // 4. Exact match against filename or filename without extension
    let exactCandidates = accessiblePdfs.filter((d) => {
      const nameWithoutExt = d.originalName.replace(/\.pdf$/i, '').trim().toLowerCase();
      const fullName = d.originalName.toLowerCase();
      const nameNoSep = nameWithoutExt.replace(/[_\-\s]+/g, ' ');
      const cleanNoSep = cleanQuery.replace(/[_\-\s]+/g, ' ');
      const matches = nameWithoutExt === cleanQuery || fullName === cleanQuery || fullName === `${cleanQuery}.pdf` || nameNoSep === cleanNoSep;
      if (!matches) return false;
      if (folderHint) {
        return (d.folder || '').toLowerCase() === folderHint;
      }
      return true;
    });

    if (exactCandidates.length === 0 && folderHint) {
      exactCandidates = accessiblePdfs.filter((d) => {
        const nameWithoutExt = d.originalName.replace(/\.pdf$/i, '').trim().toLowerCase();
        const fullName = d.originalName.toLowerCase();
        const nameNoSep = nameWithoutExt.replace(/[_\-\s]+/g, ' ');
        const cleanNoSep = cleanQuery.replace(/[_\-\s]+/g, ' ');
        return nameWithoutExt === cleanQuery || fullName === cleanQuery || fullName === `${cleanQuery}.pdf` || nameNoSep === cleanNoSep;
      });
    }

    if (exactCandidates.length === 1) {
      const bestDoc = exactCandidates[0];
      const authCheck = await this.canUserDownloadDocument(userId, bestDoc.id);
      return {
        matchType: 'exact',
        found: true,
        document: bestDoc,
        canDownload: authCheck.canDownload,
        reason: authCheck.reason,
      };
    } else if (exactCandidates.length === 0) {
      const allExact = allPdfs.filter((d) => {
        const nameWithoutExt = d.originalName.replace(/\.pdf$/i, '').trim().toLowerCase();
        const fullName = d.originalName.toLowerCase();
        const nameNoSep = nameWithoutExt.replace(/[_\-\s]+/g, ' ');
        const cleanNoSep = cleanQuery.replace(/[_\-\s]+/g, ' ');
        return nameWithoutExt === cleanQuery || fullName === cleanQuery || fullName === `${cleanQuery}.pdf` || nameNoSep === cleanNoSep;
      });
      if (allExact.length === 1) {
        const bestDoc = allExact[0];
        const authCheck = await this.canUserDownloadDocument(userId, bestDoc.id);
        return {
          matchType: 'exact',
          found: true,
          document: bestDoc,
          canDownload: authCheck.canDownload,
          reason: authCheck.reason,
        };
      }
    } else if (exactCandidates.length > 1) {
      return {
        matchType: 'ambiguous',
        found: false,
        candidates: exactCandidates.slice(0, 4),
        canDownload: false,
      };
    }

    // 5. Intelligent Multi-Attribute Scoring
    const queryTokens = cleanQuery.split(/[\s_\-]+/).filter((t) => t.length >= 2);
    const scoredCandidates: Array<{ doc: IDocument; score: number }> = [];

    for (const doc of accessiblePdfs) {
      const docName = doc.originalName.toLowerCase();
      const docNoExt = docName.replace(/\.pdf$/i, '');
      const docWords = docNoExt.replace(/[_\-]+/g, ' ');
      const docFolder = (doc.folder || '').toLowerCase();
      const docFolderWords = docFolder.replace(/[_\-]+/g, ' ');

      let score = 0;

      // Full substring match
      if (cleanQuery.length >= 3 && (docWords.includes(cleanQuery) || docName.includes(cleanQuery))) {
        score += 30;
      }
      if (cleanQuery.length >= 3 && cleanQuery.includes(docWords)) {
        score += 25;
      }

      // Folder match
      if (folderHint && (docFolder === folderHint || docFolderWords.includes(folderHint))) {
        score += 15;
      } else if (docFolderWords.length >= 2 && (cleanQuery.includes(docFolderWords) || docFolderWords.includes(cleanQuery))) {
        score += 15;
      }

      // Token overlap
      for (const token of queryTokens) {
        if (docWords.includes(token)) {
          score += 8;
        }
        if (docFolderWords.includes(token)) {
          score += 5;
        }
      }

      if (score >= 15) {
        scoredCandidates.push({ doc, score });
      }
    }

    scoredCandidates.sort((a, b) => b.score - a.score);

    if (scoredCandidates.length === 1) {
      const bestDoc = scoredCandidates[0].doc;
      const authCheck = await this.canUserDownloadDocument(userId, bestDoc.id);
      return {
        matchType: 'exact',
        found: true,
        document: bestDoc,
        canDownload: authCheck.canDownload,
        reason: authCheck.reason,
      };
    }

    if (scoredCandidates.length > 1) {
      const topScore = scoredCandidates[0].score;
      const runnerUpScore = scoredCandidates[1].score;

      // Clear winner
      if (topScore >= 35 && topScore >= runnerUpScore + 12) {
        const bestDoc = scoredCandidates[0].doc;
        const authCheck = await this.canUserDownloadDocument(userId, bestDoc.id);
        return {
          matchType: 'exact',
          found: true,
          document: bestDoc,
          canDownload: authCheck.canDownload,
          reason: authCheck.reason,
        };
      }

      // Close match between multiple candidates -> Ambiguous clarification
      const closeCandidates = scoredCandidates
        .filter((c) => c.score >= topScore - 12 && c.score >= 18)
        .map((c) => c.doc)
        .slice(0, 4);

      if (closeCandidates.length > 1) {
        return {
          matchType: 'ambiguous',
          found: false,
          candidates: closeCandidates,
          canDownload: false,
        };
      }
    }

    // 6. Plausible Alternative Suggestion
    if (scoredCandidates.length > 0 && scoredCandidates[0].score >= 12) {
      const bestAlt = scoredCandidates[0].doc;
      return {
        matchType: 'alternative',
        found: false,
        alternativeDocument: bestAlt,
        canDownload: false,
      };
    }

    return { matchType: 'none', found: false, canDownload: false };
  }

  async findAllAccessible(
    userId: string,
    pagination?: { page?: number; limit?: number },
  ): Promise<IDocument[]> {
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

    const allFolders = this.foldersService?.findAll ? await this.foldersService.findAll() : [];
    const foldersMap = new Map<string, string[]>();
    const folderPolicyMap = new Map<string, string>();
    for (const f of allFolders) {
      foldersMap.set(f.name, f.allowedDepartments || []);
      folderPolicyMap.set(f.name, f.downloadPolicy || 'allowed');
    }

    const results: IDocument[] = [];
    for (const d of allDocs) {
      const folderPolicy = folderPolicyMap.get(d.folder || '');
      const docDto = this.toIDocument(d, folderPolicy);
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

    if (pagination && pagination.limit && pagination.limit > 0) {
      const page = Math.max(1, pagination.page || 1);
      const skip = (page - 1) * pagination.limit;
      return results.slice(skip, skip + pagination.limit);
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

    let folderPolicy: string | undefined;
    if (doc.folder && doc.folder.trim() && this.foldersService?.findByName) {
      const folderDoc = await this.foldersService.findByName(doc.folder.trim());
      if (folderDoc) folderPolicy = folderDoc.downloadPolicy;
    }

    if (isAdmin) {
      const docDto = this.toIDocument(doc, folderPolicy);
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

    const docDto = this.toIDocument(doc, folderPolicy);
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

  toIDocument(doc: DocumentEntityDocument | any, folderPolicy?: string): IDocument {
    const effectiveDownloadPolicy = this.getEffectiveDownloadPolicy(doc, folderPolicy);
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
      downloadPolicy: (doc.downloadPolicy as any) || 'inherit',
      effectiveDownloadPolicy,
      status: doc.status,
      chunkCount: doc.chunkCount || 0,
      sheetNames: doc.sheetNames || [],
      sheets: doc.sheets || [],
      totalRows: doc.totalRows || 0,
      sourceType: (doc.sourceType as any) || (['csv', 'xlsx', 'xls'].includes(doc.fileType) ? 'tabular' : 'narrative'),
      errorMessage: doc.errorMessage,
      hasAccess: true,
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: doc.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }
}
