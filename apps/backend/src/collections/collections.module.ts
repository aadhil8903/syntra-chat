import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { CollectionEntity, CollectionSchema } from './schemas/collection.schema';
import { ConversationEntity, ConversationSchema } from '../conversations/schemas/conversation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CollectionEntity.name, schema: CollectionSchema },
      { name: ConversationEntity.name, schema: ConversationSchema },
    ]),
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
