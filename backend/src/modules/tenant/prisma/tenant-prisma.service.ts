// TenantPrismaService — ADR-008
// Request-scoped service. Wraps every Prisma call in:
//   BEGIN; SET LOCAL app.current_tenant_id = '{tenant_id}'; <query>; COMMIT;
// SET LOCAL reverts on COMMIT/ROLLBACK — safe with PgBouncer transaction mode (QM-18).
// NEVER use singleton scope — tenant context is per-request.
//
// Tenant context is read LAZILY in run(), NOT in the constructor: NestJS instantiates
// request-scoped providers BEFORE guards run, so at construction time req.user (set by
// JwtAuthGuard → KeycloakJwtStrategy) is not yet populated. By run() time the handler is
// executing — auth has completed and req.user is present.

import { Injectable, Scope, Inject, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../identity/strategies/keycloak-jwt.strategy';
import { withRetry } from '@cos/database';
import { createLogger } from '@cos/logger';

const logger = createLogger('tenant-prisma');

// Minimal request shape — only the authenticated user is needed (avoids an express dependency).
interface RequestWithUser {
  user?: AuthenticatedUser;
}

// UUID validation — prevents injection via app.current_tenant_id
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertSafeTenantId(id: string): void {
  if (!UUID_PATTERN.test(id)) {
    throw new UnauthorizedException(`Invalid tenant_id format: ${id}`);
  }
}

@Injectable({ scope: Scope.REQUEST })
export class TenantPrismaService {
  // Lazily created per dedicated-DB URL (shared tenants reuse the default DATABASE_URL client).
  private prisma?: PrismaClient;

  constructor(@Inject(REQUEST) private readonly request: RequestWithUser) {}

  // Resolve tenant context from the authenticated user (available at handler time).
  private resolveContext(): { tenantId: string; dedicatedDbUrl?: string } {
    const user = this.request.user;
    const id = user?.tenant_id;
    if (!id) {
      throw new UnauthorizedException('Tenant context missing from request');
    }
    assertSafeTenantId(id);
    return { tenantId: id, dedicatedDbUrl: user?.dedicatedDbUrl };
  }

  private getClient(dedicatedDbUrl?: string): PrismaClient {
    if (!this.prisma) {
      // Tenant-scoped queries connect as the non-superuser app role (APP_DATABASE_URL) so
      // PostgreSQL RLS is actually enforced. Platform/cross-tenant services keep their own
      // privileged connection (DATABASE_URL). Falls back to DATABASE_URL if APP_DATABASE_URL
      // is unset. Enterprise dedicated DBs pass dedicatedDbUrl (already an app-role URL).
      const sharedUrl = process.env['APP_DATABASE_URL'] ?? process.env['DATABASE_URL'];
      this.prisma = new PrismaClient({
        datasources: { db: { url: dedicatedDbUrl ?? sharedUrl } },
      });
    }
    return this.prisma;
  }

  /**
   * Execute fn inside a transaction with SET LOCAL app.current_tenant_id = '{tenant_id}'.
   * All tenant-scoped DB calls MUST go through this method.
   */
  async run<T>(
    fn: (
      tx: Omit<
        PrismaClient,
        '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
      >,
    ) => Promise<T>,
  ): Promise<T> {
    const { tenantId, dedicatedDbUrl } = this.resolveContext();
    const prisma = this.getClient(dedicatedDbUrl);
    return withRetry(() =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
        logger.debug({ tenantId }, 'TenantPrismaService: tenant_id set');
        return fn(tx);
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma?.$disconnect();
  }
}
