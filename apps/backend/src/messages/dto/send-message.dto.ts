import { IsNotEmpty, IsString, IsArray, IsOptional } from 'class-validator';
import { ISendMessageDto } from '@enter-chat/shared-types';

export class SendMessageDto implements ISendMessageDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  referencedResourceIds?: string[];
}

