import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { INotification } from '@enter-chat/shared-types';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
  ): Promise<INotification[]> {
    const limitNum = limit ? parseInt(limit, 10) : 30;
    return this.notificationsService.getUserNotifications(userId, limitNum);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser('id') userId: string): Promise<{ count: number }> {
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser('id') userId: string): Promise<{ success: boolean }> {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Param('id') notificationId: string,
  ): Promise<{ success: boolean }> {
    return this.notificationsService.markAsRead(userId, notificationId);
  }
}
