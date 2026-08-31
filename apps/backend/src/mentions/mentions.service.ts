import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentEntity, DocumentEntityDocument } from '../documents/schemas/document.schema';
import { DatasetEntity, DatasetEntityDocument } from '../datasets/schemas/dataset.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AclResolverService } from '../permissions/services/acl-resolver.service';
import { FoldersService } from '../folders/folders.service';
import {
  IMentionOption,
  IMentionQueryResult,
  MentionResourceType,
  UserRole,
} from '@enter-chat/shared-types';

@Injectable()
export class MentionsService {
  constructor(
    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentEntityDocument>,
    @InjectModel(DatasetEntity.name)
    private readonly datasetModel: Model<DatasetEntityDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly aclResolver: AclResolverService,
    private readonly foldersService: FoldersService,
  ) {}

  async searchMentions(userId: string, query: string = ''): Promise<IMentionQueryResult> {
    const userObjectId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
    const user = userObjectId ? await this.userModel.findById(userObjectId) : null;
    const isAdmin = user?.role === UserRole.ADMIN;
    const userDepts = user?.departments || [];

    const allFolders = await this.foldersService.findAll();
    const foldersMap = new Map<string, string[]>();
    for (const f of allFolders) {
      foldersMap.set(f.name, f.allowedDepartments || []);
    }

    // Safely escape special regex characters
    const trimmed = query.trim();
    const safeRegexStr = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(safeRegexStr, 'i');

    const [allDocs, allDatasets] = await Promise.all([
      this.documentModel.find(trimmed ? { originalName: { $regex: regex } } : {}).sort({ createdAt: -1 }).limit(100).exec(),
      this.datasetModel.find(trimmed ? { originalName: { $regex: regex } } : {}).sort({ createdAt: -1 }).limit(100).exec(),
    ]);

    const accessibleDocs: DocumentEntityDocument[] = [];
    for (const doc of allDocs) {
      if (isAdmin || doc.userId.toString() === userId) {
        accessibleDocs.push(doc);
      } else {
        const hasDeptAccess =
          !doc.allowedDepartments ||
          doc.allowedDepartments.length === 0 ||
          doc.allowedDepartments.some((d) => userDepts.includes(d));
        const hasFolderAccess = await this.aclResolver.canUserAccessFolder(userId, doc.folder || '', user, foldersMap);
        if (hasDeptAccess && hasFolderAccess) {
          accessibleDocs.push(doc);
        }
      }
    }

    const accessibleDatasets: DatasetEntityDocument[] = [];
    for (const ds of allDatasets) {
      if (isAdmin || ds.userId.toString() === userId) {
        accessibleDatasets.push(ds);
      } else {
        const hasDeptAccess =
          !ds.allowedDepartments ||
          ds.allowedDepartments.length === 0 ||
          ds.allowedDepartments.some((d) => userDepts.includes(d));
        const hasFolderAccess = await this.aclResolver.canUserAccessFolder(userId, ds.folder || '', user, foldersMap);
        if (hasDeptAccess && hasFolderAccess) {
          accessibleDatasets.push(ds);
        }
      }
    }

    // Aggregate accessible folders and their item counts
    const folderMap = new Map<string, number>();
    for (const d of accessibleDocs) {
      if (d.folder && d.folder.trim()) {
        const segs = d.folder.trim().split('/');
        let cur = '';
        for (const s of segs) {
          cur = cur ? `${cur}/${s}` : s;
          folderMap.set(cur, (folderMap.get(cur) || 0) + 1);
        }
      }
    }
    for (const ds of accessibleDatasets) {
      if (ds.folder && ds.folder.trim()) {
        const segs = ds.folder.trim().split('/');
        let cur = '';
        for (const s of segs) {
          cur = cur ? `${cur}/${s}` : s;
          folderMap.set(cur, (folderMap.get(cur) || 0) + 1);
        }
      }
    }

    // Filter matching folders
    const folderResults: IMentionOption[] = [];
    for (const [folderPath, count] of folderMap.entries()) {
      if (!trimmed || folderPath.toLowerCase().includes(trimmed.toLowerCase())) {
        folderResults.push({
          id: `folder:${folderPath}`,
          name: folderPath,
          type: MentionResourceType.FOLDER,
          fileType: 'folder',
          status: 'ready',
          folderPath,
          detail: `Folder • ${count} document(s) & dataset(s)`,
        });
      }
    }

    const docResults: IMentionOption[] = accessibleDocs.slice(0, 20).map((doc) => ({
      id: doc._id.toString(),
      name: doc.originalName,
      type: MentionResourceType.DOCUMENT,
      fileType: doc.fileType,
      status: doc.status,
      detail: `${doc.chunkCount || 0} chunks${doc.folder ? ` • 📁 ${doc.folder}` : ''}`,
    }));

    const datasetResults: IMentionOption[] = accessibleDatasets.slice(0, 20).map((ds) => ({
      id: ds._id.toString(),
      name: ds.originalName,
      type: MentionResourceType.DATASET,
      fileType: ds.fileType,
      status: ds.status,
      detail: `${ds.totalRows || 0} rows${ds.sheetNames?.length ? ` • ${ds.sheetNames.length} sheet(s)` : ''}${ds.folder ? ` • 📁 ${ds.folder}` : ''}`,
    }));

    return {
      query,
      results: [...folderResults.slice(0, 10), ...docResults, ...datasetResults],
    };
  }
}

