import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FolderEntityDocument = FolderEntity & Document;

@Schema({ collection: 'folders', timestamps: true })
export class FolderEntity {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ type: [String], default: [] })
  allowedDepartments: string[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const FolderEntitySchema = SchemaFactory.createForClass(FolderEntity);
