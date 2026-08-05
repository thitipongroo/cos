// The Network Origin panel (ADR-080).
//
// The three properties that make this a transparency feature rather than a surveillance one:
//
//   1. CONSENT IS CHECKED BEFORE THE COORDINATES ARE READ. Querying someone's location history and
//      then discarding it because they declined profiling is the processing the check exists to
//      prevent, merely followed by an apology.
//   2. "NOT ENABLED" AND "INSUFFICIENT DATA" ARE DIFFERENT ANSWERS. Null means the platform is not
//      doing this; INSUFFICIENT_DATA means it would but has too few points. Collapsing them tells a
//      worker who declined profiling that the platform merely lacked data.
//   3. THE RULE TRAVELS WITH THE VERDICT, so the screen can state a derivation instead of asserting
//      a label the subject cannot contest.

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@cos/logger', () => ({ createLogger: () => mockLogger }));

import { NetworkOriginService } from '../network-origin.service';
import type { GeoIpService } from '../geoip.service';
import type { ConsentService } from '../../consent/consent.service';
import type { TenantPrismaService } from '../../../tenant/prisma/tenant-prisma.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const IP = '203.0.113.7';

const ORIGIN = { city: 'Bangkok', region: 'Krung Thep', countryIsoCode: 'TH', organisation: 'AIS' };

function make(options: { consented?: boolean; rows?: unknown[]; queryThrows?: boolean } = {}) {
  const geoip = { lookup: jest.fn().mockResolvedValue(ORIGIN) };
  const consent = { hasConsent: jest.fn().mockResolvedValue(options.consented ?? true) };

  const calls: { sql: string; values: unknown[] }[] = [];
  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: strings.join('?'), values });
      if (options.queryThrows) return Promise.reject(new Error('relation missing'));
      return Promise.resolve(options.rows ?? []);
    }),
  };
  const prisma = { run: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };

  const service = new NetworkOriginService(
    geoip as unknown as GeoIpService,
    consent as unknown as ConsentService,
    prisma as unknown as TenantPrismaService,
  );
  return { service, geoip, consent, prisma, calls };
}

const describeFor = (s: NetworkOriginService) =>
  s.describe({ tenantId: TENANT, userId: USER, ipAddress: IP });

beforeEach(() => jest.clearAllMocks());

describe('geo enrichment', () => {
  it('resolves the caller’s own address', async () => {
    const { service, geoip } = make();
    const panel = await describeFor(service);

    expect(geoip.lookup).toHaveBeenCalledWith(IP);
    expect(panel.origin).toEqual(ORIGIN);
  });

  it('is NOT consent-gated — it is §30 access to data already collected', async () => {
    // `audit_logs.ip_address` is already stored and already tagged. Showing its subject what it
    // resolves to is the exercise of a right, not a new processing purpose. Gating it would mean a
    // worker who declined profiling could not see what the platform already holds about them.
    const { service, geoip } = make({ consented: false });
    const panel = await describeFor(service);

    expect(geoip.lookup).toHaveBeenCalled();
    expect(panel.origin).toEqual(ORIGIN);
  });

  it('reports a null origin without failing the panel', async () => {
    // No GeoLite2 database configured — the state of dev, CI and every air-gapped install.
    const { service, geoip } = make();
    geoip.lookup.mockResolvedValue(null);
    await expect(describeFor(service)).resolves.toMatchObject({ origin: null });
  });
});

describe('the behavioural label is gated on consent', () => {
  it('is null — and NO coordinates are read — without `operational` consent', async () => {
    const { service, consent, prisma } = make({ consented: false });
    const panel = await describeFor(service);

    expect(consent.hasConsent).toHaveBeenCalledWith(TENANT, USER, 'operational');
    expect(panel.behavioral).toBeNull();
    // The load-bearing assertion: the query never ran. Reading a worker's movements and discarding
    // them afterwards would be exactly the processing the consent check is meant to prevent.
    expect(prisma.run).not.toHaveBeenCalled();
  });

  it('is computed once consent is in place', async () => {
    const { service, prisma } = make({
      consented: true,
      rows: [
        { latitude: '13.756300', longitude: '100.501800' },
        { latitude: '13.756400', longitude: '100.501900' },
        { latitude: '13.756200', longitude: '100.501700' },
      ],
    });
    const panel = await describeFor(service);

    expect(prisma.run).toHaveBeenCalled();
    expect(panel.behavioral).toMatchObject({ context: 'STATIONARY', pointCount: 3 });
  });
});

describe('the attendance query', () => {
  it('joins through workers.user_id and windows on recorded_at', async () => {
    const { service, calls } = make({ consented: true });
    await describeFor(service);

    const sql = calls[0]!.sql;
    expect(sql).toContain('workforce_telemetry.attendance_logs');
    expect(sql).toContain('workforce.workers');
    expect(sql).toContain('w.user_id');
    expect(sql).toContain('a.recorded_at >=');
    expect(calls[0]!.values).toContain(USER);
  });

  it('excludes rows with no coordinates in SQL, not in JavaScript', async () => {
    // A NULL coordinate would become NaN in the distance maths and silently poison the maximum.
    const { service, calls } = make({ consented: true });
    await describeFor(service);
    expect(calls[0]!.sql).toContain('a.latitude IS NOT NULL');
    expect(calls[0]!.sql).toContain('a.longitude IS NOT NULL');
  });

  it('windows to the published number of days', async () => {
    const { service, calls } = make({ consented: true });
    const before = Date.now();
    await describeFor(service);

    const since = calls[0]!.values.find((v) => v instanceof Date) as Date;
    const days = (before - since.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7, 1);
  });

  it('converts NUMERIC strings to numbers', async () => {
    // NUMERIC(9,6) arrives from pg as a string; passing it straight to the maths would give NaN.
    const { service } = make({
      consented: true,
      rows: [
        { latitude: '13.756300', longitude: '100.501800' },
        { latitude: '13.800000', longitude: '100.501800' },
        { latitude: '13.900000', longitude: '100.501800' },
      ],
    });
    const panel = await describeFor(service);
    expect(panel.behavioral?.maxDistanceMetres).toBeGreaterThan(0);
    expect(Number.isNaN(panel.behavioral?.maxDistanceMetres)).toBe(false);
  });

  it('is INSUFFICIENT_DATA for a user with no worker row', async () => {
    // The join simply matches nothing. From the subject's side this is the same statement as "too
    // few check-ins": there is not enough recorded movement to say anything.
    const { service } = make({ consented: true, rows: [] });
    await expect(describeFor(service)).resolves.toMatchObject({
      behavioral: { context: 'INSUFFICIENT_DATA', pointCount: 0 },
    });
  });

  it('falls back to INSUFFICIENT_DATA — never a label — when the query fails', async () => {
    // A broken query must not break the transparency screen, and must not be reported as a
    // behavioural finding either. Nothing was measured, so nothing is claimed.
    const { service } = make({ consented: true, queryThrows: true });
    await expect(describeFor(service)).resolves.toMatchObject({
      behavioral: { context: 'INSUFFICIENT_DATA', maxDistanceMetres: null },
    });
  });
});

describe('the rule travels with the verdict', () => {
  it('always returns the thresholds, so the screen states a derivation', async () => {
    // "Stationary Worker" with no definition cannot be contested by its subject.
    const { service } = make({ consented: false });
    await expect(describeFor(service)).resolves.toMatchObject({
      rule: { windowDays: 7, radiusMetres: 100, minPoints: 3 },
    });
  });
});
