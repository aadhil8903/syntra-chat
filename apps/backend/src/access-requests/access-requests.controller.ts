import { Controller, Post, Patch, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AccessRequestsService } from './access-requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, ICreateAccessRequestDto, IUpdateAccessRequestDto, IAccessRequest, IAccessRequestHistoryResponse } from '@enter-chat/shared-types';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';

@Controller('access-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccessRequestsController {
  constructor(private readonly accessRequestsService: AccessRequestsService) {}

  @Post()
  async createRequest(
    @CurrentUser('id') userId: string,
    @Body() dto: ICreateAccessRequestDto
  ): Promise<IAccessRequest> {
    return this.accessRequestsService.createRequest(userId, dto);
  }

  @Get('me')
  async getMyRequests(@CurrentUser('id') userId: string): Promise<IAccessRequest[]> {
    return this.accessRequestsService.getUserRequests(userId);
  }

  @Get('pending')
  @Roles(UserRole.ADMIN)
  async getPendingRequests(): Promise<IAccessRequest[]> {
    return this.accessRequestsService.getPendingRequests();
  }

  @Get('history')
  @Roles(UserRole.ADMIN)
  async getHistory(@Query() query: any): Promise<IAccessRequestHistoryResponse> {
    return this.accessRequestsService.getHistory(query);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
    @Body() dto: IUpdateAccessRequestDto
  ): Promise<IAccessRequest> {
    return this.accessRequestsService.updateRequestStatus(id, dto, adminUserId);
  }
}
