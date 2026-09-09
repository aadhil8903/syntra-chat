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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';
import { IConversation } from '@enter-chat/shared-types';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

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

