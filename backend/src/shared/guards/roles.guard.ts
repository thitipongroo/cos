// RolesGuard — enforces @Roles(...) decorator on endpoints.
// Checks the JWT `role` (primary) against the required roles (spec §5.4.1); when the primary role does
// not satisfy the requirement, falls back to the user's ADDITIONAL roles (multi-role support — NIST
// RBAC / Keycloak union model: a person doing several jobs holds several roles, effective = union).
// Must run AFTER JwtAuthGuard (which populates req.user).

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  OnModuleDestroy,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { createLogger } from '@cos/logger';
import { JwtPayload } from '../context/jwt-payload';
import { createPrismaClient } from '../prisma/create-prisma-client';

const logger = createLogger('roles-guard');

@Injectable()
export class RolesGuard implements CanActivate, OnModuleDestroy {
  // One shared client for the additional-roles fallback. The fast path (primary role satisfies the
  // requirement) never touches the DB, so most requests do no extra query.
  private readonly prisma = createPrismaClient();
  constructor(private readonly reflector: Reflector) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<CosRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles required — allow
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (!user?.role) {
      logger.warn('RolesGuard: no role in JWT');
      throw new ForbiddenException('Missing role claim in JWT');
    }

    // Fast path — the JWT's primary role already satisfies the requirement.
    if (requiredRoles.includes(user.role as CosRole)) {
      return true;
    }

    // Multi-role fallback — allow if ANY of the user's additional roles satisfies the requirement.
    const extra = await this.additionalRoles(user);
    if (extra.some((r) => requiredRoles.includes(r as CosRole))) {
      return true;
    }

    logger.warn(
      {
        userId: user.user_id,
        requiredRoles,
        actualRole: user.role,
        additionalRoles: extra,
      },
      'Access denied — insufficient role',
    );
    throw new ForbiddenException(
      `Role '${user.role}' does not have access. Required: ${requiredRoles.join(' | ')}`,
    );
  }

  /**
   * Does `user` hold ANY of `requiredRoles`, counting the primary JWT role plus additional roles?
   *
   * Exposed because not every endpoint can express its requirement as a static `@Roles(...)`
   * decorator: `/sync/push` and `/sync/delta` carry the entity type in the body/query, so the
   * required roles are only known at request time (SyncAuthGuard). Sharing this method is what keeps
   * the union semantics identical on both paths — a second implementation that forgot the
   * additional-roles lookup would silently deny multi-role users on sync but allow them on REST.
   */
  async hasAnyRole(
    user: Pick<JwtPayload, 'role' | 'user_id' | 'tenant_id'>,
    requiredRoles: readonly CosRole[],
  ): Promise<boolean> {
    if (!user.role) return false;
    if (requiredRoles.includes(user.role as CosRole)) return true;
    const extra = await this.additionalRoles(user);
    return extra.some((r) => requiredRoles.includes(r as CosRole));
  }

  /** The user's ADDITIONAL role codes (platform.user_additional_roles) — empty when they hold none. */
  private async additionalRoles(
    user: Pick<JwtPayload, 'user_id' | 'tenant_id'>,
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ role: string }>>`
      SELECT role FROM platform.user_additional_roles
      WHERE user_id = ${user.user_id}::uuid AND tenant_id = ${user.tenant_id}::uuid
    `;
    return rows.map((r) => r.role);
  }
}
