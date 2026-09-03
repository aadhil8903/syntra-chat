export type FolderDownloadPolicy = 'allowed' | 'restricted';

export interface IFolder {
  id: string;
  name: string;
  allowedDepartments: string[];
  downloadPolicy?: FolderDownloadPolicy;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ICreateFolderDto {
  name: string;
  allowedDepartments?: string[];
  downloadPolicy?: FolderDownloadPolicy;
}

export interface IUpdateFolderDto {
  name?: string;
  allowedDepartments?: string[];
  downloadPolicy?: FolderDownloadPolicy;
}
