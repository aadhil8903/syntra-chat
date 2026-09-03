import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { IUser, UserRole, ICreateUserResult, isAdminRole } from '@enter-chat/shared-types';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { UserDocument } from './schemas/user.schema';
import { MailService } from '../mail/mail.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly mailService: MailService,
    private readonly systemSettingsService: SystemSettingsService,
    @Optional() private readonly configService?: ConfigService,
    @InjectConnection() @Optional() private readonly connection?: Connection,
  ) {}

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentPasswordValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordHash = await argon2.hash(dto.newPassword.trim());

    // Update password hash, clear mustChangePassword flag, and invalidate active sessions/refresh tokens
    await this.usersRepository.updateById(userId, {
      passwordHash: newPasswordHash,
      mustChangePassword: false,
      refreshTokenHash: null,
    } as any);

    return { message: 'Password changed successfully' };
  }

  async completeOnboarding(userId: string): Promise<IUser> {
    const user = await this.usersRepository.updateById(userId, {
      onboardingCompleted: true,
    } as any);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toIUser(user);
  }

  async findById(id: string): Promise<IUser> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toIUser(user);
  }

  async findDocumentById(id: string): Promise<UserDocument | null> {
    return this.usersRepository.findById(id);
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.usersRepository.findByEmail(email);
  }

  async updateProfile(userId: string, updateUserDto: any): Promise<IUser> {
    const safeData: any = {};
    if (updateUserDto.firstName !== undefined) safeData.firstName = updateUserDto.firstName;
    if (updateUserDto.lastName !== undefined) safeData.lastName = updateUserDto.lastName;
    if (updateUserDto.settings !== undefined) safeData.settings = updateUserDto.settings;

    const updated = await this.usersRepository.updateById(userId, safeData);
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    return this.toIUser(updated);
  }

  async update(id: string, updateUserDto: any, actingAdminId = 'admin'): Promise<IUser> {
    const existing = await this.usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    // If requested role is Administrator and existing user was not already Administrator
    const targetRole = updateUserDto.role ? updateUserDto.role.toString().toLowerCase().trim() : undefined;
    const existingRole = existing.role ? existing.role.toString().toLowerCase().trim() : '';
    const isTargetAdmin = targetRole === 'admin';
    const wasAlreadyAdmin = existingRole === 'admin';

    if (isTargetAdmin && !wasAlreadyAdmin) {
      let isValidMaster = await this.systemSettingsService.verifyMasterPassword(
        updateUserDto.masterAdminPassword,
        actingAdminId,
      );

      // If system master password check failed, also verify if the acting administrator entered their own account password
      if (!isValidMaster && updateUserDto.masterAdminPassword && actingAdminId) {
        try {
          const actingAdmin = await this.usersRepository.findById(actingAdminId);
          if (actingAdmin && actingAdmin.passwordHash) {
            const isPasswordMatch = await argon2.verify(
              actingAdmin.passwordHash,
              updateUserDto.masterAdminPassword.trim(),
            );
            if (isPasswordMatch) {
              isValidMaster = true;
            }
          }
        } catch {
          // Ignore and proceed to validation check below
        }
      }

      if (!isValidMaster) {
        throw new ForbiddenException(
          'Valid Master Administrator Password is required to grant the Administrator role.',
        );
      }
    }

    const updateData: any = { ...updateUserDto };
    // Prevent unverified password changes through generic update endpoint
    delete updateData.password;
    delete updateData.passwordHash;
    delete updateData.masterAdminPassword;

    const updated = await this.usersRepository.updateById(id, updateData);
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    if (updateUserDto.status === 'suspended') {
      await this.setRefreshTokenHash(id, null);
    }
    return this.toIUser(updated);
  }

  async setRefreshTokenHash(id: string, refreshToken: string | null): Promise<void> {
    const hash = refreshToken ? await argon2.hash(refreshToken) : null;
    await this.usersRepository.updateRefreshTokenHash(id, hash);
  }

  private generateTemporaryPassword(): string {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '@#$%&*';
    const allAlphanumeric = uppercase + lowercase + numbers;

    // Pick 1 of each required category
    const u = uppercase[crypto.randomInt(0, uppercase.length)];
    const l = lowercase[crypto.randomInt(0, lowercase.length)];
    const n = numbers[crypto.randomInt(0, numbers.length)];
    const s = symbols[crypto.randomInt(0, symbols.length)];

    // Pick 6 more random alphanumeric characters
    let inner = '';
    for (let i = 0; i < 6; i++) {
      inner += allAlphanumeric[crypto.randomInt(0, allAlphanumeric.length)];
    }

    // Shuffle middle characters (including the symbol in the middle)
    const middleChars = (u + l + n + s + inner).split('');
    for (let i = middleChars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [middleChars[i], middleChars[j]] = [middleChars[j], middleChars[i]];
    }

    // Ensure password begins with an uppercase letter and ends with a digit
    // This prevents mobile word-selection from truncating trailing punctuation like !
    const prefix = uppercase[crypto.randomInt(0, uppercase.length)];
    const suffix = numbers[crypto.randomInt(0, numbers.length)];

    return prefix + middleChars.join('') + suffix;
  }

  async createUserByAdmin(dto: any, actingAdminId = 'admin'): Promise<ICreateUserResult> {
    if (!dto) {
      throw new BadRequestException('User payload is required.');
    }

    if (!dto.email || typeof dto.email !== 'string') {
      throw new BadRequestException('Please provide a valid email address.');
    }
    const email = dto.email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Please provide a valid email address.');
    }

    if (!dto.firstName || typeof dto.firstName !== 'string' || !dto.firstName.trim()) {
      throw new BadRequestException('First name is required.');
    }
    if (!dto.lastName || typeof dto.lastName !== 'string' || !dto.lastName.trim()) {
      throw new BadRequestException('Last name is required.');
    }

    let departments: string[] = [];
    if (dto.departments !== undefined && dto.departments !== null) {
      if (!Array.isArray(dto.departments) || dto.departments.some((d: any) => typeof d !== 'string')) {
        throw new BadRequestException('Departments must be a list of valid department names.');
      }
      departments = Array.from(new Set(dto.departments.map((d: string) => d.trim()).filter(Boolean)));
    }

    let allowedFolders: string[] = [];
    if (dto.allowedFolders !== undefined && dto.allowedFolders !== null) {
      if (!Array.isArray(dto.allowedFolders) || dto.allowedFolders.some((f: any) => typeof f !== 'string')) {
        throw new BadRequestException('Allowed folders must be a list of valid folder names.');
      }
      allowedFolders = Array.from(new Set(dto.allowedFolders.map((f: string) => f.trim()).filter(Boolean)));
    }

    let deniedFolders: string[] = [];
    if (dto.deniedFolders !== undefined && dto.deniedFolders !== null) {
      if (!Array.isArray(dto.deniedFolders) || dto.deniedFolders.some((f: any) => typeof f !== 'string')) {
        throw new BadRequestException('Denied folders must be a list of valid folder names.');
      }
      deniedFolders = Array.from(new Set(dto.deniedFolders.map((f: string) => f.trim()).filter(Boolean)));
    }

    const existing = await this.usersRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }

    // Role handling
    let targetRole: string = UserRole.USER;
    if (dto.role) {
      if (typeof dto.role !== 'string') {
        throw new BadRequestException('Role must be a string value.');
      }
      targetRole = dto.role.toLowerCase().trim();
    }

    // If requested role is Administrator, require Master Admin Password
    if (isAdminRole(targetRole)) {
      let isValidMaster = await this.systemSettingsService.verifyMasterPassword(
        dto.masterAdminPassword,
        actingAdminId,
      );

      // If system master password check failed, also verify if the acting administrator entered their own account password
      if (!isValidMaster && dto.masterAdminPassword && actingAdminId) {
        try {
          const actingAdmin = await this.usersRepository.findById(actingAdminId);
          if (actingAdmin && actingAdmin.passwordHash) {
            const isPasswordMatch = await argon2.verify(
              actingAdmin.passwordHash,
              dto.masterAdminPassword.trim(),
            );
            if (isPasswordMatch) {
              isValidMaster = true;
            }
          }
        } catch {
          // Ignore and proceed to validation check below
        }
      }

      if (!isValidMaster) {
        throw new ForbiddenException(
          'Valid Master Administrator Password is required to create an Administrator account.',
        );
      }
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword);

    this.logger.log(`[MAIL TRACE] createUserByAdmin() started for email=${email}`);

    const user = await this.usersRepository.create({
      email,
      passwordHash,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      role: targetRole,
      departments,
      allowedFolders,
      deniedFolders,
      status: 'active',
      mustChangePassword: true,
      onboardingCompleted: false,
      settings: {},
    });

    this.logger.log(`[MAIL TRACE] User created successfully (id=${user._id || user.id})`);
    this.logger.log(`[MAIL TRACE] About to call sendWelcomeEmail() for ${user.email}`);

    const emailSent = await this.mailService.sendWelcomeEmail(
      user.email,
      user.firstName,
      temporaryPassword,
    );

    this.logger.log(`[MAIL TRACE] sendWelcomeEmail() returned emailSent=${emailSent}`);

    return {
      user: this.toIUser(user),
      temporaryPassword,
      emailSent,
      message: emailSent
        ? 'User created and welcome email dispatched successfully.'
        : 'User created. Email delivery pending/unavailable; temporary password generated below.',
    };
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const primaryAdminEmail = (this.configService?.get<string>('PRIMARY_ADMIN_EMAIL') || 'aadhildevwork@gmail.com').toLowerCase().trim();
    const userRoleStr = (user.role || '').toString().toLowerCase().trim();
    const userEmailStr = (user.email || '').toString().toLowerCase().trim();

    if (userRoleStr === 'admin' && (userEmailStr === primaryAdminEmail || userEmailStr === 'aadhildevwork@gmail.com')) {
      throw new ConflictException('The primary system administrator account cannot be deleted.');
    }

    // Preserve historical requester & resolver names in access requests audit log
    if (this.connection) {
      try {
        const userFullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
        await this.connection.collection('access_requests').updateMany(
          { userId: new Types.ObjectId(id) },
          {
            $set: {
              userName: userFullName,
              userEmail: user.email,
            },
          },
        );
        await this.connection.collection('access_requests').updateMany(
          { resolvedBy: new Types.ObjectId(id) },
          {
            $set: {
              resolvedByName: userFullName,
              resolvedByEmail: user.email,
            },
          },
        );
      } catch (err) {
        this.logger.warn(`Failed to snapshot user identity for deleted user ${id}: ${err}`);
      }
    }

    const deleted = await this.usersRepository.deleteById(id);
    if (!deleted) {
      throw new NotFoundException('User not found');
    }
  }

  toIUser(user: UserDocument): IUser {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role as any,
      departments: user.departments || [],
      allowedFolders: (user as any).allowedFolders || [],
      deniedFolders: (user as any).deniedFolders || [],
      status: (user as any).status || 'active',
      permissions: (user as any).permissions || [],
      onboardingCompleted: (user as any).onboardingCompleted ?? false,
      mustChangePassword: (user as any).mustChangePassword ?? false,
      createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: user.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }

  async addAllowedFolder(userId: string, folder: string): Promise<void> {
    if (!folder || !folder.trim()) return;
    const user = await this.usersRepository.findById(userId);
    if (!user) return;
    const current = (user as any).allowedFolders || [];
    const cleanFolder = folder.trim();
    if (!current.includes(cleanFolder)) {
      await this.usersRepository.updateById(userId, {
        allowedFolders: [...current, cleanFolder],
      } as any);
    }
  }

  async findAll(): Promise<IUser[]> {
    const users = await this.usersRepository.findAll();
    return users.map((u) => this.toIUser(u));
  }
}
