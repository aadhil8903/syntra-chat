import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDocument, Types } from 'mongoose';
import { AccessRequestStatus, ResourceType } from '@enter-chat/shared-types';

export type AccessRequestDocument = AccessRequestEntity & MongoDocument;

@Schema({ timestamps: true, collection: 'access_requests' })
export class AccessRequestEntity {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  resourceId: string;

  @Prop({ required: true, enum: ResourceType })
  resourceType: ResourceType;

  @Prop({ type: String })
  resourceName?: string;

  @Prop({ type: String })
  folderPath?: string;

  @Prop({ type: String })
  reason?: string;

  @Prop({ required: true, enum: AccessRequestStatus, default: AccessRequestStatus.PENDING })
  status: AccessRequestStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  resolvedBy?: Types.ObjectId;

  @Prop({ type: Date })
  resolvedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const AccessRequestSchema = SchemaFactory.createForClass(AccessRequestEntity);
AccessRequestSchema.index({ userId: 1, resourceId: 1 }, { unique: true });
AccessRequestSchema.index({ createdAt: -1 });
AccessRequestSchema.index({ status: 1, createdAt: -1 });
AccessRequestSchema.index({ userId: 1, createdAt: -1 });
AccessRequestSchema.index({ resolvedBy: 1, createdAt: -1 });


