import { IsOptional, IsString, IsArray, IsBoolean } from 'class-validator';
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

  @IsBoolean()
  @IsOptional()
  pinned?: boolean;

  @IsBoolean()
  @IsOptional()
  archived?: boolean;
}

