import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCollectionDto {
  @IsNotEmpty({ message: 'Collection name is required' })
  @IsString({ message: 'Collection name must be a string' })
  @MaxLength(100, { message: 'Collection name cannot exceed 100 characters' })
  name: string;
}

export class UpdateCollectionDto {
  @IsNotEmpty({ message: 'Collection name is required' })
  @IsString({ message: 'Collection name must be a string' })
  @MaxLength(100, { message: 'Collection name cannot exceed 100 characters' })
  name: string;
}
