import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { PermissionsModule } from './permissions/permissions.module';
import { StorageModule } from './storage/storage.module';
import { AiGatewayModule } from './ai-gateway/ai-gateway.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { DatasetsModule } from './datasets/datasets.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { MentionsModule } from './mentions/mentions.module';
import { AccessRequestsModule } from './access-requests/access-requests.module';
import { RolesModule } from './roles/roles.module';
import { FoldersModule } from './folders/folders.module';
import { MailModule } from './mail/mail.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { CollectionsModule } from './collections/collections.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', 'apps/backend/.env'],
    }),
    DatabaseModule,
    SystemSettingsModule,
    MailModule,
    CommonModule,
    PermissionsModule,
    StorageModule,
    AiGatewayModule,
    UsersModule,
    AuthModule,
    DocumentsModule,
    DatasetsModule,
    ConversationsModule,
    CollectionsModule,
    MessagesModule,
    MentionsModule,
    AccessRequestsModule,
    RolesModule,
    FoldersModule,
  ],
})
export class AppModule {}

