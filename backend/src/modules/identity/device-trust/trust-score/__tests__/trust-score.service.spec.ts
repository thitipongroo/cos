// Feature gathering for the trust score (ADR-081).
//
// The scorer itself is pure and tested next door. What is at stake here is everything AROUND the
// arithmetic: which database the rows come from, whether a caller can score someone else's handset,
// whether an unreadable signal abstains or accuses, and whether anything derived gets written back.

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@cos/logger', () => ({ createLogger: () => mockLogger }));

const queryRaw = jest.fn();
const executeRawUnsafe = jest.fn();
const transaction = jest.fn();
const disconnect = jest.fn();
const createPrismaClient = jest.fn(() => ({
  $queryRaw: queryRaw,
  $executeRawUnsafe: executeRawUnsafe,
  $transaction: transaction,
  $disconnect: disconnect,
}));
jest.mock('../../../../../shared/prisma/create-prisma-client', () => ({ createPrismaClient }));

const appDatabaseUrl = jest.fn(() => 'postgres://app/platform');
jest.mock('../../../../../shared/prisma/app-database-url', () => ({ appDatabaseUrl }));

import { TrustScoreService } from '../trust-score.service';
import type { GeoIpService } from '../../../network-origin/geoip.service';
import RULES from '../device-trust-rules.v1.json';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const DEVICE = 'install-abc';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/** A STRONG-attested device, enrolled 200 days ago, used today. */
const DEVICE_ROW = {
  created_at: daysAgo(200),
  last_seen_at: daysAgo(0),
  attestation_verdict: 'PASSED',
  integrity_level: 'STRONG',
};

const NO_REVOCATIONS = { compromised: null, latest_non_compromise: null };

interface Options {
  device?: unknown;
  revocations?: unknown;
  auditRows?: { ip: string; n: number }[];
  auditThrows?: boolean;
  asnByIp?: Record<string, number | null>;
}

function make(options: Options = {}) {
  jest.clearAllMocks();

  const sql: string[] = [];
  queryRaw.mockImplementation((strings: TemplateStringsArray) => {
    const text = strings.join('?');
    sql.push(text);
    if (text.includes('trusted_devices') && text.includes('device_id')) {
      return Promise.resolve(options.device === null ? [] : [options.device ?? DEVICE_ROW]);
    }
    if (text.includes('trusted_devices')) {
      return Promise.resolve([options.revocations ?? NO_REVOCATIONS]);
    }
    return Promise.resolve(options.auditRows ?? []);
  });

  executeRawUnsafe.mockResolvedValue(undefined);
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    if (options.auditThrows) throw new Error('permission denied for table audit_logs');
    return fn({ $queryRaw: queryRaw, $executeRawUnsafe: executeRawUnsafe });
  });

  const geoip = {
    asnNumber: jest.fn((ip: string) =>
      Promise.resolve(options.asnByIp ? (options.asnByIp[ip] ?? null) : 4713),
    ),
  };

  const service = new TrustScoreService(geoip as unknown as GeoIpService);
  return { service, geoip, sql };
}

const report = (s: TrustScoreService) =>
  s.report({ tenantId: TENANT, userId: USER, deviceId: DEVICE });

describe('which database the rows come from', () => {
  it('opens the PLATFORM connection, not the tenant one', () => {
    // The trap this is guarding: for an ENTERPRISE tenant on a dedicated database, platform.* tables
    // exist but are EMPTY — `prisma migrate deploy` creates them and the data migration excludes the
    // platform schema. Read through TenantPrismaService, every enterprise device would come back as
    // a brand-new enrolment with no history: a wrong answer that looks exactly like a right one.
    make();
    expect(appDatabaseUrl).toHaveBeenCalled();
    expect(createPrismaClient).toHaveBeenCalledWith('postgres://app/platform');
  });

  it('closes the client with the module (ADR-034)', async () => {
    const { service } = make();
    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('access control', () => {
  it('scopes the device lookup by user AND device together', async () => {
    // The device id is a stable per-install value the app stores in secure storage, not a secret.
    // Scoping by it alone would make knowing an id the whole of the access control.
    const { service, sql } = make();
    await report(service);
    expect(sql[0]).toContain('user_id = ');
    expect(sql[0]).toContain('device_id = ');
    expect(sql[0]).toContain('revoked_at IS NULL');
  });

  it('returns null for a device the caller does not have', async () => {
    const { service } = make({ device: null });
    await expect(report(service)).resolves.toBeNull();
  });

  it('rejects a tenant id that is not a plain uuid before it reaches SET LOCAL', async () => {
    // The GUC is interpolated, not parameterised — SET LOCAL cannot take a bind parameter — so the
    // shared assertion is the thing standing between that string and the query.
    const { service } = make();
    await expect(
      service.report({
        tenantId: "'; DROP SCHEMA platform CASCADE--",
        userId: USER,
        deviceId: DEVICE,
      }),
    ).rejects.toThrow();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('revocation history', () => {
  it('looks across ALL the user’s devices, not just this one', async () => {
    // A compromise is a fact about an account: the credential that was abused is the same one this
    // device authenticates. Scoped per-device, the compromised phone could be revoked and its
    // replacement score a clean 100 the same afternoon.
    const { service, sql } = make();
    await report(service);
    const historySql = sql.find((s) => s.includes('bool_or'))!;
    expect(historySql).toContain('user_id = ');
    expect(historySql).not.toContain('device_id');
    expect(historySql).toContain('revoked_at IS NOT NULL');
  });

  it('caps the score when a compromise is on record', async () => {
    const { service } = make({
      revocations: { compromised: true, latest_non_compromise: null },
    });
    const result = await report(service);
    expect(result!.score).toBe(RULES.caps.COMPROMISE_ON_RECORD);
    expect(result!.capped).toBe(true);
  });

  it('counts a recent lost-or-stolen revocation without capping', async () => {
    const { service } = make({
      revocations: { compromised: false, latest_non_compromise: daysAgo(10) },
    });
    const result = await report(service);
    expect(result!.capped).toBe(false);
    expect(result!.signals.find((s) => s.signal === 'revocationHistory')!.band).toBe(
      'NON_COMPROMISE_RECENT',
    );
  });

  it('treats a user with no revocations at all as CLEAN', async () => {
    // `bool_or` over zero rows is NULL, not false — the aggregate returns one row either way.
    const { service } = make();
    const result = await report(service);
    expect(result!.signals.find((s) => s.signal === 'revocationHistory')!.band).toBe('CLEAN');
  });
});

describe('ASN stability', () => {
  it('sets the tenant GUC inside the same transaction as the SELECT', async () => {
    // audit_logs is RLS-protected and app_user's policy reads app.current_tenant_id. Outside a
    // transaction the GUC would be set on whichever pooled connection PgBouncer happened to hand
    // back, and the SELECT would run on another one (QM-18).
    const { service } = make({ auditRows: [{ ip: '203.0.113.7', n: 5 }] });
    await report(service);
    expect(executeRawUnsafe).toHaveBeenCalledWith(`SET LOCAL app.current_tenant_id = '${TENANT}'`);
    expect(transaction).toHaveBeenCalled();
  });

  it('counts distinct autonomous systems, not distinct addresses', async () => {
    // A worker on one carrier gets a new address on every reconnection. Counting addresses would
    // report a stationary worker as roaming across nine networks.
    const { service } = make({
      auditRows: [
        { ip: '203.0.113.7', n: 4 },
        { ip: '203.0.113.9', n: 3 },
        { ip: '198.51.100.4', n: 2 },
      ],
      asnByIp: { '203.0.113.7': 4713, '203.0.113.9': 4713, '198.51.100.4': 4713 },
    });
    const result = await report(service);
    expect(result!.signals.find((s) => s.signal === 'asnStability')!.band).toBe('SINGLE_ASN');
  });

  it('counts OBSERVATIONS as requests, not as addresses', async () => {
    // Three requests from one address is evidence of a stable network; three addresses seen once
    // each says almost nothing. Only the first clears the floor.
    const { service } = make({ auditRows: [{ ip: '203.0.113.7', n: 3 }] });
    const result = await report(service);
    expect(result!.signals.find((s) => s.signal === 'asnStability')!.band).toBe('SINGLE_ASN');

    const thin = make({ auditRows: [{ ip: '203.0.113.7', n: 2 }] });
    const thinResult = await report(thin.service);
    expect(thinResult!.signals.find((s) => s.signal === 'asnStability')!.band).toBe(
      'INSUFFICIENT_DATA',
    );
  });

  it('abstains when no GeoLite2 ASN database is configured', async () => {
    // Every lookup returns null in that deployment. The band must read INSUFFICIENT_DATA, not a
    // suspiciously perfect single network and not instability (ADR-080).
    const { service } = make({
      auditRows: [{ ip: '203.0.113.7', n: 40 }],
      asnByIp: {},
    });
    const result = await report(service);
    expect(result!.signals.find((s) => s.signal === 'asnStability')!.band).toBe(
      'INSUFFICIENT_DATA',
    );
  });

  it('windows and bounds the query so an active account cannot cost unbounded lookups', async () => {
    const { service, sql } = make({ auditRows: [{ ip: '203.0.113.7', n: 5 }] });
    await report(service);
    const auditSql = sql.find((s) => s.includes('audit_logs'))!;
    expect(auditSql).toContain('occurred_at >=');
    expect(auditSql).toContain('GROUP BY ip_address');
    expect(auditSql).toContain('LIMIT');
    expect(RULES.thresholds.asnMaxDistinctAddresses).toBeGreaterThan(0);
  });

  it('abstains, and does not log the addresses, when the query fails', async () => {
    // A broken query must not be reported as network instability, and the one thing that must never
    // reach the log is the personal data this whole feature is careful about.
    const { service } = make({ auditThrows: true });
    const result = await report(service);
    expect(result!.signals.find((s) => s.signal === 'asnStability')!.band).toBe(
      'INSUFFICIENT_DATA',
    );
    const logged = JSON.stringify(mockLogger.warn.mock.calls);
    expect(logged).not.toContain('203.0.113');
  });
});

describe('day arithmetic', () => {
  it('floors, because the bands are inclusive lower bounds', async () => {
    // 89.9 days enrolled is not 90 days enrolled.
    const { service } = make({
      device: { ...DEVICE_ROW, created_at: new Date(Date.now() - 90 * DAY + 3600_000) },
    });
    const result = await report(service);
    expect(result!.signals.find((s) => s.signal === 'enrolmentAge')!.band).toBe('AT_LEAST_30_DAYS');
  });

  it('clamps at zero rather than producing a negative age', async () => {
    // last_seen_at is written by the database's clock; a backend a few seconds behind it would
    // otherwise fall through every band.
    const { service } = make({
      device: { ...DEVICE_ROW, last_seen_at: new Date(Date.now() + 5000) },
    });
    const result = await report(service);
    expect(result!.signals.find((s) => s.signal === 'recency')!.band).toBe(
      'SEEN_WITHIN_FRESH_WINDOW',
    );
  });
});

describe('the report', () => {
  it('carries the device it describes and the scorer that produced it', async () => {
    const { service } = make();
    const result = await report(service);
    expect(result).toMatchObject({
      deviceId: DEVICE,
      scoredBy: 'RULES',
      rulesVersion: RULES.rulesVersion,
    });
  });

  it('writes nothing back — the whole read is SELECTs and one SET LOCAL', async () => {
    // ADR-080's rule, applied here: the ASN numbers are resolved in memory and discarded, and no
    // score is persisted. Persisting either would create a PII column, a retention row, a data-flow
    // map entry and an erasure target, all to cache something cheap to recompute.
    const { service } = make({ auditRows: [{ ip: '203.0.113.7', n: 5 }] });
    await report(service);
    const statements = queryRaw.mock.calls.map((c) => (c[0] as TemplateStringsArray).join('?'));
    for (const s of statements) {
      expect(s).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    }
    expect(executeRawUnsafe.mock.calls.every(([s]) => String(s).startsWith('SET LOCAL'))).toBe(
      true,
    );
  });
});
