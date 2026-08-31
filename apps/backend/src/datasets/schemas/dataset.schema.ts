import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDocument, Types } from 'mongoose';
import { DatasetStatus, SupportedDatasetFormat, IDatasetSheet } from '@enter-chat/shared-types';

export type DatasetEntityDocument = DatasetEntity & MongoDocument;

@Schema({ timestamps: true, collection: 'datasets' })
export class DatasetEntity {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true, enum: SupportedDatasetFormat })
  fileType: SupportedDatasetFormat;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  fileSize: number;

  @Prop({ required: true })
  storagePath: string;

  @Prop({ type: [String], default: [] })
  allowedDepartments: string[];

  @Prop({ required: true, enum: DatasetStatus, default: DatasetStatus.PENDING, index: true })
  status: DatasetStatus;

  @Prop({ type: [String], default: [] })
  sheetNames: string[];

  @Prop({ type: [Object], default: [] })
  sheets: IDatasetSheet[];

  @Prop({ default: 0 })
  totalRows: number;

  @Prop({ required: false, default: '' })
  folder?: string;

  @Prop({ required: false })
  errorMessage?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const DatasetSchema = SchemaFactory.createForClass(DatasetEntity);
DatasetSchema.index({ userId: 1, createdAt: -1 });

