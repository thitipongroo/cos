// PDPA §19 consent unit tests (ADR-079).
//
// The behaviours worth protecting are the ones a regression would silently break the LEGAL position
// on, not just the code path:
//   - silence is not consent (no row ⇒ granted:false — PDPA §19 needs an affirmative act)
//   - contract-basis categories are reported but never withdrawable (ADR-079)
//   - the gate THROWS rather than dropping the field (a silent drop reads as a sync bug on site)
//   - every statement runs inside a transaction that first SET LOCAL app.current_tenant_id, or RLS
//     matches no row and the query would silently return nothing
//   - DISTINCT ON returns the LATEST decision, so a withdrawal actually overrides an earlier grant

const prismaMock = {
  $transaction: jest.fn(),
  $disconnect: jest.fn(),
};

jest.mock('../../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: () => prismaMock,
}));
jest.mock('../../../../shared/prisma/app-database-url', () => ({
  appDatabaseUrl: () => 'postgresql://app_user@pgbouncer:6432/cos',
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import {
  ConsentService,
  basisFor,
  isConsentPurpose,
  CONSENT_PURPOSES,
  PDPA_CATEGORIES,
} from '../consent.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

/** Rows the DISTINCT ON query would return, shaped exactly as $queryRaw yields them. */
type Row = { purpose: string; granted: boolean; notice_version: string; recorded_at: Date };

/**
 * Drive $transaction with a tx double, capturing the SET LOCAL and returning `rows` from $queryRaw.
 * Recording the executeRawUnsafe calls is the point: without SET LOCAL the RLS policy matches no row.
 */
function givenRows(rows: Row[]) {
  const setLocal = jest.fn();
  const insert = jest.fn();
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $executeRawUnsafe: setLocal,
      $executeRaw: insert,
      $queryRaw: jest.fn().mockResolvedValue(rows),
    }),
  );
  return { setLocal, insert };
}

describe('basisFor / isConsentPurpose — the lawful-basis split (pure)', () => {
  it.each(['location', 'financial', 'operational'] as const)('%s is CONSENT basis', (c) => {
    expect(basisFor(c)).toBe('CONSENT');
    expect(isConsentPurpose(c)).toBe(true);
  });

  it.each(['identity', 'contact'] as const)('%s is CONTRACT basis, not a consent purpose', (c) => {
    expect(basisFor(c)).toBe('CONTRACT');
    expect(isConsentPurpose(c)).toBe(false);
  });

  it('rejects a value that is not a category at all', () => {
    expect(isConsentPurpose('biometric')).toBe(false);
  });

  it('the two lists stay in the relationship ADR-079 defines', () => {
    // Every consent purpose is a @pdpa category; the extras are exactly the contract-based two.
    expect(PDPA_CATEGORIES).toEqual(
      expect.arrayContaining(CONSENT_PURPOSES as unknown as string[]),
    );
    expect(PDPA_CATEGORIES.filter((c) => basisFor(c) === 'CONTRACT')).toEqual([
      'identity',
      'contact',
    ]);
  });
});

describe('ConsentService.getState', () => {
  let svc: ConsentService;
  beforeEach(() => {
    jest.clearAllMocks();
    svc = new ConsentService();
  });

  it('reports all five categories — contract ones granted and NOT withdrawable', async () => {
    givenRows([]);
    const state = await svc.getState(TENANT, USER);

    expect(state.map((s) => s.category)).toEqual([...PDPA_CATEGORIES]);
    const identity = state.find((s) => s.category === 'identity')!;
    expect(identity).toMatchObject({
      basis: 'CONTRACT',
      granted: true,
      withdrawable: false,
      noticeVersion: null,
      recordedAt: null,
    });
  });

  it('treats an absent decision as NOT consented — silence is not consent (PDPA §19)', async () => {
    givenRows([]);
    const state = await svc.getState(TENANT, USER);
    for (const c of CONSENT_PURPOSES) {
      expect(state.find((s) => s.category === c)).toMatchObject({
        basis: 'CONSENT',
        granted: false,
        withdrawable: true,
        noticeVersion: null,
        recordedAt: null,
      });
    }
  });

  it('surfaces a recorded grant with its notice version and timestamp', async () => {
    const at = new Date('2026-08-04T09:00:00.000Z');
    givenRows([{ purpose: 'LOCATION', granted: true, notice_version: '1.0.0', recorded_at: at }]);
    const state = await svc.getState(TENANT, USER);
    expect(state.find((s) => s.category === 'location')).toMatchObject({
      granted: true,
      noticeVersion: '1.0.0',
      recordedAt: at,
    });
    // Untouched consent purposes stay false rather than inheriting the grant.
    expect(state.find((s) => s.category === 'financial')!.granted).toBe(false);
  });

  it('a withdrawal row overrides an earlier grant (DISTINCT ON returns the latest)', async () => {
    givenRows([
      {
        purpose: 'LOCATION',
        granted: false,
        notice_version: '1.0.0',
        recorded_at: new Date('2026-08-04T10:00:00.000Z'),
      },
    ]);
    expect((await svc.getState(TENANT, USER)).find((s) => s.category === 'location')!.granted).toBe(
      false,
    );
  });

  it('ignores an enum value it does not recognise instead of crashing the screen', async () => {
    givenRows([
      { purpose: 'NOT_A_PURPOSE', granted: true, notice_version: '1.0.0', recorded_at: new Date() },
    ]);
    const state = await svc.getState(TENANT, USER);
    expect(state.every((s) => s.basis === 'CONTRACT' || s.granted === false)).toBe(true);
  });

  it('sets app.current_tenant_id in the same transaction as the read (RLS binds)', async () => {
    const { setLocal } = givenRows([]);
    await svc.getState(TENANT, USER);
    expect(setLocal).toHaveBeenCalledWith(`SET LOCAL app.current_tenant_id = '${TENANT}'`);
  });

  it('refuses a tenant id that is not a UUID before it reaches SET LOCAL (injection guard)', async () => {
    await expect(svc.getState("' OR '1'='1", USER)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('ConsentService.record — append-only', () => {
  let svc: ConsentService;
  beforeEach(() => {
    jest.clearAllMocks();
    svc = new ConsentService();
  });

  it.each([true, false])('inserts a row for granted=%s (never updates)', async (granted) => {
    const { setLocal, insert } = givenRows([]);
    await svc.record({
      tenantId: TENANT,
      userId: USER,
      purpose: 'location',
      granted,
      noticeVersion: '1.0.0',
    });
    expect(setLocal).toHaveBeenCalledWith(`SET LOCAL app.current_tenant_id = '${TENANT}'`);
    expect(insert).toHaveBeenCalledTimes(1);
    // The tagged-template call carries the SQL fragments; assert it is an INSERT and nothing else.
    const sql = (insert.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toContain('INSERT INTO platform.consents');
    expect(sql).not.toMatch(/UPDATE|DELETE/);
  });

  it('refuses a non-UUID tenant id (injection guard)', async () => {
    await expect(
      svc.record({
        tenantId: 'not-a-uuid',
        userId: USER,
        purpose: 'location',
        granted: true,
        noticeVersion: '1.0.0',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('ConsentService.requireConsent — the gate', () => {
  let svc: ConsentService;
  beforeEach(() => {
    jest.clearAllMocks();
    svc = new ConsentService();
  });

  it('passes when the latest decision is a grant', async () => {
    givenRows([
      { purpose: 'LOCATION', granted: true, notice_version: '1.0.0', recorded_at: new Date() },
    ]);
    await expect(svc.requireConsent(TENANT, USER, 'location')).resolves.toBeUndefined();
  });

  it('throws 422 COS-PDPA-001 when no decision exists — never a silent drop', async () => {
    givenRows([]);
    await expect(svc.requireConsent(TENANT, USER, 'location')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    try {
      givenRows([]);
      await svc.requireConsent(TENANT, USER, 'location');
    } catch (err) {
      const body = (err as UnprocessableEntityException).getResponse() as {
        error: { code: string; messageKey: string; details: { purpose: string } };
      };
      expect(body.error.code).toBe('COS-PDPA-001');
      expect(body.error.messageKey).toBe('pdpa.consent.required');
      expect(body.error.details.purpose).toBe('location');
    }
  });

  it('throws after a withdrawal', async () => {
    givenRows([
      { purpose: 'FINANCIAL', granted: false, notice_version: '1.0.0', recorded_at: new Date() },
    ]);
    await expect(svc.requireConsent(TENANT, USER, 'financial')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

describe('ConsentService.hasConsent', () => {
  it('is false for a purpose with no row even when another purpose is granted', async () => {
    jest.clearAllMocks();
    givenRows([
      { purpose: 'LOCATION', granted: true, notice_version: '1.0.0', recorded_at: new Date() },
    ]);
    const svc = new ConsentService();
    expect(await svc.hasConsent(TENANT, USER, 'operational')).toBe(false);
  });
});

describe('ConsentService shutdown (ADR-034 / Rule 39)', () => {
  it('disconnects Prisma on module destroy', async () => {
    jest.clearAllMocks();
    const svc = new ConsentService();
    await svc.onModuleDestroy();
    expect(prismaMock.$disconnect).toHaveBeenCalledTimes(1);
  });
});
