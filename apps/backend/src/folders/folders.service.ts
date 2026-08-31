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
      // If already exists, update departments
      if (dto.allowedDepartments !== undefined) {
        existing.allowedDepartments = dto.allowedDepartments;
        const updated = await existing.save();
        return this.toIFolder(updated);
      }
      return this.toIFolder(existing);
    }

    const folder = new this.folderModel({
      name: cleanName,
      allowedDepartments: dto.allowedDepartments || [],
      createdBy: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
    });

    const saved = await folder.save();
    return this.toIFolder(saved);
  }

  async update(id: string, dto: IUpdateFolderDto): Promise<IFolder> {
    const update: any = {};
    if (dto.name !== undefined) update.name = dto.name.trim();
    if (dto.allowedDepartments !== undefined) update.allowedDepartments = dto.allowedDepartments;

    const folder = await this.folderModel.findByIdAndUpdate(id, { $set: update }, { new: true }).exec();
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
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
      createdBy: doc.createdBy?.toString(),
      createdAt: doc.createdAt?.toISOString(),
      updatedAt: doc.updatedAt?.toISOString(),
    };
  }
}
