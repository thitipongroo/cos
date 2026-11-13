// Places a legal hold on a stored file — the files module owns `files.files`, so this is the door
// other modules come through (master §4: "no direct DB access across module boundaries").
//
// WHAT A HOLD MEANS HERE. Migration 20260706000003 states it: "legal hold blocks ALL deletion (soft +
// hard)". The retention sweep skips a held row, so a held file is WORM for as long as the hold
// stands. That is the whole mechanism ADR-090 §5 needs for a pre-anonymisation archive — there was no
// need to invent a second store, only a writer, because those four columns had existed since Phase 9
// with nothing in the codebase setting them.
//
// IT IS DELIBERATE, NEVER AUTOMATIC. `docs/policies/data-retention-policy.md` § Legal hold says an
// engineer PLACES the flag when a dispute or investigation exists. Holding every erasure by default
// would mean the personal data never actually leaves the platform, which is not erasure — so the
// caller has to ask, and has to say why.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { appDatabaseUrl } from '../../shared/prisma/app-database-url';
import { assertSafeTenantId } from '../../shared/prisma/assert-safe-tenant-id';
import { resolveTenantDb } from '../../shared/prisma/get-db-url';
import { enterTenantTx } from '../../shared/prisma/tenant-tx';

@Injectable()
export class FileLegalHoldService implements OnModuleDestroy {
  // Own clients, as AuditInterceptor does: the hold is written as the non-superuser app role so RLS
  // binds the writer rather than being bypassed by an owner connection. One per database URL, since
  // 2026-11-13: an ENTERPRISE tenant's files live in its dedicated database, where the shared-only client
  // this used to hold matched no row and the hold was never placed.
  private readonly clients = new Map<string, PrismaClient>();

  private clientFor(url: string): PrismaClient {
    let c = this.clients.get(url);
    if (!c) {
      c = createPrismaClient(url);
      this.clients.set(url, c);
    }
    return c;
  }

  /** Close the query-engine sockets on shutdown (QM-18 / ADR-034 / Rule 39). */
  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.clients.values()].map((c) => c.$disconnect()));
  }

  /**
   * Mark one file held. Idempotent: re-placing a hold refreshes the reason and the actor rather than
   * failing, because the second caller is asserting the same fact as the first.
   *
   * Returns false when no row matched — a caller must not report "archived under legal hold" on the
   * strength of an UPDATE that changed nothing.
   */
  async place(params: {
    tenantId: string;
    fileId: string;
    reason: string;
    placedBy: string;
  }): Promise<boolean> {
    assertSafeTenantId(params.tenantId);
    const { dedicatedDbUrl } = await resolveTenantDb(params.tenantId);
    return this.clientFor(dedicatedDbUrl ?? appDatabaseUrl()).$transaction(async (tx) => {
      // RLS on files.files is tenant-scoped, and the GUC is transaction-scoped (SET LOCAL is safe
      // under PgBouncer transaction pooling — QM-18), so it must be set inside this transaction. On the
      // shared database this also holds the tenant's pause lock (D51): a hold placed while provisioning
      // copies the tenant would otherwise commit after the copy's snapshot and be lost.
      await enterTenantTx(tx, params.tenantId, !dedicatedDbUrl);
      const changed = await tx.$executeRaw`
        UPDATE files.files
           SET legal_hold = true,
               legal_hold_reason = ${params.reason},
               legal_hold_by = ${params.placedBy}::uuid,
               legal_hold_at = now()
         WHERE file_id = ${params.fileId}::uuid
           AND tenant_id = ${params.tenantId}::uuid
      `;
      return changed > 0;
    });
  }
}
