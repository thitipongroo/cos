// verifyRoutingActivity reads routing where it lives (2026-11-13). Until then it read platform.tenants on
// the DEDICATED database, which migrations create empty (platform never moves — get-db-url.ts), so it
// failed for every real tenant; the workflow specs mock it, so nothing noticed. Since D48/D49 that failure
// would put every run into RESTORED. Here: routing is read from the shared database and must name the new
// instance; the dedicated database only has to answer.

const SHARED_URL = 'postgresql://cos:pw@shared-db.internal:5432/cos';
const ENDPOINT = 'cos-tenant-acme-prod.xxx.rds.amazonaws.com';

const queries: Array<{ url: string; sql: string }> = [];
let storedUrl: string | null = `postgresql://app_user:pw@${ENDPOINT}:5432/cos`;
jest.mock('../../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: (url: string) => ({
    $queryRaw: (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      queries.push({ url, sql });
      return Promise.resolve(
        sql.includes('platform.tenants') ? [{ dedicated_db_url: storedUrl }] : [{ ok: 1 }],
      );
    },
    $disconnect: () => Promise.resolve(),
  }),
}));
jest.mock('../tenant-db-secrets', () => ({
  readMasterPassword: jest.fn().mockResolvedValue('master-pw'),
  ensureAppUserPassword: jest.fn(),
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const PARAMS = {
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
  rdsEndpoint: ENDPOINT,
  masterSecretArn: 'arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:x',
};

describe('verifyRoutingActivity', () => {
  let verifyRoutingActivity: typeof import('../enterprise-provisioning.activities').verifyRoutingActivity;

  beforeAll(() => {
    process.env['DATABASE_URL'] = SHARED_URL; // read when the module loads
    ({ verifyRoutingActivity } = jest.requireActual<
      typeof import('../enterprise-provisioning.activities')
    >('../enterprise-provisioning.activities'));
  });

  beforeEach(() => {
    queries.length = 0;
    storedUrl = `postgresql://app_user:pw@${ENDPOINT}:5432/cos`;
  });

  it('reads routing from the shared database and only pings the dedicated one', async () => {
    await verifyRoutingActivity(PARAMS);
    const routing = queries.filter((q) => q.sql.includes('platform.tenants'));
    expect(routing.map((q) => q.url)).toEqual([SHARED_URL]);
    const ping = queries.filter((q) => !q.sql.includes('platform.tenants'));
    expect(ping).toHaveLength(1);
    expect(new URL(ping[0]!.url).hostname).toBe(ENDPOINT);
  });

  it('fails when the tenant is not routed at all', async () => {
    storedUrl = null;
    await expect(verifyRoutingActivity(PARAMS)).rejects.toThrow('dedicated_db_url is NULL');
  });

  it('fails when the tenant is routed to another instance', async () => {
    storedUrl = 'postgresql://app_user:pw@some-other-db.internal:5432/cos';
    await expect(verifyRoutingActivity(PARAMS)).rejects.toThrow(
      `is routed to some-other-db.internal, not ${ENDPOINT}`,
    );
  });
});
