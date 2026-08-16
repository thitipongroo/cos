// Places a legal hold on a stored file — the files module owns `files.files`, so this is the door
// other modules come through (master §4: "no direct DB access across module boundaries").
//
// WHAT A HOLD MEANS HERE. Migration 20260706000003 states it: "legal hold blocks ALL deletion (soft +
// hard)". The retention sweep skips a held row, so a held file is WORM for as long as the hold
// stands. That is the whole mechanism ADR-090 §5 needs for a pre-anonymisation archive — there was no
// need to invent a second store, only a writer, because those four columns had existed since Phase 9
// with nothing in the codebase setting them.
//
// IT IS DELIBERATE, NEVER AUTOMATIC. `docs/compliance/data-retention-policy.md` § Legal hold says an
// engineer PLACES the flag when a dispute or investigation exists. Holding every erasure by default
// would mean the personal data never actually leaves the platform, which is not erasure — so the
// caller has to ask, and has to say why.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { appDatabaseUrl } from '../../shared/prisma/app-database-url';
import { assertSafeTenantId } from '../../shared/prisma/assert-safe-tenant-id';

@Injectable()
export class FileLegalHoldService implements OnModuleDestroy {
  // Own client, as AuditInterceptor does: the hold is written as the non-superuser app role so RLS
  // binds the writer rather than being bypassed by an owner connection.
  private readonly prisma = createPrismaClient(appDatabaseUrl());

  /** Close the query-engine socket on shutdown (QM-18 / ADR-034 / Rule 39). */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
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
    return this.prisma.$transaction(async (tx) => {
      // RLS on files.files is tenant-scoped, and the GUC is transaction-scoped (SET LOCAL is safe
      // under PgBouncer transaction pooling — QM-18), so it must be set inside this transaction.
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${params.tenantId}'`);
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
