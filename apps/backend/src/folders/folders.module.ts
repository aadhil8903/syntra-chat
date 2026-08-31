import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FolderEntity, FolderEntitySchema } from './schemas/folder.schema';
import { FoldersService } from './folders.service';
import { FoldersController } from './folders.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FolderEntity.name, schema: FolderEntitySchema },
    ]),
  ],
  providers: [FoldersService],
  controllers: [FoldersController],
  exports: [FoldersService, MongooseModule],
})
export class FoldersModule {}
