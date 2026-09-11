import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { NotificationType } from '@enter-chat/shared-types';

export type NotificationDocument = NotificationEntity & Document;

@Schema({ timestamps: true, collection: 'notifications' })
export class NotificationEntity {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  senderId?: Types.ObjectId;

  @Prop({ type: String, required: true })
  type: NotificationType;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  message: string;

  @Prop({ type: String, enum: ['conversation', 'message'], required: true })
  resourceType: 'conversation' | 'message';

  @Prop({ type: String, required: true })
  resourceId: string;

  @Prop({ type: Boolean, default: false })
  isRead: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(NotificationEntity);

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });
