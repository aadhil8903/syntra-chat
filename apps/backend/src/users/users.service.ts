import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { IUser, UserRole, ICreateUserResult } from '@enter-chat/shared-types';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { UserDocument } from './schemas/user.schema';
import { MailService } from '../mail/mail.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly mailService: MailService,
    private readonly systemSettingsService: SystemSettingsService,
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
    const targetRole = updateUserDto.role;
    if (targetRole && (targetRole === UserRole.ADMIN || targetRole === 'admin') && existing.role !== UserRole.ADMIN && existing.role !== 'admin') {
      const isValidMaster = await this.systemSettingsService.verifyMasterPassword(
        updateUserDto.masterAdminPassword,
        actingAdminId,
      );
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
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    // If requested role is Administrator, require Master Admin Password
    const targetRole = dto.role;
    if (targetRole && (targetRole === UserRole.ADMIN || targetRole === 'admin')) {
      const isValidMaster = await this.systemSettingsService.verifyMasterPassword(
        dto.masterAdminPassword,
        actingAdminId,
      );
      if (!isValidMaster) {
        throw new ForbiddenException(
          'Valid Master Administrator Password is required to create an Administrator account.',
        );
      }
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword);

    const user = await this.usersRepository.create({
      email: dto.email.toLowerCase().trim(),
      passwordHash,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      role: dto.role || UserRole.USER,
      departments: dto.departments || [],
      allowedFolders: dto.allowedFolders || [],
      deniedFolders: dto.deniedFolders || [],
      status: 'active',
      mustChangePassword: true,
      onboardingCompleted: false,
      settings: {},
    });

    const emailSent = await this.mailService.sendWelcomeEmail(
      user.email,
      user.firstName,
      temporaryPassword,
    );

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

    if (user.role === UserRole.ADMIN && user.email.toLowerCase() === 'aadil@gmail.com') {
      throw new ConflictException('The primary system administrator account cannot be deleted.');
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
