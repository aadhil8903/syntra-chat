import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument, AuditAction } from './schemas/audit-log.schema';

export interface ICreateAuditLogDto {
  action: AuditAction;
  actorId: string;
  actorEmail?: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, any>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async logAction(dto: ICreateAuditLogDto): Promise<AuditLogDocument | null> {
    try {
      const log = new this.auditLogModel({
        action: dto.action,
        actorId: dto.actorId,
        actorEmail: dto.actorEmail,
        targetId: dto.targetId,
        targetType: dto.targetType,
        details: dto.details || {},
        ipAddress: dto.ipAddress,
      });
      const saved = await log.save();
      this.logger.log(
        `[AUDIT] action=${dto.action} actorId=${dto.actorId} targetId=${dto.targetId || 'n/a'} details=${JSON.stringify(dto.details || {})}`,
      );
      return saved;
    } catch (err) {
      this.logger.error(`[AUDIT_ERROR] Failed to save audit log: ${err}`);
      return null;
    }
  }

  async queryAuditLogs(
    filter: any = {},
    pagination?: { page?: number; limit?: number },
  ): Promise<{ logs: AuditLogDocument[]; total: number; page: number; limit: number; totalPages: number }> {
    const query = { ...filter };
    const total = await this.auditLogModel.countDocuments(query);
    const page = Math.max(1, pagination?.page || 1);
    const limit = pagination?.limit && pagination.limit > 0 ? pagination.limit : 50;
    const skip = (page - 1) * limit;

    const logs = await this.auditLogModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const totalPages = Math.ceil(total / limit) || 1;
    return { logs, total, page, limit, totalPages };
  }
}
