import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatasetEntity, DatasetSchema } from './schemas/dataset.schema';
import { DatasetsService } from './datasets.service';
import { DatasetsController } from './datasets.controller';

import { UsersModule } from '../users/users.module';
import { AccessRequestsModule } from '../access-requests/access-requests.module';
import { FoldersModule } from '../folders/folders.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DatasetEntity.name, schema: DatasetSchema }]),
    UsersModule,
    AccessRequestsModule,
    FoldersModule,
  ],
  controllers: [DatasetsController],
  providers: [DatasetsService],
  exports: [DatasetsService],
})
export class DatasetsModule {}

