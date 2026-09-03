import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDocument, Types } from 'mongoose';
import { DocumentStatus, SupportedDocumentFormat } from '@enter-chat/shared-types';

export type DocumentEntityDocument = DocumentEntity & MongoDocument;

@Schema({ timestamps: true, collection: 'documents' })
export class DocumentEntity {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true, enum: SupportedDocumentFormat })
  fileType: SupportedDocumentFormat;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  fileSize: number;

  @Prop({ required: true })
  storagePath: string;

  @Prop({ type: [String], default: [] })
  allowedDepartments: string[];

  @Prop({ required: true, enum: DocumentStatus, default: DocumentStatus.PENDING, index: true })
  status: DocumentStatus;

  @Prop({ default: 0 })
  chunkCount: number;

  @Prop({ type: [String], default: [] })
  sheetNames?: string[];

  @Prop({ type: [Object], default: [] })
  sheets?: any[];

  @Prop({ default: 0 })
  totalRows?: number;

  @Prop({ required: false, default: 'narrative' })
  sourceType?: string;

  @Prop({ required: false, default: '' })
  folder?: string;

  @Prop({ type: String, enum: ['inherit', 'allowed', 'restricted'], default: 'inherit' })
  downloadPolicy: string;

  @Prop({ required: false })
  errorMessage?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const DocumentSchema = SchemaFactory.createForClass(DocumentEntity);
DocumentSchema.index({ userId: 1, createdAt: -1 });

