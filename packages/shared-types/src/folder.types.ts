export interface IFolder {
  id: string;
  name: string;
  allowedDepartments: string[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ICreateFolderDto {
  name: string;
  allowedDepartments?: string[];
}

export interface IUpdateFolderDto {
  name?: string;
  allowedDepartments?: string[];
}
