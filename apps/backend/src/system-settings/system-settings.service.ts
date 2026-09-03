import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { SystemSetting, SystemSettingDocument } from './schemas/system-setting.schema';
import { IChangeMasterPasswordDto } from '@enter-chat/shared-types';

@Injectable()
export class SystemSettingsService implements OnModuleInit {
  private readonly logger = new Logger(SystemSettingsService.name);
  private static readonly MASTER_PASSWORD_KEY = 'master_admin_password_hash';

  // In-memory rate limiting map: { [ipOrUserId]: { count: number, resetAt: number } }
  private readonly failedAttempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    @InjectModel(SystemSetting.name)
    private readonly systemSettingModel: Model<SystemSettingDocument>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initializeMasterPassword();
  }

  /**
   * Initializes master admin password on startup.
   * If not already in DB, hashes the MASTER_ADMIN_PASSWORD from env, or generates a secure initial key.
   */
  async initializeMasterPassword(): Promise<void> {
    try {
      const existing = await this.systemSettingModel.findOne({
        key: SystemSettingsService.MASTER_PASSWORD_KEY,
      });

      if (!existing) {
        const envPassword =
          this.configService.get<string>('MASTER_ADMIN_PASSWORD') ||
          this.configService.get<string>('INITIAL_MASTER_ADMIN_PASSWORD');

        if (envPassword && envPassword.trim()) {
          const hash = await argon2.hash(envPassword.trim(), {
            type: argon2.argon2id,
          });

          await this.systemSettingModel.create({
            key: SystemSettingsService.MASTER_PASSWORD_KEY,
            value: hash,
            description: 'Argon2id hash of Master Administrator Password',
          });

          this.logger.log(
            'Master Admin Password initialized securely in database.',
          );
        } else {
          this.logger.error(
            'MASTER_ADMIN_PASSWORD is not configured. Master Administrator password cannot be initialized.',
          );
          return;
        }
      }
    } catch (err) {
      this.logger.error('Failed to initialize master password:', err);
    }
  }

  /**
   * Check if client/user is rate-limited on master password attempts
   */
  private checkRateLimit(identifier: string): void {
    const record = this.failedAttempts.get(identifier);
    const now = Date.now();
    if (record) {
      if (now < record.resetAt) {
        if (record.count >= 5) {
          throw new ForbiddenException(
            'Too many failed master password attempts. Please wait 5 minutes before trying again.',
          );
        }
      } else {
        this.failedAttempts.delete(identifier);
      }
    }
  }

  private recordFailedAttempt(identifier: string): void {
    const record = this.failedAttempts.get(identifier);
    const now = Date.now();
    if (record && now < record.resetAt) {
      record.count += 1;
    } else {
      this.failedAttempts.set(identifier, { count: 1, resetAt: now + 5 * 60 * 1000 });
    }
  }

  private clearFailedAttempts(identifier: string): void {
    this.failedAttempts.delete(identifier);
  }

  /**
   * Verifies the provided master admin password against the stored Argon2 hash.
   */
  async verifyMasterPassword(password: string | undefined | null, identifier = 'default'): Promise<boolean> {
    this.checkRateLimit(identifier);

    if (!password || !password.trim()) {
      this.recordFailedAttempt(identifier);
      return false;
    }

    let setting = await this.systemSettingModel.findOne({
      key: SystemSettingsService.MASTER_PASSWORD_KEY,
    });

    if (!setting || !setting.value) {
      await this.initializeMasterPassword();
      setting = await this.systemSettingModel.findOne({
        key: SystemSettingsService.MASTER_PASSWORD_KEY,
      });
    }

    const trimmedPassword = password.trim();


    const envPassword =
      this.configService.get<string>('MASTER_ADMIN_PASSWORD') ||
      this.configService.get<string>('INITIAL_MASTER_ADMIN_PASSWORD');

    try {
      if (setting && setting.value) {
        const isValid = await argon2.verify(setting.value, trimmedPassword);
        if (isValid) {
          this.clearFailedAttempts(identifier);
          return true;
        }
      }

      // If DB hash failed or missing, check if it matches the current environment variable
      if (envPassword && envPassword.trim() === trimmedPassword) {
        // Auto-sync the new hash to database
        const newHash = await argon2.hash(trimmedPassword, { type: argon2.argon2id });
        await this.systemSettingModel.findOneAndUpdate(
          { key: SystemSettingsService.MASTER_PASSWORD_KEY },
          { value: newHash, description: 'Argon2id hash of Master Administrator Password' },
          { upsert: true, new: true },
        );
        this.clearFailedAttempts(identifier);
        this.logger.log('Master Admin Password auto-synced to database from environment.');
        return true;
      }

      this.recordFailedAttempt(identifier);
      return false;
    } catch (err) {
      // Fallback check against env variable
      if (envPassword && envPassword.trim() === trimmedPassword) {
        this.clearFailedAttempts(identifier);
        return true;
      }
      this.recordFailedAttempt(identifier);
      return false;
    }
  }

  /**
   * Allows an authenticated administrator to rotate/change the master admin password.
   * Requires the CURRENT master admin password.
   */
  async changeMasterPassword(
    userId: string,
    dto: IChangeMasterPasswordDto,
  ): Promise<{ message: string }> {
    const { currentMasterPassword, newMasterPassword } = dto;

    if (!currentMasterPassword || !currentMasterPassword.trim()) {
      throw new UnauthorizedException('Current master admin password is required.');
    }
    if (!newMasterPassword || !newMasterPassword.trim()) {
      throw new BadRequestException('New master admin password is required.');
    }
    if (newMasterPassword.length < 8) {
      throw new BadRequestException('New master password must be at least 8 characters long.');
    }

    const complexityRegex = /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/;
    if (!complexityRegex.test(newMasterPassword)) {
      throw new BadRequestException(
        'New master password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or symbol.',
      );
    }

    const isValid = await this.verifyMasterPassword(currentMasterPassword, userId);
    if (!isValid) {
      throw new UnauthorizedException('Current master admin password is incorrect.');
    }

    if (currentMasterPassword === newMasterPassword) {
      throw new BadRequestException('New master password cannot be identical to the current master password.');
    }

    const newHash = await argon2.hash(newMasterPassword.trim(), {
      type: argon2.argon2id,
    });

    await this.systemSettingModel.findOneAndUpdate(
      { key: SystemSettingsService.MASTER_PASSWORD_KEY },
      {
        value: newHash,
        updatedBy: userId,
      },
      { upsert: true, new: true },
    );

    this.logger.log(`Master admin password successfully rotated by admin user [${userId}].`);

    return { message: 'Master admin password successfully updated.' };
  }
}
