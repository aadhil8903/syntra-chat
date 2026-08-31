import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessRequestsService } from './access-requests.service';
import { AccessRequestsController } from './access-requests.controller';
import { AccessRequestEntity, AccessRequestSchema } from './schemas/access-request.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AccessRequestEntity.name, schema: AccessRequestSchema }]),
    UsersModule,
  ],
  providers: [AccessRequestsService],
  controllers: [AccessRequestsController],
  exports: [AccessRequestsService]
})
export class AccessRequestsModule {}

