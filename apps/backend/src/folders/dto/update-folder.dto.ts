import { IsString, IsArray, IsOptional } from 'class-validator';

export class UpdateFolderDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsOptional()
  allowedDepartments?: string[];
}
