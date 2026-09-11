import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDocument, Types } from 'mongoose';

export type MessageShareDocument = MessageShareEntity & MongoDocument;

@Schema({ timestamps: true, collection: 'message_shares' })
export class MessageShareEntity {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'MessageEntity', required: true, index: true })
  messageId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ConversationEntity', required: true, index: true })
  conversationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  sharedWithUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const MessageShareSchema = SchemaFactory.createForClass(MessageShareEntity);

MessageShareSchema.index({ messageId: 1, sharedWithUserId: 1 }, { unique: true });
MessageShareSchema.index({ sharedWithUserId: 1, createdAt: -1 });
