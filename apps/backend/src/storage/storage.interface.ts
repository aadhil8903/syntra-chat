import { Readable } from 'stream';

export interface ISaveFileResult {
  filename: string;
  storagePath: string;
  fileSize: number;
}

export interface IStorageService {
  saveFile(
    fileBuffer: Buffer,
    destinationSubdir: string,
    originalFilename: string,
  ): Promise<ISaveFileResult>;

  getFileStream(storagePath: string): Promise<Readable>;

  getBuffer(storagePath: string): Promise<Buffer>;

  createTempFile(storagePath: string): Promise<{ tempPath: string; cleanup: () => Promise<void> }>;

  deleteFile(storagePath: string): Promise<void>;

  fileExists(storagePath: string): Promise<boolean>;

  getAbsolutePath(storagePath: string): string;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';


