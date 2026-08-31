import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DatasetsService } from './datasets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IDataset, UserRole } from '@enter-chat/shared-types';

@Controller('datasets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DatasetsController {
  constructor(private readonly datasetsService: DatasetsService) {}

  @Post('upload')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async uploadFile(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
    @Body('allowedDepartments') allowedDepartments?: string,
  ): Promise<IDataset> {
    const deps = allowedDepartments ? allowedDepartments.split(',').map(d => d.trim()).filter(d => d) : [];
    return this.datasetsService.uploadDataset(userId, file, folder || '', deps);
  }

  @Post('retry/:id')
  async retryInspection(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<IDataset> {
    return this.datasetsService.retryInspection(userId, id);
  }

  @Patch(':id/folder')
  @Roles(UserRole.ADMIN)
  async updateFolder(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body('folder') folder: string,
    @Body('allowedDepartments') allowedDepartments?: string[],
  ): Promise<IDataset> {
    return this.datasetsService.updateFolderAndDeps(userId, id, folder || '', allowedDepartments);
  }

  @Get()
  async findAll(@CurrentUser('id') userId: string): Promise<IDataset[]> {
    return this.datasetsService.findAllAccessible(userId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<IDataset> {
    return this.datasetsService.findOneAccessible(userId, id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.datasetsService.deleteDataset(userId, id);
  }
}
