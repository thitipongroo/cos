// PDPA §19 consent (ADR-079) — the record of which processing purposes a person has agreed to.
//
// Closes PDPA-20/21/22, which docs/registers/pdpa-controls.md records as OPEN because no consent
// table existed and the "Keycloak consent claim" that data-residency-policy.md §3 assumes is absent
// (the realm sets "consentRequired": false on every client, and Path A never traverses a Keycloak
// consent screen).
//
// TWO LAWFUL BASES, NOT ONE (ADR-079). `identity` and `contact` are CONTRACT-based (PDPA §24(3)) —
// an account cannot exist without a name and a phone number or email — so they have no consent row
// and no withdraw path; the route out is erasure (PDPA-13). `location`, `financial` and `operational`
// are CONSENT-based and withdrawable. basisFor() is the single place that mapping lives, so a caller
// can never accidentally treat a contract-based category as withdrawable.
//
// WITHDRAWAL IS FORWARD-ONLY. It stops future collection; it does not delete what was lawfully
// collected while consent was live. That is erasure — a different right, a different control. Audit
// logs are never suppressed by withdrawal: they are the §37(1) security measure.
//
// APPEND-ONLY. record() only ever INSERTs; the effective state is the latest row per (user, purpose).
// This is enforced by privilege, not by this class — app_user holds SELECT + INSERT on
// platform.consents and nothing else (migration 20260804000002), the same mechanism that makes
// audit_logs immutable. There is deliberately no update or delete method here.
//
// Connects as app_user (appDatabaseUrl) so RLS actually binds, and sets app.current_tenant_id inside
// the same transaction as every statement — transaction-scoped SET LOCAL, safe under PgBouncer
// transaction pooling (QM-18).

import { Injectable, OnModuleDestroy, UnprocessableEntityException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { appDatabaseUrl } from '../../../shared/prisma/app-database-url';
import { assertSafeTenantId } from '../../../shared/prisma/assert-safe-tenant-id';

const logger = createLogger('consent-service');

/** The @pdpa categories tagged by migration 20260803000001. Both bases, unlike ConsentPurpose. */
export const PDPA_CATEGORIES = [
  'identity',
  'contact',
  'location',
  'financial',
  'operational',
] as const;
export type PdpaCategory = (typeof PDPA_CATEGORIES)[number];

/** Purposes that carry the CONSENT basis — the ConsentPurpose enum, lower-cased. */
export const CONSENT_PURPOSES = ['location', 'financial', 'operational'] as const;
export type ConsentPurposeName = (typeof CONSENT_PURPOSES)[number];

export type LawfulBasis = 'CONSENT' | 'CONTRACT';

export interface ConsentState {
  category: PdpaCategory;
  basis: LawfulBasis;
  /** Whether processing is currently permitted. CONTRACT categories are always true. */
  granted: boolean;
  /** Only CONSENT categories can be withdrawn; the UI must not render a toggle otherwise. */
  withdrawable: boolean;
  /** Notice version of the latest decision — null when no decision has been recorded yet. */
  noticeVersion: string | null;
  recordedAt: Date | null;
}

/**
 * Lawful basis per @pdpa category (ADR-079). Pure — no I/O, no state.
 *
 * CONTRACT for identity/contact is not a convenience: offering a withdraw toggle on the data a login
 * *is* would silently break sign-in, which is a worse outcome for the data subject than stating the
 * basis honestly.
 */
export function basisFor(category: PdpaCategory): LawfulBasis {
  return (CONSENT_PURPOSES as readonly string[]).includes(category) ? 'CONSENT' : 'CONTRACT';
}

/** Type guard so a string from the wire can be narrowed before it reaches the enum column. */
export function isConsentPurpose(value: string): value is ConsentPurposeName {
  return (CONSENT_PURPOSES as readonly string[]).includes(value);
}

@Injectable()
export class ConsentService implements OnModuleDestroy {
  // app_user, not the bootstrap superuser: `cos` bypasses RLS even under FORCE ROW LEVEL SECURITY.
  private readonly prisma: PrismaClient = createPrismaClient(appDatabaseUrl());

  /** ADR-034 / Rule 39 — close the query-engine socket on shutdown. */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Effective consent for every @pdpa category.
   *
   * Returns all five categories, not only the consent-based three, because the transparency screen
   * has to be able to say "we process this, and here is why" for data the subject cannot withdraw —
   * a screen that silently omits contract-based categories reads as if they were not processed.
   */
  async getState(tenantId: string, userId: string): Promise<ConsentState[]> {
    const latest = await this.latestDecisions(tenantId, userId);
    return PDPA_CATEGORIES.map((category) => {
      const basis = basisFor(category);
      if (basis === 'CONTRACT') {
        return {
          category,
          basis,
          granted: true,
          withdrawable: false,
          noticeVersion: null,
          recordedAt: null,
        };
      }
      const row = latest.get(category as ConsentPurposeName);
      return {
        category,
        basis,
        // No decision recorded yet is NOT consent. PDPA §19 requires an affirmative act.
        granted: row?.granted ?? false,
        withdrawable: true,
        noticeVersion: row?.noticeVersion ?? null,
        recordedAt: row?.recordedAt ?? null,
      };
    });
  }

  /**
   * Record a grant or a withdrawal. Both are INSERTs — the prior row is never mutated, so the
   * history PDPA-22 requires survives.
   *
   * The HTTP layer writes the audit entry: AuditInterceptor already logs every POST/PATCH/DELETE with
   * actor, tenant and path (QM-4), so duplicating it here would double-count the same decision.
   */
  async record(params: {
    tenantId: string;
    userId: string;
    purpose: ConsentPurposeName;
    granted: boolean;
    noticeVersion: string;
  }): Promise<void> {
    const { tenantId, userId, purpose, granted, noticeVersion } = params;
    assertSafeTenantId(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await (tx as PrismaClient).$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId}'`,
      );
      await tx.$executeRaw`
        INSERT INTO platform.consents (tenant_id, user_id, purpose, granted, notice_version)
        VALUES (
          ${tenantId}::uuid,
          ${userId}::uuid,
          ${purpose.toUpperCase()}::platform."ConsentPurpose",
          ${granted},
          ${noticeVersion}
        )
      `;
    });
    // purpose + outcome only — never the notice text, never anything about the subject (QM-8).
    logger.info({ userId, purpose, granted }, 'consent decision recorded');
  }

  /**
   * Gate a write on a consent-based purpose. Throws when consent is absent or withdrawn.
   *
   * Throwing, never a silent no-op: a dropped coordinate that looks like a successful save is
   * indistinguishable from a sync bug in the field, and the data is gone by the time anyone notices.
   * 422 per QM-10 — the request is well-formed, the business rule (lawful basis) is what fails.
   */
  async requireConsent(
    tenantId: string,
    userId: string,
    purpose: ConsentPurposeName,
  ): Promise<void> {
    if (await this.hasConsent(tenantId, userId, purpose)) return;
    throw new UnprocessableEntityException({
      error: {
        code: 'COS-PDPA-001',
        message: `Processing for purpose "${purpose}" requires consent that has not been given, or has been withdrawn.`,
        messageKey: 'pdpa.consent.required',
        details: { purpose },
      },
    });
  }

  /** Whether the latest decision for this purpose is a grant. Absent decision = not consented. */
  async hasConsent(
    tenantId: string,
    userId: string,
    purpose: ConsentPurposeName,
  ): Promise<boolean> {
    const latest = await this.latestDecisions(tenantId, userId);
    return latest.get(purpose)?.granted ?? false;
  }

  /**
   * Latest row per purpose for this user. One round trip; DISTINCT ON rides the
   * (user_id, purpose, recorded_at DESC) index so the planner stops at the first row per key instead
   * of sorting the whole consent history.
   */
  private async latestDecisions(
    tenantId: string,
    userId: string,
  ): Promise<
    Map<ConsentPurposeName, { granted: boolean; noticeVersion: string; recordedAt: Date }>
  > {
    assertSafeTenantId(tenantId);
    const rows = await this.prisma.$transaction(async (tx) => {
      await (tx as PrismaClient).$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId}'`,
      );
      return tx.$queryRaw<
        { purpose: string; granted: boolean; notice_version: string; recorded_at: Date }[]
      >`
        SELECT DISTINCT ON (purpose)
               purpose::text AS purpose, granted, notice_version, recorded_at
          FROM platform.consents
         WHERE user_id = ${userId}::uuid
         ORDER BY purpose, recorded_at DESC
      `;
    });
    const map = new Map<
      ConsentPurposeName,
      { granted: boolean; noticeVersion: string; recordedAt: Date }
    >();
    for (const row of rows) {
      const name = row.purpose.toLowerCase();
      /* istanbul ignore else — the enum column cannot hold anything else */
      if (isConsentPurpose(name)) {
        map.set(name, {
          granted: row.granted,
          noticeVersion: row.notice_version,
          recordedAt: row.recorded_at,
        });
      }
    }
    return map;
  }
}
