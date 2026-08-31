import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Res,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessagesService } from './messages.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';
import { IMessage } from '@enter-chat/shared-types';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly aiGatewayService: AiGatewayService,
  ) {}

  @Get('active-generations')
  async getActiveGenerations(
    @CurrentUser('id') userId: string,
  ): Promise<{ activeConversationIds: string[] }> {
    return {
      activeConversationIds: this.messagesService.getActiveGenerations(userId),
    };
  }

  @Get('conversation/:conversationId')
  async findByConversation(
    @CurrentUser('id') userId: string,
    @Param('conversationId') conversationId: string,
  ): Promise<IMessage[]> {
    return this.messagesService.findByConversation(userId, conversationId);
  }

  @Post()
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ): Promise<any> {
    return this.messagesService.sendMessage(userId, dto);
  }

  @Post('stream')
  async streamMessage(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
    @Res() res: any,
  ): Promise<void> {
    return this.messagesService.streamMessage(userId, dto, res);
  }

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file'))
  async transcribeAudio(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ transcript: string }> {
    if (!file) {
      return { transcript: '' };
    }
    return this.aiGatewayService.transcribeAudio(file);
  }
}

