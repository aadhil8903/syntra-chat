import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDocument, Types } from 'mongoose';
import { SharePermission } from '@enter-chat/shared-types';

export type ConversationShareDocument = ConversationShareEntity & MongoDocument;

@Schema({ timestamps: true, collection: 'conversation_shares' })
export class ConversationShareEntity {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ConversationEntity', required: true, index: true })
  conversationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  sharedWithUserId: Types.ObjectId;

  @Prop({ type: String, enum: ['view', 'contribute'], default: 'view', required: true })
  permission: SharePermission;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const ConversationShareSchema = SchemaFactory.createForClass(ConversationShareEntity);

ConversationShareSchema.index({ conversationId: 1, sharedWithUserId: 1 }, { unique: true });
ConversationShareSchema.index({ sharedWithUserId: 1, createdAt: -1 });
