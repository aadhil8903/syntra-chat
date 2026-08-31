import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SystemSettingDocument = SystemSetting & Document;

@Schema({ timestamps: true, collection: 'system_settings' })
export class SystemSetting {
  @Prop({ required: true, unique: true, index: true })
  key: string;

  @Prop({ required: true })
  value: string;

  @Prop()
  description?: string;

  @Prop()
  updatedBy?: string;
}

export const SystemSettingSchema = SchemaFactory.createForClass(SystemSetting);
