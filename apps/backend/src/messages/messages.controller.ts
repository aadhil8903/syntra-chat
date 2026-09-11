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
import { MessagesEventsService } from './messages-events.service';
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
    private readonly messagesEventsService: MessagesEventsService,
    private readonly aiGatewayService: AiGatewayService,
  ) {}

  @Get('events')
  async streamEvents(
    @CurrentUser('id') userId: string,
    @Res() res: any,
  ): Promise<void> {
    return this.messagesEventsService.registerClient(userId, res);
  }

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
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
  ): Promise<any> {
    const userId = user?.id || user?._id?.toString();
    const userRole = user?.role;
    return this.messagesService.sendMessage(userId, dto, userRole);
  }

  @Post('stream')
  async streamMessage(
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
    @Res() res: any,
  ): Promise<void> {
    const userId = user?.id || user?._id?.toString();
    const userRole = user?.role;
    return this.messagesService.streamMessage(userId, dto, res, userRole);
  }

  @Get('shared/with-me')
  async listSharedMessagesWithMe(
    @CurrentUser('id') userId: string,
  ): Promise<any> {
    return this.messagesService.listSharedMessagesWithUser(userId);
  }

  @Get(':id/shared')
  async getSharedMessage(
    @CurrentUser('id') userId: string,
    @Param('id') messageId: string,
  ): Promise<any> {
    return this.messagesService.getSharedMessage(userId, messageId);
  }

  @Post(':id/share')
  async shareMessage(
    @CurrentUser('id') userId: string,
    @Param('id') messageId: string,
    @Body() dto: { userIds: string[] },
  ): Promise<any> {
    return this.messagesService.shareMessage(userId, messageId, dto);
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

