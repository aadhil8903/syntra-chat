import { Injectable, OnModuleInit, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from './schemas/role.schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultRoles();
  }

  async seedDefaultRoles() {
    const defaultRoles = [
      {
        name: 'Administrator',
        key: 'admin',
        description: 'Full system access across all departments, folders, and settings.',
        allowedFolders: [],
        permissions: ['*'],
        isSystem: true,
      },
      {
        name: 'Manager',
        key: 'manager',
        description: 'Team management with department-wide folder access.',
        allowedFolders: [],
        permissions: ['read', 'write', 'delete'],
        isSystem: true,
      },
      {
        name: 'Auditor',
        key: 'auditor',
        description: 'Read-only access for compliance and audits.',
        allowedFolders: [],
        permissions: ['read'],
        isSystem: true,
      },
      {
        name: 'User (Standard)',
        key: 'user',
        description: 'Standard member access to public and assigned folders.',
        allowedFolders: [],
        permissions: ['read', 'write'],
        isSystem: true,
      },
    ];

    for (const r of defaultRoles) {
      const exists = await this.roleModel.findOne({ key: r.key }).exec();
      if (!exists) {
        await this.roleModel.create(r);
      }
    }
  }

  async findAll(): Promise<RoleDocument[]> {
    return this.roleModel.find().sort({ isSystem: -1, name: 1 }).exec();
  }

  async findByKey(key: string): Promise<RoleDocument | null> {
    return this.roleModel.findOne({ key: key.toLowerCase().trim() }).exec();
  }

  async create(dto: CreateRoleDto): Promise<RoleDocument> {
    const key = dto.key.toLowerCase().trim().replace(/\s+/g, '_');
    const existing = await this.roleModel.findOne({ key }).exec();
    if (existing) {
      throw new ConflictException(`Role with key '${key}' already exists`);
    }

    const newRole = new this.roleModel({
      name: dto.name.trim(),
      key,
      description: dto.description || '',
      allowedFolders: dto.allowedFolders || [],
      permissions: dto.permissions || ['read', 'write'],
      isSystem: false,
    });

    return newRole.save();
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleDocument> {
    const role = await this.roleModel.findById(id).exec();
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (dto.name) role.name = dto.name.trim();
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.allowedFolders !== undefined) role.allowedFolders = dto.allowedFolders;
    if (dto.permissions !== undefined) role.permissions = dto.permissions;

    return role.save();
  }

  async delete(id: string): Promise<void> {
    const role = await this.roleModel.findById(id).exec();
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.isSystem) {
      throw new BadRequestException('Cannot delete built-in system role');
    }
    await this.roleModel.findByIdAndDelete(id).exec();
  }
}
