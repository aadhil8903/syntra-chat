import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationEntity, ConversationSchema } from './schemas/conversation.schema';
import { ConversationShareEntity, ConversationShareSchema } from './schemas/conversation-share.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MessageEntity, MessageSchema } from '../messages/schemas/message.schema';
import { ConversationsService } from './conversations.service';
import { ConversationSharesService } from './conversation-shares.service';
import { ConversationsController } from './conversations.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConversationEntity.name, schema: ConversationSchema },
      { name: ConversationShareEntity.name, schema: ConversationShareSchema },
      { name: MessageEntity.name, schema: MessageSchema },
      { name: User.name, schema: UserSchema },
    ]),
    UsersModule,
    NotificationsModule,
    DocumentsModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationSharesService],
  exports: [ConversationsService, ConversationSharesService],
})
export class ConversationsModule {}

