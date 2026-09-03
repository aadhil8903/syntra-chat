import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FolderEntity, FolderEntityDocument } from './schemas/folder.schema';
import { IFolder, ICreateFolderDto, IUpdateFolderDto } from '@enter-chat/shared-types';

@Injectable()
export class FoldersService {
  constructor(
    @InjectModel(FolderEntity.name)
    private readonly folderModel: Model<FolderEntityDocument>,
  ) {}

  async findAll(): Promise<IFolder[]> {
    const folders = await this.folderModel.find().sort({ name: 1 }).exec();
    return folders.map((f) => this.toIFolder(f));
  }

  async findByName(name: string): Promise<IFolder | null> {
    const folder = await this.folderModel.findOne({ name: name.trim() }).exec();
    return folder ? this.toIFolder(folder) : null;
  }

  async create(userId: string, dto: ICreateFolderDto): Promise<IFolder> {
    const cleanName = dto.name.trim();
    const existing = await this.folderModel.findOne({ name: cleanName }).exec();
    if (existing) {
      // If already exists, update departments and downloadPolicy if provided
      let changed = false;
      if (dto.allowedDepartments !== undefined) {
        existing.allowedDepartments = dto.allowedDepartments;
        changed = true;
      }
      if (dto.downloadPolicy !== undefined) {
        existing.downloadPolicy = dto.downloadPolicy;
        changed = true;
      }
      if (changed) {
        const updated = await existing.save();
        return this.toIFolder(updated);
      }
      return this.toIFolder(existing);
    }

    const folder = new this.folderModel({
      name: cleanName,
      allowedDepartments: dto.allowedDepartments || [],
      downloadPolicy: dto.downloadPolicy || 'allowed',
      createdBy: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
    });

    const saved = await folder.save();
    return this.toIFolder(saved);
  }

  async update(id: string, dto: IUpdateFolderDto): Promise<IFolder> {
    const update: any = {};
    if (dto.name !== undefined) update.name = dto.name.trim();
    if (dto.allowedDepartments !== undefined) update.allowedDepartments = dto.allowedDepartments;
    if (dto.downloadPolicy !== undefined) update.downloadPolicy = dto.downloadPolicy;

    const folder = await this.folderModel.findByIdAndUpdate(id, { $set: update }, { new: true }).exec();
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return this.toIFolder(folder);
  }

  async updateDownloadPolicy(idOrName: string, policy: 'allowed' | 'restricted'): Promise<IFolder> {
    const filter = Types.ObjectId.isValid(idOrName) ? { _id: idOrName } : { name: idOrName.trim() };
    const folder = await this.folderModel.findOneAndUpdate(
      filter,
      { $set: { downloadPolicy: policy } },
      { new: true, upsert: true },
    ).exec();
    return this.toIFolder(folder);
  }

  async delete(id: string): Promise<void> {
    const folder = await this.folderModel.findByIdAndDelete(id).exec();
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
  }

  async deleteByName(name: string): Promise<void> {
    const result = await this.folderModel.deleteMany({
      $or: [
        { name },
        { name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/` } },
      ],
    }).exec();
  }

  toIFolder(doc: FolderEntityDocument): IFolder {
    return {
      id: doc._id.toString(),
      name: doc.name,
      allowedDepartments: doc.allowedDepartments || [],
      downloadPolicy: (doc.downloadPolicy as any) || 'allowed',
      createdBy: doc.createdBy?.toString(),
      createdAt: doc.createdAt?.toISOString(),
      updatedAt: doc.updatedAt?.toISOString(),
    };
  }
}
