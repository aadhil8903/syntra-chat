import { Controller, Patch, Body, UseGuards } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';
import { UserRole, IChangeMasterPasswordDto } from '@enter-chat/shared-types';

@Controller('system-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Patch('master-password')
  @Roles(UserRole.ADMIN)
  async changeMasterPassword(
    @CurrentUser('id') userId: string,
    @Body() dto: IChangeMasterPasswordDto,
  ): Promise<{ message: string }> {
    return this.systemSettingsService.changeMasterPassword(userId, dto);
  }
}
