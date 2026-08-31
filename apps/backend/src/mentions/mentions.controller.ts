import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MentionsService } from './mentions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';
import { IMentionQueryResult } from '@enter-chat/shared-types';

@Controller('mentions')
@UseGuards(JwtAuthGuard)
export class MentionsController {
  constructor(private readonly mentionsService: MentionsService) {}

  @Get()
  async search(
    @CurrentUser('id') userId: string,
    @Query('query') query?: string,
  ): Promise<IMentionQueryResult> {
    return this.mentionsService.searchMentions(userId, query || '');
  }
}

