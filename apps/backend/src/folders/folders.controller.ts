import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';
import { IFolder, UserRole } from '@enter-chat/shared-types';

@Controller('folders')
@UseGuards(JwtAuthGuard)
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Get()
  async findAll(): Promise<IFolder[]> {
    return this.foldersService.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFolderDto,
  ): Promise<IFolder> {
    return this.foldersService.create(userId, dto);
  }

  @Patch('by-name/:name/download-policy')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateDownloadPolicyByName(
    @Param('name') name: string,
    @Body('downloadPolicy') downloadPolicy: 'allowed' | 'restricted',
  ): Promise<IFolder> {
    return this.foldersService.updateDownloadPolicy(decodeURIComponent(name), downloadPolicy);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFolderDto,
  ): Promise<IFolder> {
    return this.foldersService.update(id, dto);
  }

  @Delete('by-name/:name')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteByName(@Param('name') name: string): Promise<void> {
    return this.foldersService.deleteByName(decodeURIComponent(name));
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async delete(@Param('id') id: string): Promise<void> {
    return this.foldersService.delete(id);
  }
}
