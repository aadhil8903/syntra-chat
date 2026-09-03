import { IsString, IsArray, IsOptional, ArrayNotEmpty } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  name: string;

  @IsArray()
  @IsOptional()
  allowedDepartments?: string[];

  @IsString()
  @IsOptional()
  downloadPolicy?: 'allowed' | 'restricted';
}
