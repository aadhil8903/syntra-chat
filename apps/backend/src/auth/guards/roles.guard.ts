import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole, isUserAdmin } from '@enter-chat/shared-types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      return false;
    }

    if (requiredRoles.includes(UserRole.ADMIN) && isUserAdmin(user)) {
      return true;
    }

    const userRoleStr = (user.role || '').toString().toLowerCase().trim();
    const userRolesList: string[] = Array.isArray(user.roles)
      ? user.roles.map((r: any) => (r || '').toString().toLowerCase().trim())
      : [];

    return requiredRoles.some((role) => {
      const targetRoleStr = role.toString().toLowerCase().trim();
      return userRoleStr === targetRoleStr || userRolesList.includes(targetRoleStr);
    });
  }
}

