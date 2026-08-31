import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';
import { CreateCollectionDto, UpdateCollectionDto } from './dto/collection.dto';
import { ICollection } from '@enter-chat/shared-types';

@Controller('collections')
@UseGuards(JwtAuthGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post()
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCollectionDto,
  ): Promise<ICollection> {
    return this.collectionsService.create(userId, dto.name);
  }

  @Get()
  async findAll(@CurrentUser('id') userId: string): Promise<ICollection[]> {
    return this.collectionsService.findAllByUser(userId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<ICollection> {
    return this.collectionsService.findOneByUser(userId, id);
  }

  @Patch(':id')
  async rename(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCollectionDto,
  ): Promise<ICollection> {
    return this.collectionsService.rename(userId, id, dto.name);
  }

  @Delete(':id')
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    await this.collectionsService.delete(userId, id);
    return { success: true };
  }

  @Patch('move/:conversationId')
  async moveConversation(
    @CurrentUser('id') userId: string,
    @Param('conversationId') conversationId: string,
    @Body('collectionId') collectionId: string | null,
  ): Promise<{ success: boolean }> {
    await this.collectionsService.moveConversation(userId, conversationId, collectionId || null);
    return { success: true };
  }
}
