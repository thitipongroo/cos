// PermissionsGuard — enforces @RequirePermissions(...) using the ROLE_PERMISSIONS matrix (spec §6.4).
// Fine-grained authorization on top of @Roles: the role must GRANT every required `resource:action`.
// No-ops on endpoints without @RequirePermissions metadata, so it is safe to add to a controller's
// guard chain. Must run AFTER JwtAuthGuard (which populates req.user) — like RolesGuard.

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ROLE_PERMISSIONS } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { createLogger } from '@cos/logger';
import { JwtPayload } from '../../modules/identity/jwt.payload';

const logger = createLogger('permissions-guard');

/** True when the granted set covers `required` — supports `*:*` (all) and `resource:*` (whole resource). */
export function permissionGranted(granted: readonly string[], required: string): boolean {
  if (granted.includes('*:*') || granted.includes(required)) return true;
  const resource = required.split(':')[0];
  return granted.includes(`${resource}:*`);
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true; // No permissions required — allow (guard is a no-op here).
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user?.role) {
      throw new ForbiddenException('Missing role claim in JWT');
    }

    const granted = ROLE_PERMISSIONS[user.role as CosRole] ?? [];
    const missing = required.filter((p) => !permissionGranted(granted, p));
    if (missing.length > 0) {
      logger.warn(
        { userId: user.user_id, role: user.role, missing },
        'Access denied — missing permission',
      );
      throw new ForbiddenException(`Missing required permission(s): ${missing.join(', ')}`);
    }

    return true;
  }
}
