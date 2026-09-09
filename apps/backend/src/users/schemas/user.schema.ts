import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from '@enter-chat/shared-types';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true, default: UserRole.USER })
  role: UserRole | string;

  @Prop({ type: [String], default: [] })
  departments: string[];

  @Prop({ type: [String], default: [] })
  allowedFolders: string[];

  @Prop({ type: [String], default: [] })
  deniedFolders: string[];

  @Prop({ type: String, enum: ['active', 'suspended'], default: 'active' })
  status: 'active' | 'suspended';

  @Prop({ type: Boolean, default: false })
  onboardingCompleted: boolean;

  @Prop({ type: Boolean, default: false })
  mustChangePassword: boolean;

  @Prop({ required: false })
  refreshTokenHash?: string;

  @Prop({ type: Object, default: {} })
  settings: Record<string, any>;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @Prop({ type: Date, required: false })
  deletedAt?: Date;

  @Prop({ type: String, required: false })
  deletedBy?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
