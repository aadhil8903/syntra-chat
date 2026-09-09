import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI', 'mongodb://localhost:27017/enter_chat'),
        autoIndex: true,
        maxPoolSize: configService.get<number>('MONGODB_MAX_POOL_SIZE', 50),
        minPoolSize: configService.get<number>('MONGODB_MIN_POOL_SIZE', 5),
        serverSelectionTimeoutMS: configService.get<number>('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 5000),
        socketTimeoutMS: configService.get<number>('MONGODB_SOCKET_TIMEOUT_MS', 45000),
        connectTimeoutMS: configService.get<number>('MONGODB_CONNECT_TIMEOUT_MS', 10000),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}

