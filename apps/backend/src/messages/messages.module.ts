import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MessageEntity, MessageSchema } from './schemas/message.schema';
import { ConversationEntity, ConversationSchema } from '../conversations/schemas/conversation.schema';
import { DocumentEntity, DocumentSchema } from '../documents/schemas/document.schema';
import { DatasetEntity, DatasetSchema } from '../datasets/schemas/dataset.schema';
import { MessageShareEntity, MessageShareSchema } from './schemas/message-share.schema';
import { ConversationShareEntity, ConversationShareSchema } from '../conversations/schemas/conversation-share.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MentionsModule } from '../mentions/mentions.module';
import { CollectionsModule } from '../collections/collections.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagesEventsService } from './messages-events.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MessageEntity.name, schema: MessageSchema },
      { name: MessageShareEntity.name, schema: MessageShareSchema },
      { name: ConversationEntity.name, schema: ConversationSchema },
      { name: ConversationShareEntity.name, schema: ConversationShareSchema },
      { name: DocumentEntity.name, schema: DocumentSchema },
      { name: DatasetEntity.name, schema: DatasetSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MentionsModule,
    CollectionsModule,
    AiGatewayModule,
    DocumentsModule,
    NotificationsModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesEventsService],
  exports: [MessagesService, MessagesEventsService],
})
export class MessagesModule {}

