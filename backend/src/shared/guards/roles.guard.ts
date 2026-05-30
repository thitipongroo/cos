// RolesGuard — enforces @Roles(...) decorator on endpoints.
// Checks JWT claim cos_role against the required roles.
// Must run AFTER JwtAuthGuard (which populates req.user).

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { createLogger } from '@cos/logger';
import { JwtPayload } from '../../modules/identity/jwt.payload';

const logger = createLogger('roles-guard');

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<CosRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles required — allow
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (!user?.cos_role) {
      logger.warn('RolesGuard: no role in JWT');
      throw new ForbiddenException('Missing role claim in JWT');
    }

    const hasRole = requiredRoles.includes(user.cos_role as CosRole);
    if (!hasRole) {
      logger.warn(
        { userId: user.cos_user_id, requiredRoles, actualRole: user.cos_role },
        'Access denied — insufficient role',
      );
      throw new ForbiddenException(
        `Role '${user.cos_role}' does not have access. Required: ${requiredRoles.join(' | ')}`,
      );
    }

    return true;
  }
}
