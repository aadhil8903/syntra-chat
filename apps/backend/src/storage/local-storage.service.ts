import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IStorageService, ISaveFileResult } from './storage.interface';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

@Injectable()
export class LocalStorageService implements IStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly basePath: string;

  constructor(private readonly configService: ConfigService) {
    this.basePath = path.resolve(
      process.cwd(),
      this.configService.get<string>('STORAGE_LOCAL_PATH', './uploads'),
    );
    this.ensureDirectoryExists(this.basePath);
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  async saveFile(
    fileBuffer: Buffer,
    destinationSubdir: string,
    originalFilename: string,
  ): Promise<ISaveFileResult> {
    const ext = path.extname(originalFilename);
    const sanitizedBase = path
      .basename(originalFilename, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueFilename = `${sanitizedBase}_${randomUUID().slice(0, 8)}${ext}`;

    const targetDir = path.join(this.basePath, destinationSubdir);
    this.ensureDirectoryExists(targetDir);

    const fullFilePath = path.join(targetDir, uniqueFilename);
    await fs.promises.writeFile(fullFilePath, fileBuffer);

    const relativeStoragePath = path
      .relative(this.basePath, fullFilePath)
      .replace(/\\/g, '/');

    return {
      filename: uniqueFilename,
      storagePath: relativeStoragePath,
      fileSize: fileBuffer.length,
    };
  }

  async getFileStream(storagePath: string): Promise<Readable> {
    const fullPath = this.getAbsolutePath(storagePath);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('File not found in storage');
    }
    return fs.createReadStream(fullPath);
  }

  async getBuffer(storagePath: string): Promise<Buffer> {
    const fullPath = this.getAbsolutePath(storagePath);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('File not found in storage');
    }
    return fs.promises.readFile(fullPath);
  }

  async createTempFile(storagePath: string): Promise<{ tempPath: string; cleanup: () => Promise<void> }> {
    const fullPath = this.getAbsolutePath(storagePath);
    return {
      tempPath: fullPath,
      cleanup: async () => {},
    };
  }

  async deleteFile(storagePath: string): Promise<void> {
    const fullPath = this.getAbsolutePath(storagePath);
    if (fs.existsSync(fullPath)) {
      try {
        await fs.promises.unlink(fullPath);
      } catch (err) {
        this.logger.warn(`Failed to delete file at ${fullPath}: ${err.message}`);
      }
    }
  }

  async fileExists(storagePath: string): Promise<boolean> {
    const fullPath = this.getAbsolutePath(storagePath);
    return fs.existsSync(fullPath);
  }

  getAbsolutePath(storagePath: string): string {
    return path.resolve(this.basePath, storagePath);
  }
}

