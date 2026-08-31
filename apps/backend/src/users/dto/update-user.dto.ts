import { IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  status?: 'active' | 'suspended';

  @IsString()
  @IsOptional()
  role?: string;

  @IsOptional()
  departments?: string[];

  @IsOptional()
  allowedFolders?: string[];

  @IsOptional()
  settings?: Record<string, any>;

  @IsString()
  @IsOptional()
  masterAdminPassword?: string;
}

