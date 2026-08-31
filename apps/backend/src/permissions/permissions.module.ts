import { Module, Global } from '@nestjs/common';
import { OwnershipService } from './services/ownership.service';
import { OwnershipGuard } from './guards/ownership.guard';
import { AclResolverService } from './services/acl-resolver.service';

@Global()
@Module({
  providers: [OwnershipService, OwnershipGuard, AclResolverService],
  exports: [OwnershipService, OwnershipGuard, AclResolverService],
})
export class PermissionsModule {}

