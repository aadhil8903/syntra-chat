import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDocument, Types } from 'mongoose';

export type CollectionEntityDocument = CollectionEntity & MongoDocument;

@Schema({ timestamps: true, collection: 'collections' })
export class CollectionEntity {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ type: String, default: '' })
  sharedMemory: string;

  @Prop({ type: Number, default: 1 })
  summaryVersion: number;

  createdAt: Date;
  updatedAt: Date;
}

export const CollectionSchema = SchemaFactory.createForClass(CollectionEntity);
CollectionSchema.index({ userId: 1, updatedAt: -1 });
CollectionSchema.index({ userId: 1, name: 1 });
