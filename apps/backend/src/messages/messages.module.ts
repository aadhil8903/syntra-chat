import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MessageEntity, MessageSchema } from './schemas/message.schema';
import { ConversationEntity, ConversationSchema } from '../conversations/schemas/conversation.schema';
import { DocumentEntity, DocumentSchema } from '../documents/schemas/document.schema';
import { DatasetEntity, DatasetSchema } from '../datasets/schemas/dataset.schema';
import { MentionsModule } from '../mentions/mentions.module';
import { CollectionsModule } from '../collections/collections.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { DocumentsModule } from '../documents/documents.module';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MessageEntity.name, schema: MessageSchema },
      { name: ConversationEntity.name, schema: ConversationSchema },
      { name: DocumentEntity.name, schema: DocumentSchema },
      { name: DatasetEntity.name, schema: DatasetSchema },
    ]),
    MentionsModule,
    CollectionsModule,
    AiGatewayModule,
    DocumentsModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}

