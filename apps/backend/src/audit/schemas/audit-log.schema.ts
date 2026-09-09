import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

export enum AuditAction {
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED = 'USER_STATUS_CHANGED',
  USER_CREDENTIALS_RESENT = 'USER_CREDENTIALS_RESENT',
  ACCESS_REQUEST_RESOLVED = 'ACCESS_REQUEST_RESOLVED',
  FOLDER_PERMISSION_UPDATED = 'FOLDER_PERMISSION_UPDATED',
  DOWNLOAD_POLICY_UPDATED = 'DOWNLOAD_POLICY_UPDATED',
}

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  _id: Types.ObjectId;

  @Prop({ required: true, enum: AuditAction })
  action: AuditAction;

  @Prop({ required: true })
  actorId: string;

  @Prop({ required: false })
  actorEmail?: string;

  @Prop({ required: false })
  targetId?: string;

  @Prop({ required: false })
  targetType?: string;

  @Prop({ type: Object, default: {} })
  details: Record<string, any>;

  @Prop({ required: false })
  ipAddress?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ targetId: 1, createdAt: -1 });
