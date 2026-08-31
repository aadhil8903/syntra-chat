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
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IDocument, UserRole } from '@enter-chat/shared-types';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadFile(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
    @Body('allowedDepartments') allowedDepartments?: string,
  ): Promise<IDocument> {
    const deps = allowedDepartments ? allowedDepartments.split(',').map(d => d.trim()).filter(d => d) : [];
    return this.documentsService.uploadDocument(userId, file, folder || '', deps);
  }

  @Post('retry/:id')
  async retryIngestion(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<IDocument> {
    return this.documentsService.retryIngestion(userId, id);
  }

  @Patch(':id/folder')
  @Roles(UserRole.ADMIN)
  async updateFolder(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body('folder') folder: string,
    @Body('allowedDepartments') allowedDepartments?: string[],
  ): Promise<IDocument> {
    return this.documentsService.updateFolderAndDeps(userId, id, folder || '', allowedDepartments);
  }

  @Get()
  async findAll(@CurrentUser('id') userId: string): Promise<IDocument[]> {
    return this.documentsService.findAllAccessible(userId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<IDocument> {
    return this.documentsService.findOneAccessible(userId, id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.documentsService.deleteDocument(userId, id);
  }
}
