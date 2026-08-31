import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { STORAGE_SERVICE } from './storage.interface';
import { GridFsStorageService } from './gridfs-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: GridFsStorageService,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}

