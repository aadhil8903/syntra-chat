import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async create(data: Partial<User>): Promise<UserDocument> {
    const user = new this.userModel(data);
    return user.save();
  }

  async findById(id: string, includeDeleted = false): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const filter: any = { _id: new Types.ObjectId(id) };
    if (!includeDeleted) {
      filter.isDeleted = { $ne: true };
    }
    return this.userModel.findOne(filter).exec();
  }

  async count(filter: any = {}): Promise<number> {
    const query = { ...filter };
    if (query.isDeleted === undefined) {
      query.isDeleted = { $ne: true };
    }
    return this.userModel.countDocuments(query);
  }

  async findByEmail(email: string, includeDeleted = false): Promise<UserDocument | null> {
    const filter: any = { email: email.toLowerCase().trim() };
    if (!includeDeleted) {
      filter.isDeleted = { $ne: true };
    }
    return this.userModel.findOne(filter).exec();
  }

  async updateById(id: string, update: Partial<User>): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.userModel.findByIdAndUpdate(id, { $set: update }, { new: true }).exec();
  }

  async updateRefreshTokenHash(userId: string, hash: string | null): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) return;
    await this.userModel.findByIdAndUpdate(userId, { $set: { refreshTokenHash: hash } }).exec();
  }

  async findAll(
    filter: any = {},
    pagination?: { page?: number; limit?: number },
  ): Promise<{ users: UserDocument[]; total: number; page: number; limit: number; totalPages: number }> {
    const query: any = { ...filter };
    if (query.isDeleted === undefined) {
      query.isDeleted = { $ne: true };
    }
    const total = await this.userModel.countDocuments(query);
    const page = Math.max(1, pagination?.page || 1);
    const limit = pagination?.limit && pagination.limit > 0 ? pagination.limit : total > 0 ? total : 50;
    const skip = (page - 1) * limit;

    const users = await this.userModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
    return { users, total, page, limit, totalPages };
  }

  async softDeleteById(id: string, deletedBy?: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.userModel.findByIdAndUpdate(
      id,
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: deletedBy || 'system',
          status: 'suspended',
          refreshTokenHash: null,
        },
      },
      { new: true },
    ).exec();
  }

  async deleteById(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await this.userModel.findByIdAndDelete(id).exec();
    return !!res;
  }
}

