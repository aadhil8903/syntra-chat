import { IsOptional, IsString, IsArray } from 'class-validator';
import { ICreateConversationDto } from '@enter-chat/shared-types';

export class CreateConversationDto implements ICreateConversationDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  collectionId?: string | null;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachedResourceIds?: string[];
}

