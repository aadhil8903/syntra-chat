import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OwnershipService, ResourceCollection } from '../services/ownership.service';
import { isUserAdmin } from '@enter-chat/shared-types';

export interface OwnershipMetadata {
  collection: ResourceCollection;
  paramName?: string;
}

export const CHECK_OWNERSHIP_KEY = 'checkOwnership';
export const CheckOwnership = (collection: ResourceCollection, paramName = 'id') =>
  SetMetadata(CHECK_OWNERSHIP_KEY, { collection, paramName });

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly ownershipService: OwnershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<OwnershipMetadata>(CHECK_OWNERSHIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!meta) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.id) {
      return false;
    }

    // Administrators possess unrestricted bypass access to all resources
    if (isUserAdmin(user)) {
      return true;
    }

    const paramName = meta.paramName || 'id';
    const resourceId = request.params[paramName] || request.body[paramName];

    if (!resourceId) {
      return true;
    }

    await this.ownershipService.verifyOwnership(meta.collection, resourceId, user.id, user.role);
    return true;
  }
}

