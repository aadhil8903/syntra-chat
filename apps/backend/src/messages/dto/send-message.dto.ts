import { IsNotEmpty, IsString, IsArray, IsOptional, IsBoolean } from 'class-validator';
import { ISendMessageDto, IReplyToPreview } from '@enter-chat/shared-types';

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

  @IsArray()
  @IsOptional()
  mentions?: Array<{ type: 'user' | 'ai'; id: string; name: string }>;

  @IsBoolean()
  @IsOptional()
  isDirect?: boolean;

  @IsOptional()
  downloadableFile?: any;

  @IsString()
  @IsOptional()
  replyToMessageId?: string;

  @IsOptional()
  replyTo?: IReplyToPreview;
}

