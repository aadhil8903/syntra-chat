import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConversationsService } from './conversations.service';
import { ConversationSharesService } from './conversation-shares.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';
import {
  IConversation,
  IConversationShare,
  ISharedConversationItem,
  IShareConversationDto,
  IUpdateSharePermissionDto,
  IDirectConversationItem,
  IDocument,
} from '@enter-chat/shared-types';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly conversationSharesService: ConversationSharesService,
  ) {}

  @Get('shared/with-me')
  async listSharedWithMe(
    @CurrentUser('id') userId: string,
  ): Promise<ISharedConversationItem[]> {
    return this.conversationSharesService.listSharedWithUser(userId);
  }

  @Get('direct')
  async listDirectConversations(
    @CurrentUser('id') userId: string,
  ): Promise<IDirectConversationItem[]> {
    return this.conversationsService.listDirectConversations(userId);
  }

  @Post('direct')
  async getOrCreateDirectConversation(
    @CurrentUser('id') userId: string,
    @Body() body: { targetUserId: string },
  ): Promise<IConversation> {
    return this.conversationsService.getOrCreateDirectConversation(userId, body.targetUserId);
  }

  @Get('direct/:id')
  async getDirectConversation(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<IConversation> {
    return this.conversationsService.getDirectConversation(userId, id);
  }

  @Patch('direct/:id/read')
  async markDirectConversationAsRead(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.conversationsService.markDirectConversationAsRead(userId, id);
  }

  @Post('direct/:id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadDirectAttachment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<IDocument> {
    return this.conversationsService.uploadDirectAttachment(userId, id, file);
  }

  @Post()
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConversationDto,
  ): Promise<IConversation> {
    return this.conversationsService.create(userId, dto);
  }

  @Get()
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('archived') archived?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<IConversation[]> {
    const isArchived = archived === 'true' ? true : archived === 'false' ? false : undefined;
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    return this.conversationsService.findAllByUser(
      userId,
      isArchived,
      pageNum || limitNum ? { page: pageNum, limit: limitNum } : undefined,
    );
  }

  @Get('search')
  async search(
    @CurrentUser('id') userId: string,
    @Query('q') query: string,
    @Query('archived') archived?: string,
  ): Promise<IConversation[]> {
    const isArchived = archived === 'true' ? true : archived === 'false' ? false : undefined;
    return this.conversationsService.search(userId, query, isArchived);
  }

  @Get(':id/shares')
  async listShares(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
  ): Promise<IConversationShare[]> {
    return this.conversationSharesService.listConversationShares(userId, conversationId);
  }

  @Post(':id/shares')
  async shareConversation(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
    @Body() dto: IShareConversationDto,
  ): Promise<IConversationShare[]> {
    return this.conversationSharesService.shareConversation(userId, conversationId, dto);
  }

  @Patch(':id/shares/:targetUserId')
  async updateSharePermission(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
    @Param('targetUserId') targetUserId: string,
    @Body() dto: IUpdateSharePermissionDto,
  ): Promise<IConversationShare> {
    return this.conversationSharesService.updateSharePermission(
      userId,
      conversationId,
      targetUserId,
      dto.permission,
    );
  }

  @Delete(':id/shares/:targetUserId')
  async revokeShare(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
    @Param('targetUserId') targetUserId: string,
  ): Promise<{ success: boolean }> {
    return this.conversationSharesService.revokeShare(userId, conversationId, targetUserId);
  }

  @Delete(':id/shares/leave')
  async leaveSharedConversation(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
  ): Promise<{ success: boolean }> {
    return this.conversationSharesService.leaveSharedConversation(userId, conversationId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<IConversation> {
    return this.conversationsService.findOneByUser(userId, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<IConversation> {
    return this.conversationsService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.conversationsService.delete(userId, id);
  }
}

