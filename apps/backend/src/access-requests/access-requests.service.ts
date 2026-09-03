import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { AccessRequestEntity, AccessRequestDocument } from './schemas/access-request.schema';
import { IAccessRequest, ICreateAccessRequestDto, IUpdateAccessRequestDto, AccessRequestStatus, ResourceType, isUserAdmin } from '@enter-chat/shared-types';
import { UsersService } from '../users/users.service';

@Injectable()
export class AccessRequestsService {
  constructor(
    @InjectModel(AccessRequestEntity.name)
    private readonly accessRequestModel: Model<AccessRequestDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly usersService: UsersService,
  ) {}

  async createRequest(userId: string, dto: ICreateAccessRequestDto): Promise<IAccessRequest> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (isUserAdmin(user)) {
      throw new BadRequestException(
        'Administrators already possess unrestricted access to all system datasets, documents, and folders',
      );
    }

    const requesterName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    const requesterEmail = user.email;

    const existing = await this.accessRequestModel.findOne({
      userId: new Types.ObjectId(userId),
      resourceId: dto.resourceId.toString(),
    });

    if (existing) {
      if (existing.status === AccessRequestStatus.PENDING) {
        throw new BadRequestException('An access request is already pending for this resource');
      }
      existing.status = AccessRequestStatus.PENDING;
      existing.reason = dto.reason || existing.reason;
      existing.resourceName = dto.resourceName || existing.resourceName;
      existing.folderPath = dto.folderPath || existing.folderPath;
      existing.userName = requesterName;
      existing.userEmail = requesterEmail;
      await existing.save();
      return this.toIAccessRequest(existing);
    }

    const newReq = new this.accessRequestModel({
      userId: new Types.ObjectId(userId),
      userName: requesterName,
      userEmail: requesterEmail,
      resourceId: dto.resourceId.toString(),
      resourceType: dto.resourceType,
      resourceName: dto.resourceName,
      folderPath: dto.folderPath,
      reason: dto.reason,
      status: AccessRequestStatus.PENDING,
    });
    const saved = await newReq.save();
    return this.toIAccessRequest(saved);
  }

  async updateRequestStatus(
    id: string,
    dto: IUpdateAccessRequestDto,
    adminUserId?: string
  ): Promise<IAccessRequest> {
    const req = await this.accessRequestModel.findById(id);
    if (!req) {
      throw new NotFoundException('Access request not found');
    }

    req.status = dto.status;
    if (adminUserId && Types.ObjectId.isValid(adminUserId)) {
      req.resolvedBy = new Types.ObjectId(adminUserId);
      try {
        const adminUser = await this.usersService.findById(adminUserId);
        if (adminUser) {
          req.resolvedByName = `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || adminUser.email;
          req.resolvedByEmail = adminUser.email;
        }
      } catch {
        // Fallback gracefully
      }
    }
    req.resolvedAt = new Date();
    await req.save();

    if (dto.status === AccessRequestStatus.APPROVED) {
      const requesterId = req.userId.toString();
      // If folder path is specified or resource is a folder:
      if (req.resourceType === ResourceType.FOLDER || req.folderPath) {
        const targetFolder = req.folderPath || req.resourceId;
        await this.usersService.addAllowedFolder(requesterId, targetFolder);
      } else {
        // If single document/dataset, check if it belongs to a folder
        const collectionName = req.resourceType === ResourceType.DATASET ? 'datasets' : 'documents';
        if (Types.ObjectId.isValid(req.resourceId)) {
          const item = await this.connection.collection(collectionName).findOne({
            _id: new Types.ObjectId(req.resourceId),
          });
          if (item && item.folder) {
            await this.usersService.addAllowedFolder(requesterId, item.folder);
          }
        }
      }
    }

    return this.toIAccessRequest(req);
  }

  async getPendingRequests(): Promise<IAccessRequest[]> {
    const reqs = await this.accessRequestModel
      .find({ status: AccessRequestStatus.PENDING })
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .exec();

    return reqs.map((r) => {
      const dto = this.toIAccessRequest(r);
      if (r.userId && typeof r.userId === 'object') {
        const userObj = r.userId as any;
        dto.userName = `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim() || userObj.email;
        dto.userEmail = userObj.email;
      }
      return dto;
    });
  }

  async getUserRequests(userId: string): Promise<IAccessRequest[]> {
    const reqs = await this.accessRequestModel.find({ userId: new Types.ObjectId(userId) });
    return reqs.map((r) => this.toIAccessRequest(r));
  }

  async getApprovedResourceIdsForUser(userId: string): Promise<string[]> {
    const reqs = await this.accessRequestModel.find({
      userId: new Types.ObjectId(userId),
      status: AccessRequestStatus.APPROVED,
    });
    return reqs.map((r) => r.resourceId.toString());
  }

  async getHistory(query: any): Promise<any> {
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '10', 10) || 10));
    const skip = (page - 1) * limit;

    const filter: any = {};

    // 1. Status filter
    if (query.status && Object.values(AccessRequestStatus).includes(query.status)) {
      filter.status = query.status;
    }

    // 2. Requester filter
    if (query.requesterId && Types.ObjectId.isValid(query.requesterId)) {
      filter.userId = new Types.ObjectId(query.requesterId);
    }

    // 3. Resolving Admin filter
    if (query.resolvedBy && Types.ObjectId.isValid(query.resolvedBy)) {
      filter.resolvedBy = new Types.ObjectId(query.resolvedBy);
    }

    // 4. Date Range filter (Supports requestedAt or resolvedAt explicitly)
    const dateField = query.dateField === 'resolvedAt' ? 'resolvedAt' : 'createdAt';
    if (query.from || query.to) {
      filter[dateField] = {};
      if (query.from) {
        const fromDate = new Date(query.from);
        if (!isNaN(fromDate.getTime())) {
          fromDate.setHours(0, 0, 0, 0);
          filter[dateField].$gte = fromDate;
        }
      }
      if (query.to) {
        const toDate = new Date(query.to);
        if (!isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          filter[dateField].$lte = toDate;
        }
      }
      // If date range is inverted (from > to), normalize
      if (filter[dateField].$gte && filter[dateField].$lte && filter[dateField].$gte > filter[dateField].$lte) {
        const temp = filter[dateField].$gte;
        filter[dateField].$gte = filter[dateField].$lte;
        filter[dateField].$lte = temp;
      }
    }

    const [items, total] = await Promise.all([
      this.accessRequestModel
        .find(filter)
        .populate('userId', 'firstName lastName email')
        .populate('resolvedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.accessRequestModel.countDocuments(filter).exec(),
    ]);

    // Pre-populate missing resource names for documents and datasets
    const docIdsToLookup: Types.ObjectId[] = [];
    const dsIdsToLookup: Types.ObjectId[] = [];

    items.forEach((item) => {
      if (!item.resourceName && !item.folderPath && Types.ObjectId.isValid(item.resourceId)) {
        if (item.resourceType === ResourceType.DATASET) {
          dsIdsToLookup.push(new Types.ObjectId(item.resourceId));
        } else if (item.resourceType === ResourceType.DOCUMENT) {
          docIdsToLookup.push(new Types.ObjectId(item.resourceId));
        }
      }
    });

    const [foundDocs, foundDatasets] = await Promise.all([
      docIdsToLookup.length > 0
        ? this.connection.collection('documents').find({ _id: { $in: docIdsToLookup } }).project({ originalName: 1, folder: 1 }).toArray()
        : [],
      dsIdsToLookup.length > 0
        ? this.connection.collection('datasets').find({ _id: { $in: dsIdsToLookup } }).project({ originalName: 1, folder: 1 }).toArray()
        : [],
    ]);

    const docMap = new Map<string, any>();
    foundDocs.forEach((d: any) => docMap.set(d._id.toString(), d));

    const dsMap = new Map<string, any>();
    foundDatasets.forEach((d: any) => dsMap.set(d._id.toString(), d));

    const mappedItems = items.map((doc) => {
      const dto = this.toIAccessRequest(doc);
      if (!dto.resourceName && !dto.folderPath) {
        if (doc.resourceType === ResourceType.DOCUMENT && docMap.has(dto.resourceId)) {
          const item = docMap.get(dto.resourceId);
          dto.resourceName = item.originalName;
          dto.folderPath = item.folder;
        } else if (doc.resourceType === ResourceType.DATASET && dsMap.has(dto.resourceId)) {
          const item = dsMap.get(dto.resourceId);
          dto.resourceName = item.originalName;
          dto.folderPath = item.folder;
        }
      }
      return dto;
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: mappedItems,
      total,
      page,
      limit,
      totalPages,
    };
  }

  private toIAccessRequest(doc: any): IAccessRequest {
    const res: IAccessRequest = {
      id: doc._id.toString(),
      userId: doc.userId ? (doc.userId._id ? doc.userId._id.toString() : doc.userId.toString()) : '',
      resourceId: doc.resourceId,
      resourceType: doc.resourceType,
      resourceName: doc.resourceName,
      folderPath: doc.folderPath,
      reason: doc.reason,
      status: doc.status,
      resolvedBy: doc.resolvedBy ? (doc.resolvedBy._id ? doc.resolvedBy._id.toString() : doc.resolvedBy.toString()) : undefined,
      resolvedAt: doc.resolvedAt ? doc.resolvedAt.toISOString() : undefined,
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: doc.updatedAt?.toISOString() || new Date().toISOString(),
    };

    // Populate user/requester identity: Check live populated user first, then stored snapshot, then friendly fallback
    if (doc.userId && typeof doc.userId === 'object' && (doc.userId.firstName || doc.userId.email)) {
      const u = doc.userId;
      res.userName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
      res.userEmail = u.email;
    } else if (doc.userName || doc.userEmail) {
      res.userName = doc.userName || doc.userEmail;
      res.userEmail = doc.userEmail || undefined;
    } else if (doc.userId) {
      res.userName = 'User (' + doc.userId.toString().slice(-4) + ')';
    } else {
      res.userName = 'Former User (Deleted)';
    }

    // Populate resolving administrator identity: Check live populated admin first, then stored snapshot
    if (doc.resolvedBy && typeof doc.resolvedBy === 'object' && (doc.resolvedBy.firstName || doc.resolvedBy.email)) {
      const a = doc.resolvedBy;
      res.resolvedByName = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email;
      res.resolvedByEmail = a.email;
    } else if (doc.resolvedByName || doc.resolvedByEmail) {
      res.resolvedByName = doc.resolvedByName || doc.resolvedByEmail;
      res.resolvedByEmail = doc.resolvedByEmail || undefined;
    } else {
      res.resolvedByName = doc.status === AccessRequestStatus.PENDING ? undefined : 'Administrator';
    }

    return res;
  }
}

