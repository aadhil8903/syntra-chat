import { IsNotEmpty, IsString, IsArray, IsOptional, IsBoolean } from 'class-validator';
import { ISendMessageDto } from '@enter-chat/shared-types';

export class SendMessageDto implements ISendMessageDto {
  @IsString()
  @IsOptional()
  conversationId?: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  referencedResourceIds?: string[];

  @IsBoolean()
  @IsOptional()
  temporary?: boolean;
}

