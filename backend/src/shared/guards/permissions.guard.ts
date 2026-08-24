// PermissionsGuard — enforces @RequirePermissions(...) using the ROLE_PERMISSIONS matrix (spec §6.4).
// Fine-grained authorization on top of @Roles: the role must GRANT every required `resource:action`.
// No-ops on endpoints without @RequirePermissions metadata, so it is safe to add to a controller's
// guard chain. Must run AFTER JwtAuthGuard (which populates req.user) — like RolesGuard.

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  OnModuleDestroy,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ROLE_PERMISSIONS } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { createLogger } from '@cos/logger';
import { JwtPayload } from '../../modules/identity/jwt.payload';
import { createPrismaClient } from '../prisma/create-prisma-client';

const logger = createLogger('permissions-guard');

/** True when the granted set covers `required` — supports `*:*` (all) and `resource:*` (whole resource). */
export function permissionGranted(granted: readonly string[], required: string): boolean {
  if (granted.includes('*:*') || granted.includes(required)) return true;
  const resource = required.split(':')[0];
  return granted.includes(`${resource}:*`);
}

@Injectable()
export class PermissionsGuard implements CanActivate, OnModuleDestroy {
  // Shared client for the additional-roles union lookup (only hit when the primary role alone is
  // insufficient). @RequirePermissions endpoints are rare, so this is a cold path.
  private readonly prisma = createPrismaClient();
  constructor(private readonly reflector: Reflector) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    // Fast path — the primary (JWT) role already grants every required permission.
    const primaryGranted = ROLE_PERMISSIONS[user.role as CosRole] ?? [];
    if (required.every((p) => permissionGranted(primaryGranted, p))) {
      return true;
    }

    // Multi-role union — effective permissions = union of ROLE_PERMISSIONS across the primary role and
    // any additional roles the user holds (NIST RBAC / Keycloak union model).
    const extra = await this.prisma.$queryRaw<Array<{ role: string }>>`
      SELECT role FROM platform.user_additional_roles
      WHERE user_id = ${user.user_id}::uuid AND tenant_id = ${user.tenant_id}::uuid
    `;
    const granted = [
      ...primaryGranted,
      ...extra.flatMap((r) => ROLE_PERMISSIONS[r.role as CosRole] ?? []),
    ];
    const missing = required.filter((p) => !permissionGranted(granted, p));
    if (missing.length > 0) {
      logger.warn(
        {
          userId: user.user_id,
          role: user.role,
          additionalRoles: extra.map((r) => r.role),
          missing,
        },
        'Access denied — missing permission',
      );
      throw new ForbiddenException(`Missing required permission(s): ${missing.join(', ')}`);
    }

    return true;
  }
}
