// TenantPrismaService — ADR-008
// Request-scoped service. Wraps every Prisma call in:
//   BEGIN; SET LOCAL app.current_tenant_id = '{tenant_id}'; <query>; COMMIT;
// SET LOCAL reverts on COMMIT/ROLLBACK — safe with PgBouncer transaction mode (QM-18).
// NEVER use singleton scope — tenant context is per-request.

import { Injectable, Scope, Inject, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { withRetry } from '@cos/database';
import { createLogger } from '@cos/logger';

const logger = createLogger('tenant-prisma');

// UUID validation — prevents injection via app.current_tenant_id
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertSafeTenantId(id: string): void {
  if (!UUID_PATTERN.test(id)) {
    throw new UnauthorizedException(`Invalid tenant_id format: ${id}`);
  }
}

@Injectable({ scope: Scope.REQUEST })
export class TenantPrismaService {
  private readonly prisma: PrismaClient;
  private readonly tenantId: string;

  constructor(@Inject(REQUEST) request: Request & { tenantId?: string; dedicatedDbUrl?: string }) {
    const id = request.tenantId;
    if (!id) {
      throw new UnauthorizedException('Tenant context missing from request');
    }
    assertSafeTenantId(id);
    this.tenantId = id;
    this.prisma = new PrismaClient({
      datasources: { db: { url: request.dedicatedDbUrl ?? process.env['DATABASE_URL'] } },
    });
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
    return withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${this.tenantId}'`);
        logger.debug({ tenantId: this.tenantId }, 'TenantPrismaService: tenant_id set');
        return fn(tx);
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
