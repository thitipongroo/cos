// TenantPrismaService — ADR-008
// SINGLETON service. Wraps every Prisma call in:
//   BEGIN; SET LOCAL app.current_tenant_id = '{tenant_id}'; <query>; COMMIT;
// SET LOCAL reverts on COMMIT/ROLLBACK — safe with PgBouncer transaction mode (QM-18).
//
// Tenant context is read from CLS (AsyncLocalStorage via nestjs-cls), populated by JwtAuthGuard. This
// replaces the previous Scope.REQUEST + @Inject(REQUEST) design: under @nestjs/platform-fastify the
// injected REQUEST could be a different instance than the one Passport decorated with req.user, so the
// tenant context never reached this provider (every authenticated call failed "Tenant context
// missing"). A singleton reading CLS also removes the request-scope performance/connection-cap cost.

import { Injectable, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { appDatabaseUrl } from '../../../shared/prisma/app-database-url';
import { assertSafeTenantId } from '../../../shared/prisma/assert-safe-tenant-id';
import { withRetry } from '@cos/database';
import { createLogger } from '@cos/logger';
import { clsTenantId, clsDedicatedDbUrl } from '../../../shared/context/cls-context';

const logger = createLogger('tenant-prisma');

@Injectable()
export class TenantPrismaService implements OnModuleDestroy {
  // One PrismaClient per datasource URL (shared tenants reuse the APP_DATABASE_URL client; enterprise
  // dedicated DBs get their own). Cached on the singleton, so keyed by URL rather than per-request.
  private readonly clients = new Map<string, PrismaClient>();

  private resolveContext(): { tenantId: string; dedicatedDbUrl?: string } {
    const tenantId = clsTenantId();
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context missing from request');
    }
    assertSafeTenantId(tenantId);
    return { tenantId, dedicatedDbUrl: clsDedicatedDbUrl() };
  }

  private getClient(dedicatedDbUrl?: string): PrismaClient {
    // Tenant-scoped queries connect as the non-superuser app role (APP_DATABASE_URL) so PostgreSQL RLS
    // is enforced. appDatabaseUrl() throws if it is unset — we must NEVER fall back to the
    // RLS-bypassing DATABASE_URL superuser (spec §7.7, QM-18). Enterprise dedicated DBs pass
    // dedicatedDbUrl (already an app-role URL), so shared resolution is evaluated lazily via `??`.
    const url = dedicatedDbUrl ?? appDatabaseUrl();
    let client = this.clients.get(url);
    if (!client) {
      client = createPrismaClient(url);
      this.clients.set(url, client);
    }
    return client;
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
    await Promise.all([...this.clients.values()].map((c) => c.$disconnect()));
  }
}
