// NotificationPrismaService — tenant-scoped PrismaClient access for the notifications schema.
// Resolves the tenant's DB URL (app-role, so RLS is enforced — getDbUrlForTenant never returns the
// superuser DATABASE_URL) and supports dedicated DBs for enterprise tenants via getDbUrlForTenant().
// NOT request-scoped: used by both HTTP path (NotificationRepository) and Kafka consumer path — which
// is why it reads tenant_id from its argument rather than CLS. Each run() sets SET LOCAL
// app.current_tenant_id inside the transaction so the notifications-schema RLS policies apply.
//
// Clients are pooled per datasource URL, NOT built per call. The previous version constructed a
// PrismaClient (and therefore a fresh pg pool + TCP connect + TLS handshake) on every run() and
// disconnected it in a finally — paid 17 times over across NotificationRepository alone, plus once
// per Kafka event. Tenants sharing APP_DATABASE_URL now share one client, exactly as
// TenantPrismaService already does.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { assertSafeTenantId } from '../../shared/prisma/assert-safe-tenant-id';
import { resolveTenantDb } from '../../shared/prisma/get-db-url';
import { appDatabaseUrl } from '../../shared/prisma/app-database-url';
import { enterTenantTx } from '../../shared/prisma/tenant-tx';

@Injectable()
export class NotificationPrismaService implements OnModuleDestroy {
  private readonly clients = new Map<string, PrismaClient>();

  private getClient(dbUrl: string): PrismaClient {
    let client = this.clients.get(dbUrl);
    if (!client) {
      client = createPrismaClient(dbUrl);
      this.clients.set(dbUrl, client);
    }
    return client;
  }

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
    const { dedicatedDbUrl } = await resolveTenantDb(tenantId);
    const prisma = this.getClient(dedicatedDbUrl ?? appDatabaseUrl());
    return prisma.$transaction(async (tx) => {
      // SET LOCAL is transaction-scoped (reverts on COMMIT/ROLLBACK) — safe under PgBouncer
      // transaction mode (QM-18), and required now that the client outlives the call. The
      // notifications-schema RLS policies read this GUC. On the shared database it also holds the
      // tenant's pause lock and refuses an inactive tenant (D51).
      await enterTenantTx(tx as PrismaClient, tenantId, !dedicatedDbUrl);
      return fn(tx);
    });
  }

  /** Close every pooled client on shutdown (app.enableShutdownHooks() in main.ts). */
  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.clients.values()].map((c) => c.$disconnect()));
    this.clients.clear();
  }
}
