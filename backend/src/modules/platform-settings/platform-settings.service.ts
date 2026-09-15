// Platform settings — read and save the platform-wide settings document (ADR-108).
//
// STORED ONLY: nothing in the system reads these values to change behaviour. What this service guarantees
// is the record around them — one versioned document, no lost update between two operators, and an audit
// row with the justification and the before / after for every change, in the same transaction as the
// change (§6.7 "No System Admin action is silent"). A change that cannot be audited is not saved.
//
// Uses the platform PrismaClient on DATABASE_URL, as TenantService does: the table is cross-tenant, and so
// is the tenant count shown beside it.

import { ConflictException, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { assertSafeTenantId } from '../../shared/prisma/assert-safe-tenant-id';
import {
  defaultPlatformSettings,
  PLATFORM_SETTINGS_AUDIT_ACTION,
  PLATFORM_SETTINGS_RESOURCE_TYPE,
  type PlatformSettings,
  type PlatformSettingsActor,
  type PlatformSettingsResponse,
} from './platform-settings.types';

const logger = createLogger('platform-settings-service');

/** The one document's key. The table's CHECK refuses any other. */
export const SETTINGS_KEY = 'global';

/** Raised when the version a save names is not the stored one (QM-10, 409). */
export const VERSION_CONFLICT_CODE = 'COS-PSET-001';

type Tx = Prisma.TransactionClient;

/** The stored row, with its saver resolved. `updated_by` is built in SQL: null, or all three fields. */
interface StoredRow {
  value: PlatformSettings;
  version: number;
  updated_at: Date;
  updated_by: PlatformSettingsActor | null;
}

/** Who is saving, and the home tenant the audit row is filed under. */
export interface SettingsActor {
  userId: string;
  tenantId: string;
}

@Injectable()
export class PlatformSettingsService implements OnModuleDestroy {
  // Platform PrismaClient — NOT TenantPrismaService: the document belongs to no tenant.
  private readonly prisma = createPrismaClient();

  /** Close the Prisma client on shutdown so the query-engine handle does not leak (Rule 39). */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async get(): Promise<PlatformSettingsResponse> {
    const [row, counts] = await Promise.all([
      this.readRow(this.prisma, false),
      this.countTenants(),
    ]);
    return toResponse(row, counts);
  }

  /**
   * Replace the document, if `expectedVersion` is still the stored version.
   *
   * THE ORDER INSIDE THE TRANSACTION IS THE GUARANTEE. The row is read FOR UPDATE, so a concurrent save
   * waits here and then sees the version this one wrote — and is refused. With no row there is nothing to
   * lock, so two first saves can both pass the check; the upsert's `WHERE version = expected` is what
   * refuses the second, because its ON CONFLICT branch finds version 1 where it expected 0. Either way the
   * loser writes nothing, and its audit row is never inserted.
   *
   * The response is read INSIDE the transaction, so it is this save's version even if another save
   * commits a moment later.
   */
  async update(
    expectedVersion: number,
    settings: PlatformSettings,
    justification: string,
    actor: SettingsActor,
  ): Promise<PlatformSettingsResponse> {
    assertSafeTenantId(actor.tenantId);

    const saved = await this.prisma.$transaction(async (tx) => {
      const current = await this.readRow(tx, true);
      const storedVersion = current?.version ?? 0;
      if (storedVersion !== expectedVersion) {
        throw versionConflict(expectedVersion, storedVersion);
      }

      const written = await tx.$executeRaw`
        INSERT INTO platform.platform_settings AS s (settings_key, value, version, updated_by, updated_at)
        VALUES (${SETTINGS_KEY}, ${JSON.stringify(settings)}::jsonb, ${expectedVersion + 1},
                ${actor.userId}::uuid, now())
        ON CONFLICT (settings_key) DO UPDATE
          SET value = EXCLUDED.value,
              version = s.version + 1,
              updated_by = EXCLUDED.updated_by,
              updated_at = now()
          WHERE s.version = ${expectedVersion}
      `;
      if (written === 0) {
        // Lost the first-save race described above; the stored version is whatever the winner wrote.
        throw versionConflict(expectedVersion, null);
      }

      // Filed under the operator's HOME tenant: the document belongs to no tenant, and audit_logs.tenant_id
      // is NOT NULL. RLS on audit_logs checks tenant_id against app.current_tenant_id, so it is set first,
      // UUID-validated above because a GUC cannot be a bound parameter (QM-4).
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${actor.tenantId}'`);
      await tx.$executeRaw`
        INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, resource_id, metadata)
        VALUES (
          ${actor.tenantId}::uuid,
          ${actor.userId}::uuid,
          ${PLATFORM_SETTINGS_AUDIT_ACTION},
          ${PLATFORM_SETTINGS_RESOURCE_TYPE},
          NULL,
          ${JSON.stringify({
            justification,
            before: current?.value ?? defaultPlatformSettings(),
            after: settings,
          })}::jsonb
        )
      `;

      const row = (await this.readRow(tx, false))!;
      logger.info({ actorId: actor.userId, version: row.version }, 'Platform settings saved');
      return row;
    });

    return toResponse(saved, await this.countTenants());
  }

  private async readRow(client: Tx, forUpdate: boolean): Promise<StoredRow | null> {
    // FOR UPDATE OF s: the lock is on the settings row only, never on the joined user.
    const rows = forUpdate
      ? await client.$queryRaw<StoredRow[]>`
          SELECT s.value, s.version, s.updated_at,
                 CASE WHEN u.user_id IS NULL THEN NULL
                      ELSE json_build_object('user_id', u.user_id, 'email', u.email, 'name', u.display_name)
                 END AS updated_by
            FROM platform.platform_settings s
            LEFT JOIN platform.users u ON u.user_id = s.updated_by
           WHERE s.settings_key = ${SETTINGS_KEY}
             FOR UPDATE OF s
        `
      : await client.$queryRaw<StoredRow[]>`
          SELECT s.value, s.version, s.updated_at,
                 CASE WHEN u.user_id IS NULL THEN NULL
                      ELSE json_build_object('user_id', u.user_id, 'email', u.email, 'name', u.display_name)
                 END AS updated_by
            FROM platform.platform_settings s
            LEFT JOIN platform.users u ON u.user_id = s.updated_by
           WHERE s.settings_key = ${SETTINGS_KEY}
        `;
    return rows[0] ?? null;
  }

  /** Active tenants on the shared database and on a dedicated one. The URL itself is never selected. */
  private async countTenants(): Promise<PlatformSettingsResponse['counts']> {
    // count(*) with no GROUP BY always returns exactly one row.
    const [row] = await this.prisma.$queryRaw<Array<{ shared: number; dedicated: number }>>`
      SELECT count(*) FILTER (WHERE dedicated_db_url IS NULL)::int     AS shared,
             count(*) FILTER (WHERE dedicated_db_url IS NOT NULL)::int AS dedicated
        FROM platform.tenants
       WHERE is_active = true
    `;
    return { shared_tenants: row!.shared, dedicated_tenants: row!.dedicated };
  }
}

function versionConflict(expected: number, stored: number | null): ConflictException {
  return new ConflictException({
    error: {
      code: VERSION_CONFLICT_CODE,
      message:
        'Platform settings were changed by someone else. Reload and apply your change again.',
      messageKey: 'admin.settings.error.versionConflict',
      details: { expected_version: expected, stored_version: stored },
    },
  });
}

function toResponse(
  row: StoredRow | null,
  counts: PlatformSettingsResponse['counts'],
): PlatformSettingsResponse {
  if (!row) {
    return {
      version: 0,
      updated_at: null,
      updated_by: null,
      settings: defaultPlatformSettings(),
      counts,
    };
  }
  return {
    version: row.version,
    updated_at: row.updated_at.toISOString(),
    updated_by: row.updated_by,
    settings: row.value,
    counts,
  };
}
