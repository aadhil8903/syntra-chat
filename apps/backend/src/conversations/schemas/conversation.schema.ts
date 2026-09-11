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

@Schema({ _id: false })
export class ConversationLastMessageEntity {
  @Prop({ required: true })
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ required: true })
  senderName: string;

  @Prop({ required: true })
  createdAt: Date;

  @Prop({ required: false })
  role?: string;

  @Prop({ required: false, default: false })
  isAi?: boolean;
}

export const ConversationLastMessageSchema = SchemaFactory.createForClass(ConversationLastMessageEntity);

@Schema({ timestamps: true, collection: 'conversations' })
export class ConversationEntity {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: ['ai', 'direct'], default: 'ai', index: true })
  type: 'ai' | 'direct';

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [], index: true })
  participants: Types.ObjectId[];

  @Prop({ required: true, default: 'New Conversation' })
  title: string;

  @Prop({ type: Types.ObjectId, ref: 'CollectionEntity', required: false, index: true })
  collectionId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  attachedResourceIds: string[];

  @Prop({ type: ActiveScopeSchema, required: false, default: null })
  activeScope?: ActiveScopeEntity | null;

  @Prop({ type: Boolean, default: false, index: true })
  pinned: boolean;

  @Prop({ type: Boolean, default: false, index: true })
  archived: boolean;

  @Prop({ type: ConversationLastMessageSchema, required: false, default: null })
  lastMessage?: ConversationLastMessageEntity | null;

  @Prop({ type: Map, of: Number, default: {} })
  unreadCounts?: Map<string, number>;

  @Prop({ required: false })
  lastMessageAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(ConversationEntity);
ConversationSchema.index({ userId: 1, archived: 1, pinned: -1, updatedAt: -1 });
ConversationSchema.index({ userId: 1, collectionId: 1, updatedAt: -1 });
ConversationSchema.index({ participants: 1, type: 1 });
ConversationSchema.index({ type: 1, updatedAt: -1 });
