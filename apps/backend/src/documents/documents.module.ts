import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentEntity, DocumentSchema } from './schemas/document.schema';
import { DatasetEntity, DatasetSchema } from '../datasets/schemas/dataset.schema';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';

import { UsersModule } from '../users/users.module';
import { AccessRequestsModule } from '../access-requests/access-requests.module';
import { FoldersModule } from '../folders/folders.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentEntity.name, schema: DocumentSchema },
      { name: DatasetEntity.name, schema: DatasetSchema },
    ]),
    UsersModule,
    AccessRequestsModule,
    FoldersModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

