// Gathers the five inputs the rule-based scorer needs, for one device belonging to one user (ADR-081).
//
// ADVISORY, ALWAYS. This service reads; it never revokes a device, never expires a trust window and
// never influences a login. §22.3 bars AI from executing state transitions that require a human, and
// locking a field worker out of the app on a score's say-so is exactly that class of action —
// ADR-081 keeps the property even while the scorer is rules rather than a model, because a
// regression here would otherwise become an outage.
//
// THE PLATFORM CONNECTION, NOT THE TENANT ONE. `trusted_devices` and `audit_logs` both live in the
// platform database, and for an ENTERPRISE tenant on a dedicated database those tables exist but are
// EMPTY — `prisma migrate deploy` creates them, and the data migration deliberately excludes the
// platform schema. Reading them through TenantPrismaService would return zero rows and score every
// enterprise device as a brand-new device with no history: a wrong answer that looks like a right
// one. The same trap the PDPA export collector hit (ADR-078).
//
// NOTHING DERIVED HERE IS WRITTEN BACK. ASN numbers are resolved from addresses already in
// `audit_logs`, counted, and discarded (ADR-080). No score is persisted either — see the model card's
// note on why logging scores for training is a separate, PDPA-reviewed decision.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from '../../../../shared/prisma/create-prisma-client';
import { appDatabaseUrl } from '../../../../shared/prisma/app-database-url';
import { assertSafeTenantId } from '../../../../shared/prisma/assert-safe-tenant-id';
import { GeoIpService } from '../../network-origin/geoip.service';
import RULES from './device-trust-rules.v1.json';
import { scoreDevice, type TrustFeatures, type TrustScore } from './trust-score';

const logger = createLogger('trust-score-service');

const MS_PER_DAY = 86_400_000;

/** What the endpoint returns: the score, and the device it describes. */
export interface DeviceTrustReport extends TrustScore {
  deviceId: string;
}

interface DeviceRow {
  created_at: Date;
  last_seen_at: Date;
  attestation_verdict: TrustFeatures['attestationVerdict'];
  integrity_level: TrustFeatures['integrityLevel'];
}

@Injectable()
export class TrustScoreService implements OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient(appDatabaseUrl());

  constructor(private readonly geoip: GeoIpService) {}

  async onModuleDestroy(): Promise<void> {
    // ADR-034: a client opened for the lifetime of the module is closed with it.
    await this.prisma.$disconnect();
  }

  /**
   * Score one of the caller's own devices, or null if they have no such enrolment.
   *
   * Scoped by `user_id` AND `device_id` together, so a caller cannot read a score for someone else's
   * handset by knowing its id — the device id is a stable per-install value the app stores, not a
   * secret, and treating it as one would be the whole access control.
   */
  async report(params: {
    tenantId: string;
    userId: string;
    deviceId: string;
  }): Promise<DeviceTrustReport | null> {
    const { tenantId, userId, deviceId } = params;
    assertSafeTenantId(tenantId);

    const device = await this.loadDevice(userId, deviceId);
    if (!device) return null;

    const now = Date.now();
    const [revocations, asn] = await Promise.all([
      this.loadRevocationHistory(userId, now),
      this.loadAsnStability(tenantId, userId, now),
    ]);

    const features: TrustFeatures = {
      attestationVerdict: device.attestation_verdict,
      integrityLevel: device.integrity_level,
      enrolmentAgeDays: wholeDaysSince(device.created_at, now),
      lastSeenDaysAgo: wholeDaysSince(device.last_seen_at, now),
      ...revocations,
      ...asn,
    };

    return { deviceId, ...scoreDevice(features) };
  }

  private async loadDevice(userId: string, deviceId: string): Promise<DeviceRow | null> {
    const rows = await this.prisma.$queryRaw<DeviceRow[]>`
      SELECT created_at, last_seen_at, attestation_verdict, integrity_level
        FROM platform.trusted_devices
       WHERE user_id = ${userId}::uuid
         AND device_id = ${deviceId}
         AND revoked_at IS NULL`;
    return rows[0] ?? null;
  }

  /**
   * The user's revocation history across ALL their devices, not just this one.
   *
   * A compromise is a fact about an account, not about a handset: the credential that was abused is
   * the same one this device authenticates. Scoping the check to a single device would let the
   * compromised phone be revoked and the replacement score a clean 100 the same afternoon.
   *
   * KNOWN LIMIT, recorded rather than hidden: `registerDevice` clears `revocation_reason` when a
   * revoked device re-enrols, so a COMPROMISED marking survives only while that row stays revoked.
   * That clearing is correct for training labels — the re-enrolled device is not the compromised one
   * — but it means this signal can be cleared by re-enrolment. Documented in the model card under
   * known limitations.
   */
  private async loadRevocationHistory(
    userId: string,
    now: number,
  ): Promise<Pick<TrustFeatures, 'compromiseOnRecord' | 'nonCompromiseRevocationDaysAgo'>> {
    const rows = await this.prisma.$queryRaw<
      { compromised: boolean; latest_non_compromise: Date | null }[]
    >`
      SELECT bool_or(revocation_reason = 'COMPROMISED')                            AS compromised,
             max(revoked_at) FILTER (
               WHERE revocation_reason IN ('LOST_OR_STOLEN', 'ADMIN_REVOKED')
             )                                                                     AS latest_non_compromise
        FROM platform.trusted_devices
       WHERE user_id = ${userId}::uuid
         AND revoked_at IS NOT NULL`;

    const row = rows[0];
    const latest = row?.latest_non_compromise ?? null;
    return {
      compromiseOnRecord: row?.compromised === true,
      nonCompromiseRevocationDaysAgo: latest === null ? null : wholeDaysSince(latest, now),
    };
  }

  /**
   * How many distinct networks this user's recent requests arrived from.
   *
   * Read from `audit_logs.ip_address`, which is already collected and already tagged — the addresses
   * are resolved to AS numbers in memory and thrown away (ADR-080). The GUC is set inside the same
   * transaction as the SELECT because `audit_logs` is RLS-protected and `app_user`'s policy reads
   * `app.current_tenant_id`; a plain query outside a transaction would return nothing under
   * PgBouncer's transaction pooling (QM-18).
   *
   * Grouped and capped at `asnMaxDistinctAddresses` so an account with tens of thousands of audit
   * rows costs a bounded number of lookups. Any failure abstains — a broken query must not be
   * reported as network instability.
   */
  private async loadAsnStability(
    tenantId: string,
    userId: string,
    now: number,
  ): Promise<Pick<TrustFeatures, 'distinctAsnCount' | 'asnObservations'>> {
    const since = new Date(now - RULES.thresholds.asnLookbackDays * MS_PER_DAY);

    let rows: { ip: string; n: number }[];
    try {
      rows = await this.prisma.$transaction(async (tx) => {
        await (tx as PrismaClient).$executeRawUnsafe(
          `SET LOCAL app.current_tenant_id = '${tenantId}'`,
        );
        return tx.$queryRaw<{ ip: string; n: number }[]>`
          SELECT host(ip_address) AS ip, count(*)::int AS n
            FROM platform.audit_logs
           WHERE actor_id = ${userId}::uuid
             AND ip_address IS NOT NULL
             AND occurred_at >= ${since}::timestamptz
           GROUP BY ip_address
           ORDER BY n DESC
           LIMIT ${RULES.thresholds.asnMaxDistinctAddresses}`;
      });
    } catch (err) {
      // Never the addresses — they are the personal data this whole feature is careful about.
      logger.warn({ err: String(err), event: 'trust_score.asn_query_failed' }, 'query failed');
      return { distinctAsnCount: 0, asnObservations: 0 };
    }

    const asns = new Set<number>();
    for (const row of rows) {
      const asn = await this.geoip.asnNumber(row.ip);
      if (asn !== null) asns.add(asn);
    }

    // Observations count REQUESTS, not addresses: three requests from one address is evidence of a
    // stable network, whereas three addresses seen once each says almost nothing. With no GeoLite2
    // database every lookup returns null, the set stays empty, and the band abstains rather than
    // reporting a suspiciously perfect single network.
    return {
      distinctAsnCount: asns.size,
      asnObservations: rows.reduce((sum, r) => sum + r.n, 0),
    };
  }
}

/**
 * Whole days between a past timestamp and now, floored, never negative.
 *
 * Floored because the bands are inclusive lower bounds ("at least 90 days"): a device enrolled 89.9
 * days ago has not been enrolled for 90. Clamped at zero because `last_seen_at` is written by the
 * database's clock and a backend running a few seconds behind it would otherwise produce a negative
 * age and fall through every band.
 */
function wholeDaysSince(then: Date, now: number): number {
  return Math.max(0, Math.floor((now - then.getTime()) / MS_PER_DAY));
}
