import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentEntity, DocumentSchema } from '../documents/schemas/document.schema';
import { DatasetEntity, DatasetSchema } from '../datasets/schemas/dataset.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { FoldersModule } from '../folders/folders.module';
import { MentionsService } from './mentions.service';
import { MentionsController } from './mentions.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentEntity.name, schema: DocumentSchema },
      { name: DatasetEntity.name, schema: DatasetSchema },
      { name: User.name, schema: UserSchema },
    ]),
    FoldersModule,
  ],
  controllers: [MentionsController],
  providers: [MentionsService],
  exports: [MentionsService],
})
export class MentionsModule {}

