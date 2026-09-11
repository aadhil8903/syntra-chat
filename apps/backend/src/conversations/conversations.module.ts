import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationEntity, ConversationSchema } from './schemas/conversation.schema';
import { ConversationShareEntity, ConversationShareSchema } from './schemas/conversation-share.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ConversationsService } from './conversations.service';
import { ConversationSharesService } from './conversation-shares.service';
import { ConversationsController } from './conversations.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConversationEntity.name, schema: ConversationSchema },
      { name: ConversationShareEntity.name, schema: ConversationShareSchema },
      { name: User.name, schema: UserSchema },
    ]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationSharesService],
  exports: [ConversationsService, ConversationSharesService],
})
export class ConversationsModule {}

