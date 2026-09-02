import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDocument, Types } from 'mongoose';

export type ConversationEntityDocument = ConversationEntity & MongoDocument;

@Schema({ _id: false })
export class ActiveScopeEntity {
  @Prop({ required: true, enum: ['document', 'folder', 'dataset'] })
  type: 'document' | 'folder' | 'dataset';

  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: false })
  updatedAt?: Date;
}

export const ActiveScopeSchema = SchemaFactory.createForClass(ActiveScopeEntity);

@Schema({ timestamps: true, collection: 'conversations' })
export class ConversationEntity {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, default: 'New Conversation' })
  title: string;

  @Prop({ type: Types.ObjectId, ref: 'CollectionEntity', required: false, index: true })
  collectionId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  attachedResourceIds: string[];

  @Prop({ type: ActiveScopeSchema, required: false, default: null })
  activeScope?: ActiveScopeEntity | null;

  @Prop({ required: false })
  lastMessageAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(ConversationEntity);
ConversationSchema.index({ userId: 1, updatedAt: -1 });
ConversationSchema.index({ userId: 1, collectionId: 1, updatedAt: -1 });
