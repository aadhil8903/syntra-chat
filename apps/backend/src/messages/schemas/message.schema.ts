import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDocument, Types } from 'mongoose';
import { MessageRole, ICitation, IChartSpec, ITableSpec, IDownloadableFile, IReplyToPreview } from '@enter-chat/shared-types';

export type MessageEntityDocument = MessageEntity & MongoDocument;

@Schema({ timestamps: true, collection: 'messages' })
export class MessageEntity {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: MessageRole })
  role: MessageRole;

  @Prop({ required: true })
  content: string;

  @Prop({ type: [String], default: [] })
  referencedResourceIds: string[];

  @Prop({ type: [Object], required: false })
  mentions?: Array<{ type: string; id: string; name: string }>;

  @Prop({ type: [Object], required: false })
  citations?: ICitation[];

  @Prop({ type: Object, required: false })
  generatedChart?: IChartSpec;

  @Prop({ type: [Object], required: false })
  generatedCharts?: IChartSpec[];

  @Prop({ type: Object, required: false })
  generatedTable?: ITableSpec;

  @Prop({ required: false })
  pythonCode?: string;

  @Prop({ required: false })
  executionOutput?: string;

  @Prop({ type: Object, required: false })
  downloadableFile?: IDownloadableFile;

  @Prop({ type: String, required: false })
  replyToMessageId?: string;

  @Prop({ type: Object, required: false })
  replyTo?: IReplyToPreview;

  createdAt: Date;
  updatedAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(MessageEntity);
MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ userId: 1, createdAt: -1 });

