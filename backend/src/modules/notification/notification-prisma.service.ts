// NotificationPrismaService — per-call PrismaClient for the notifications schema.
// Creates a new PrismaClient per run() call using the tenant's resolved DB URL (app-role, so RLS is
// enforced — getDbUrlForTenant never returns the superuser DATABASE_URL). Supports dedicated DB for
// enterprise tenants via getDbUrlForTenant().
// NOT request-scoped: used by both HTTP path (NotificationRepository) and Kafka consumer path — which
// is why it reads tenant_id from its argument rather than CLS. Each run() sets SET LOCAL
// app.current_tenant_id inside the transaction so the notifications-schema RLS policies apply.

import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { assertSafeTenantId } from '../../shared/prisma/assert-safe-tenant-id';
import { getDbUrlForTenant } from '../tenant/utils/get-db-url';

@Injectable()
export class NotificationPrismaService {
  async run<T>(
    tenantId: string,
    fn: (
      tx: Omit<
        PrismaClient,
        '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
      >,
    ) => Promise<T>,
  ): Promise<T> {
    // Validate before it is interpolated into SET LOCAL below (QM-4 — RLS now depends on this).
    assertSafeTenantId(tenantId);
    const dbUrl = await getDbUrlForTenant(tenantId);
    const prisma = createPrismaClient(dbUrl);
    try {
      return await prisma.$transaction(async (tx) => {
        // SET LOCAL is transaction-scoped (reverts on COMMIT/ROLLBACK) — safe under PgBouncer
        // transaction mode (QM-18). The notifications-schema RLS policies read this GUC.
        await (tx as PrismaClient).$executeRawUnsafe(
          `SET LOCAL app.current_tenant_id = '${tenantId}'`,
        );
        return fn(tx);
      });
    } finally {
      await prisma.$disconnect();
    }
  }
}
