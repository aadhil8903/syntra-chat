import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, mongo } from 'mongoose';
import { IStorageService, ISaveFileResult } from './storage.interface';
import { Readable, PassThrough } from 'stream';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

@Injectable()
export class GridFsStorageService implements IStorageService {
  private readonly logger = new Logger(GridFsStorageService.name);
  private bucket: mongo.GridFSBucket;

  constructor(@InjectConnection() private readonly connection: Connection) {
    if (this.connection.db) {
      this.bucket = new mongo.GridFSBucket(this.connection.db, {
        bucketName: 'uploads',
      });
    } else {
      this.connection.once('open', () => {
        this.bucket = new mongo.GridFSBucket(this.connection.db, {
          bucketName: 'uploads',
        });
      });
    }
  }

  private getBucket(): mongo.GridFSBucket {
    if (!this.bucket) {
      if (this.connection.db) {
        this.bucket = new mongo.GridFSBucket(this.connection.db, {
          bucketName: 'uploads',
        });
      } else {
        throw new Error('Database connection not ready for GridFS');
      }
    }
    return this.bucket;
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
    const storagePath = `${destinationSubdir}/${uniqueFilename}`.replace(/\\/g, '/');

    const bucket = this.getBucket();
    const uploadStream = bucket.openUploadStream(storagePath, {
      metadata: {
        destinationSubdir,
        originalFilename,
        size: fileBuffer.length,
        createdAt: new Date(),
      },
    });

    await new Promise<void>((resolve, reject) => {
      const bufferStream = new Readable();
      bufferStream.push(fileBuffer);
      bufferStream.push(null);

      bufferStream
        .pipe(uploadStream)
        .on('error', (err) => {
          this.logger.error(`GridFS upload failed for ${storagePath}: ${err.message}`);
          reject(err);
        })
        .on('finish', () => {
          resolve();
        });
    });

    this.logger.log(`File successfully stored in MongoDB Atlas GridFS: ${storagePath}`);

    return {
      filename: uniqueFilename,
      storagePath,
      fileSize: fileBuffer.length,
    };
  }

  async getFileStream(storagePath: string): Promise<Readable> {
    const bucket = this.getBucket();
    const cleanPath = storagePath.replace(/\\/g, '/');

    // Try finding by exact storagePath, or basename
    const files = await bucket
      .find({
        $or: [
          { filename: cleanPath },
          { filename: path.basename(cleanPath) },
          ...(Types.ObjectId.isValid(cleanPath) ? [{ _id: new Types.ObjectId(cleanPath) }] : []),
        ],
      })
      .toArray();

    if (!files || files.length === 0) {
      throw new NotFoundException(`File not found in GridFS: ${storagePath}`);
    }

    const file = files[0];
    return bucket.openDownloadStream(file._id);
  }

  async getBuffer(storagePath: string): Promise<Buffer> {
    const stream = await this.getFileStream(storagePath);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  /**
   * For downstream processes that genuinely require a temporary local file path (e.g. native parsers),
   * stream the cloud GridFS file to an isolated OS temporary directory and return an immediate cleanup callback.
   */
  async createTempFile(storagePath: string): Promise<{ tempPath: string; cleanup: () => Promise<void> }> {
    const ext = path.extname(storagePath) || '.tmp';
    const tempDir = os.tmpdir();
    const tempFileName = `syntra_chat_tmp_${randomUUID().slice(0, 8)}${ext}`;
    const tempPath = path.join(tempDir, tempFileName);

    const buffer = await this.getBuffer(storagePath);
    await fs.promises.writeFile(tempPath, buffer);

    const cleanup = async () => {
      try {
        if (fs.existsSync(tempPath)) {
          await fs.promises.unlink(tempPath);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to unlink temp file ${tempPath}: ${err.message}`);
      }
    };

    return { tempPath, cleanup };
  }

  async deleteFile(storagePath: string): Promise<void> {
    const bucket = this.getBucket();
    const cleanPath = storagePath.replace(/\\/g, '/');

    const files = await bucket
      .find({
        $or: [
          { filename: cleanPath },
          { filename: path.basename(cleanPath) },
          ...(Types.ObjectId.isValid(cleanPath) ? [{ _id: new Types.ObjectId(cleanPath) }] : []),
        ],
      })
      .toArray();

    if (files && files.length > 0) {
      for (const f of files) {
        try {
          await bucket.delete(f._id);
          this.logger.log(`Deleted GridFS file ${f._id} (${f.filename})`);
        } catch (err: any) {
          this.logger.warn(`Error deleting GridFS file ${f._id}: ${err.message}`);
        }
      }
    }
  }

  async fileExists(storagePath: string): Promise<boolean> {
    const bucket = this.getBucket();
    const cleanPath = storagePath.replace(/\\/g, '/');

    const count = await bucket
      .find({
        $or: [
          { filename: cleanPath },
          { filename: path.basename(cleanPath) },
          ...(Types.ObjectId.isValid(cleanPath) ? [{ _id: new Types.ObjectId(cleanPath) }] : []),
        ],
      })
      .count();

    return count > 0;
  }

  getAbsolutePath(storagePath: string): string {
    // In cloud storage, storagePath represents the GridFS virtual key
    return storagePath;
  }
}
