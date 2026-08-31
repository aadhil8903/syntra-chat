import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  allowedFolders?: string[];

  @IsArray()
  @IsOptional()
  permissions?: string[];
}
