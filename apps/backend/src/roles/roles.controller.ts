import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@enter-chat/shared-types';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async getRoles() {
    const roles = await this.rolesService.findAll();
    return { roles };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async createRole(@Body() dto: CreateRoleDto) {
    const role = await this.rolesService.create(dto);
    return { role };
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const role = await this.rolesService.update(id, dto);
    return { role };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteRole(@Param('id') id: string) {
    await this.rolesService.delete(id);
    return { success: true };
  }
}
