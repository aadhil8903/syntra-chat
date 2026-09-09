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
  Res,
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
    @Body('downloadPolicy') downloadPolicy?: 'inherit' | 'allowed' | 'restricted',
  ): Promise<IDocument> {
    const deps = allowedDepartments ? allowedDepartments.split(',').map(d => d.trim()).filter(d => d) : [];
    return this.documentsService.uploadDocument(userId, file, folder || '', deps, downloadPolicy || 'inherit');
  }

  @Post(':id/replace')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async replaceFile(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<IDocument> {
    return this.documentsService.replaceDocument(userId, id, file);
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
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<IDocument[]> {
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    return this.documentsService.findAllAccessible(
      userId,
      pageNum || limitNum ? { page: pageNum, limit: limitNum } : undefined,
    );
  }

  @Get(':id')
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<IDocument> {
    return this.documentsService.findOneAccessible(userId, id);
  }

  @Get(':id/download')
  async download(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Res() res: any,
  ): Promise<void> {
    return this.documentsService.downloadDocument(userId, id, res);
  }

  @Patch(':id/download-policy')
  @Roles(UserRole.ADMIN)
  async updateDownloadPolicy(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body('downloadPolicy') downloadPolicy: 'inherit' | 'allowed' | 'restricted',
  ): Promise<IDocument> {
    return this.documentsService.updateDownloadPolicy(userId, id, downloadPolicy);
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
