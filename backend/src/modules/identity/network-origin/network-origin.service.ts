// The Network Origin panel (ADR-080) — assembled at read time, for the subject's own record only.
//
// Answers mockup `03_01_ip_address_details`. Every value here is either already stored and merely
// disclosed, or derived on the spot and discarded. NOTHING this service produces is written back:
// city, region, ASN and the behavioural label are computed when the subject opens the screen and
// then thrown away, which is why the panel adds no retention row, no data-flow-map entry and no new
// erasure target.
//
// WHAT IS NOT HERE, deliberately: latency and connection type. ADR-080 measures both on the DEVICE
// — the client's own round-trip timing and `@react-native-community/netinfo` — because geo-IP
// estimates of them are guesses about the network while the handset knows both for certain. Deriving
// them here would be less accurate AND more data.

import { Injectable } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import { ConsentService } from '../consent/consent.service';
import { GeoIpService, type NetworkOrigin } from './geoip.service';
import {
  classify,
  STATIONARY_MIN_POINTS,
  STATIONARY_RADIUS_METRES,
  STATIONARY_WINDOW_DAYS,
  type GeoPoint,
  type StationaryVerdict,
} from './stationary';

const logger = createLogger('network-origin-service');

export interface NetworkOriginPanel {
  /** City / region / ASN, or null when no GeoLite2 database is configured or the IP is unknown. */
  origin: NetworkOrigin | null;
  /**
   * The behavioural label, or null when the subject has not consented to `operational` processing.
   *
   * Null means "Not enabled" on screen — a statement that the platform is not doing this, which is
   * different from `INSUFFICIENT_DATA` ("we would, but you have too few check-ins"). Collapsing the
   * two would tell a worker who declined profiling that the platform merely lacked data.
   */
  behavioral: StationaryVerdict | null;
  /** The rule, echoed so the screen can state how the label was derived rather than asserting it. */
  rule: { windowDays: number; radiusMetres: number; minPoints: number };
}

@Injectable()
export class NetworkOriginService {
  constructor(
    private readonly geoip: GeoIpService,
    private readonly consent: ConsentService,
    private readonly prisma: TenantPrismaService,
  ) {}

  /**
   * Build the panel for one subject.
   *
   * `ipAddress` is the caller's own ingress address, taken from the request — not a parameter a
   * client can choose. Looking up an arbitrary address on request would turn a transparency screen
   * into a geo-IP service for whoever holds a session.
   */
  async describe(params: {
    tenantId: string;
    userId: string;
    ipAddress: string;
  }): Promise<NetworkOriginPanel> {
    const { tenantId, userId, ipAddress } = params;

    const rule = {
      windowDays: STATIONARY_WINDOW_DAYS,
      radiusMetres: STATIONARY_RADIUS_METRES,
      minPoints: STATIONARY_MIN_POINTS,
    };

    // The geo derivation is NOT consent-gated. `audit_logs.ip_address` is already collected and
    // already tagged; showing its subject what it resolves to is PDPA §30 access — the exercise of a
    // right — not a new processing purpose. What IS gated is the behavioural label below.
    const origin = await this.geoip.lookup(ipAddress);

    // Deriving a behavioural label from someone's movements is profiling, so it runs only on the
    // `operational` purpose (ADR-080 / ADR-079). Checked BEFORE the coordinates are read: querying
    // a worker's location history to then discard it would be the processing the check exists to
    // prevent, merely followed by an apology.
    if (!(await this.consent.hasConsent(tenantId, userId, 'operational'))) {
      return { origin, behavioral: null, rule };
    }

    return { origin, behavioral: await this.classifyWorker(userId), rule };
  }

  /**
   * Apply the stationary rule to this user's recent attendance coordinates.
   *
   * No tenantId parameter: `TenantPrismaService.run()` takes it from the request context and sets
   * `SET LOCAL app.current_tenant_id` itself, so RLS is what confines this query to one tenant —
   * not a WHERE clause this method could forget.
   *
   * A user with no linked worker row, or one whose check-ins carry no coordinates, comes back as
   * INSUFFICIENT_DATA — the same answer as too few points, because from the subject's side the
   * statement is identical: there is not enough recorded movement to say anything.
   */
  private async classifyWorker(userId: string): Promise<StationaryVerdict> {
    const since = new Date(Date.now() - STATIONARY_WINDOW_DAYS * 86_400_000);

    try {
      const rows = await this.prisma.run(
        (tx) =>
          tx.$queryRaw<{ latitude: string; longitude: string }[]>`
          SELECT a.latitude, a.longitude
            FROM workforce_telemetry.attendance_logs a
            JOIN workforce.workers w ON w.worker_id = a.worker_id
           WHERE w.user_id = ${userId}::uuid
             AND a.recorded_at >= ${since}::timestamptz
             AND a.latitude IS NOT NULL
             AND a.longitude IS NOT NULL`,
      );

      // NUMERIC(9,6) arrives as a string — Number() here rather than in SQL so the precision the
      // column actually stores is what the distance maths sees.
      const points: GeoPoint[] = rows.map((r) => ({
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
      }));
      return classify(points);
    } catch (err) {
      // A failed query must not break the transparency screen, and must not be reported as a
      // behavioural finding either. INSUFFICIENT_DATA is the honest fallback: nothing was measured.
      logger.warn(
        { err: String(err), event: 'network_origin.attendance_query_failed' },
        'query failed',
      );
      return { context: 'INSUFFICIENT_DATA', pointCount: 0, maxDistanceMetres: null };
    }
  }
}
