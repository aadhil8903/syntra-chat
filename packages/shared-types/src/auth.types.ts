export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MANAGER = 'manager',
  AUDITOR = 'auditor',
}

export interface IUser {
  id: string;
  _id?: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole | string;
  departments: string[];
  allowedFolders?: string[];
  deniedFolders?: string[];
  status?: 'active' | 'suspended';
  permissions?: string[];
  onboardingCompleted?: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateUserDto {
  email: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  departments?: string[];
  allowedFolders?: string[];
  deniedFolders?: string[];
  masterAdminPassword?: string;
}

export interface ICreateUserResult {
  user: IUser;
  temporaryPassword?: string;
  emailSent?: boolean;
  message?: string;
}

export interface IUpdateUserDto {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  departments?: string[];
  allowedFolders?: string[];
  deniedFolders?: string[];
  status?: 'active' | 'suspended';
  masterAdminPassword?: string;
}

export interface IRegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface ILoginDto {
  email: string;
  password: string;
}

export interface IAuthResponse {
  accessToken: string;
  refreshToken: string;
  user: IUser;
}

export interface IChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface IChangeMasterPasswordDto {
  currentMasterPassword: string;
  newMasterPassword: string;
}

export interface IRefreshTokenDto {
  refreshToken: string;
}

export interface IJwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

