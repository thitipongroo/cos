// Unit tests — SubjectRequestRepository (ADR-090).
//
// The SQL is not executed here, so what these assert is the shape the repository asks for: which
// tables it touches, that the vendor CASE withholds tax_id/address on a non-INDIVIDUAL row, that the
// audit row carries a count and never the matches, and that every `rows[0] ?? null` branch is taken.

import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { SubjectRequestRepository } from '../subject-request.repository';
import { TenantPrismaService } from '../../../tenant/prisma/tenant-prisma.service';

const mockPrisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
const mockTenantPrisma = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};

const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const row = { request_id: REQUEST_ID, tenant_id: 'tenant-1', status: 'OPEN' };

async function build(request: Record<string, unknown>): Promise<SubjectRequestRepository> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      SubjectRequestRepository,
      { provide: TenantPrismaService, useValue: mockTenantPrisma },
      { provide: REQUEST, useValue: request },
    ],
  }).compile();
  return moduleRef.resolve<SubjectRequestRepository>(SubjectRequestRepository);
}

describe('SubjectRequestRepository', () => {
  let repo: SubjectRequestRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    repo = await build({ tenantId: 'tenant-1' });
  });

  it('falls back to CLS when the request carries no tenantId', async () => {
    // The fallback is load-bearing under Fastify (ADR-031) — the REQUEST injected into a
    // Scope.REQUEST provider is not guaranteed to be the object the auth layer decorated.
    const noCtx = await build({});
    expect((noCtx as unknown as { tenantId: string }).tenantId).toBe('');
  });

  it('create() inserts and returns the row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([row]);
    await expect(
      repo.create({
        request_type: 'ACCESS',
        subject_email: 'a@b.co',
        subject_phone: null,
        received_at: new Date('2026-08-14T09:00:00.000Z'),
        opened_by: 'user-1',
        note: null,
      }),
    ).resolves.toBe(row);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('list() passes the status through, and passes null when omitted', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([row]);
    await expect(repo.list('OPEN')).resolves.toEqual([row]);
    await expect(repo.list()).resolves.toEqual([row]);
    // Both calls carry the status in the parameter list — `undefined` becomes null, never a literal
    // 'undefined' string in the SQL.
    expect(mockPrisma.$queryRaw.mock.calls[1]).toContain(null);
  });

  it('findById() returns the row, or null when there is none', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([row]);
    await expect(repo.findById(REQUEST_ID)).resolves.toBe(row);
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(repo.findById(REQUEST_ID)).resolves.toBeNull();
  });

  it('close() returns the updated row, or null when it was not OPEN', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([row]);
    await expect(repo.close(REQUEST_ID, 'FULFILLED', 'done')).resolves.toBe(row);
    // The `status = 'OPEN'` predicate makes a second close a no-op rather than an overwrite.
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(repo.close(REQUEST_ID, 'REJECTED', 'refused')).resolves.toBeNull();
  });

  it('findMatches() maps all FOUR sources into one shape', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ contact_id: 'c1', name: 'Somchai', email: 'a@b.co', phone: null }])
      .mockResolvedValueOnce([{ lead_id: 'l1', contact_name: 'Somchai' }])
      .mockResolvedValueOnce([
        {
          vendor_id: 'v1',
          vendor_name: 'ACME',
          contact_email: 'a@b.co',
          contact_phone: null,
          tax_id: null,
          address: null,
        },
      ])
      // workforce.workers — §11.4's "Employee". Absent from this method until 2026-08-23 (OQ-48),
      // so a site worker's own record was invisible to their own PDPA request.
      .mockResolvedValueOnce([
        { worker_id: 'w1', full_name: 'Somchai', contact_phone: '+66800000001' },
      ]);

    const matches = await repo.findMatches('a@b.co', null);

    expect(matches).toEqual([
      {
        source: 'crm.contacts',
        id: 'c1',
        fields: { name: 'Somchai', email: 'a@b.co', phone: null },
      },
      { source: 'crm.leads', id: 'l1', fields: { contact_name: 'Somchai' } },
      {
        source: 'procurement.vendors',
        id: 'v1',
        fields: {
          vendor_name: 'ACME',
          contact_email: 'a@b.co',
          contact_phone: null,
          tax_id: null,
          address: null,
        },
      },
      {
        source: 'workforce.workers',
        id: 'w1',
        // employee_code and trade_type are the tenant's employment record, not the subject's
        // personal data — §11.4 lists these two fields and no others.
        fields: { full_name: 'Somchai', contact_phone: '+66800000001' },
      },
    ]);
  });

  it('findMatches() reaches a worker by EMAIL through user_id, since the row has no email column', () => {
    // Asserted on the SQL because the join is the whole mechanism: a worker matched only by phone
    // would leave every Path B employee unreachable by an email-based request.
    const sql = String(SubjectRequestRepository.prototype.findMatches.toString());
    expect(sql).toContain('workforce.workers');
    expect(sql).toContain('w.user_id IN (');
    expect(sql).toContain('platform.users');
  });

  it('findMatches() asks the database to withhold tax_id/address unless the vendor is INDIVIDUAL', () => {
    // The condition lives in SQL, so this asserts the SQL text rather than a JS branch: a CASE that
    // silently lost its guard would hand a company's tax id to a data subject.
    const sql =
      (repo as unknown as { db: unknown }) &&
      String(
        (
          SubjectRequestRepository.prototype.findMatches as unknown as { toString(): string }
        ).toString(),
      );
    expect(sql).toContain("vendor_type = 'INDIVIDUAL'");
  });

  // anonymise() went from four bulk UPDATEs returning counts to five returning IDS (OQ-48). The ids
  // are what the per-entity audit trail is written from, so "how many" is no longer enough.
  describe('anonymise()', () => {
    /** Queue one RETURNING result per statement, in the order anonymise() issues them. */
    function queueErasure(): void {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ contact_id: 'c1' }, { contact_id: 'c2' }]) // crm.contacts
        .mockResolvedValueOnce([{ lead_id: 'l1' }]) // crm.leads
        .mockResolvedValueOnce([]) // procurement.vendors
        .mockResolvedValueOnce([{ worker_id: 'w1' }]) // workforce.workers
        .mockResolvedValueOnce([{ user_id: 'u1', keycloak_user_id: 'kc-1' }]); // platform.users
    }

    /** The SQL of the Nth statement, normalised to one line. */
    function sqlOf(i: number): string {
      return String((mockPrisma.$queryRaw.mock.calls[i] as unknown[])[0]).replace(/\s+/g, ' ');
    }

    it('returns the ids it erased, per table, and the Keycloak id of each account', async () => {
      queueErasure();
      await expect(repo.anonymise('a@b.co', null)).resolves.toEqual({
        contacts: ['c1', 'c2'],
        leads: ['l1'],
        vendors: [],
        workers: ['w1'],
        users: [{ userId: 'u1', keycloakUserId: 'kc-1' }],
      });
      // Five tables now, not four — platform.users joined the list (OQ-48).
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(5);
    });

    // Not stylistic. `workers` resolves an email THROUGH platform.users; if users were erased first
    // that lookup would find an empty email, match nothing, and report a clean erasure that never
    // touched the worker's record.
    it('erases platform.users LAST, after the workers query that reads it', async () => {
      queueErasure();
      await repo.anonymise('a@b.co', null);

      expect(sqlOf(3)).toContain('UPDATE workforce.workers');
      expect(sqlOf(3)).toContain('SELECT u.user_id FROM platform.users u');
      expect(sqlOf(4)).toContain('UPDATE platform.users');
    });

    // Same shape one step earlier: leads are reached through contacts already marked '[ERASED]'.
    it('erases crm.leads after the contacts it matches them through', async () => {
      queueErasure();
      await repo.anonymise('a@b.co', null);

      expect(sqlOf(0)).toContain('UPDATE crm.contacts');
      expect(sqlOf(1)).toContain('UPDATE crm.leads');
      expect(sqlOf(1)).toContain("c.name = '[ERASED]'");
    });

    it('ends the account as part of erasing it, and keeps the row', async () => {
      queueErasure();
      await repo.anonymise('a@b.co', null);
      const users = sqlOf(4);

      // display_name/email/phone_number ARE how the person signs in, so clearing them ends the
      // account whether or not the flag says so. Leaving is_active true would advertise a live
      // account nobody can use or identify.
      expect(users).toContain("display_name = '[ERASED]'");
      expect(users).toContain("email = ''"); // NOT NULL column; the index on it is not unique
      expect(users).toContain('phone_number = NULL'); // partial UNIQUE index needs NULL, not a marker
      expect(users).toContain('is_active = false');
      // The row survives — it anchors audit_logs.actor_id and every created_by in the system.
      expect(users).not.toMatch(/\bDELETE\b/);
      // And the Keycloak id comes back rather than being cleared: the caller needs it to finish.
      expect(users).toContain('RETURNING user_id::text, keycloak_user_id');
    });

    it('scopes every statement to the tenant', async () => {
      queueErasure();
      await repo.anonymise('a@b.co', null);
      for (let i = 0; i < 5; i++) expect(sqlOf(i)).toContain('tenant_id = ');
    });
  });

  it('writeErasureAudit() writes one row per erased record, with ids and never the values', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(2);
    await repo.writeErasureAudit('user-1', REQUEST_ID, [
      { resourceType: 'workforce.workers', resourceId: 'w1' },
      { resourceType: 'platform.users', resourceId: 'u1' },
    ]);

    const params = mockPrisma.$executeRaw.mock.calls[0] as unknown[];
    const payload = String(params.find((x) => String(x).includes('pii.erased')));
    expect(payload).toContain('workforce.workers');
    expect(payload).toContain('w1');
    expect(payload).toContain('platform.users');
    // QM-8 again: the trail says WHICH row was erased, never what it said.
    expect(JSON.stringify(params)).not.toContain('@b.co');
    expect(String(params[0])).toContain("'PII_ERASED'");
  });

  it('writeErasureAudit() writes nothing when nothing was erased', async () => {
    await repo.writeErasureAudit('user-1', REQUEST_ID, []);
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('writeAudit() records the count and never the matches themselves', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.writeAudit({
      actorId: 'user-1',
      action: 'SEARCH x',
      requestId: REQUEST_ID,
      matches: 3,
    });

    const params = mockPrisma.$executeRaw.mock.calls[0] as unknown[];
    expect(params).toContain(JSON.stringify({ matches: 3 }));
    // QM-8: audit rows carry IDs and counts, not a second copy of the personal data.
    expect(JSON.stringify(params)).not.toContain('@b.co');
  });

  it('recordChallenge() stores the hash and the address, and clears any earlier proof', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.recordChallenge({ requestId: REQUEST_ID, tokenHash: 'hash', sentTo: 'a@b.co' });

    const params = mockPrisma.$executeRaw.mock.calls[0] as unknown[];
    expect(params).toContain('hash');
    expect(params).toContain('a@b.co');
    // Re-issuing must reset verified_at: a fresh challenge means the old proof no longer describes
    // the live token.
    expect(String(params[0])).toContain('verified_at = NULL');
  });

  it('markVerifiedByTokenHash() is tenant-scoped and single-use', async () => {
    mockPrisma.$executeRaw.mockResolvedValueOnce(1);
    await expect(repo.markVerifiedByTokenHash('hash')).resolves.toBe(true);
    const sql = String((mockPrisma.$executeRaw.mock.calls[0] as unknown[])[0]);
    // The guard puts the tenant in CLS before this runs, so the write stays under RLS rather than
    // being an unscoped update keyed only by a secret.
    expect(sql).toContain('tenant_id');
    expect(sql).toContain('verified_at IS NULL');

    mockPrisma.$executeRaw.mockResolvedValueOnce(0);
    await expect(repo.markVerifiedByTokenHash('hash')).resolves.toBe(false);
  });

  it('anonymise reports erased vendors too, not only the four tables that usually match', async () => {
    // The vendor statement is the one that returns nothing in the common case — a data subject is
    // rarely also a supplier — so its result mapping is the easiest to leave unexercised while the
    // suite still looks complete.
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([]) // crm.contacts
      .mockResolvedValueOnce([]) // crm.leads
      .mockResolvedValueOnce([{ vendor_id: 'v1' }, { vendor_id: 'v2' }]) // procurement.vendors
      .mockResolvedValueOnce([]) // workforce.workers
      .mockResolvedValueOnce([]); // platform.users

    await expect(repo.anonymise('a@b.test', null)).resolves.toEqual({
      contacts: [],
      leads: [],
      vendors: ['v1', 'v2'],
      workers: [],
      users: [],
    });
  });

  describe('findTenantRealm', () => {
    it('reads the realm through the TENANT-scoped connection', async () => {
      // Not the privileged one: rls_tenants_read (migration 20260804000001) confines app_user to
      // its own tenant's row precisely so a request-scoped path cannot reach another tenant's realm
      // — or its dedicated_db_url, which is why that policy was tightened. Only keycloak_realm is
      // selected.
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ keycloak_realm: 'cos-acme' }]);
      await expect(repo.findTenantRealm()).resolves.toBe('cos-acme');

      const sql = String((mockPrisma.$queryRaw.mock.calls[0] as unknown[])[0]).replace(/\s+/g, ' ');
      expect(sql).toContain('SELECT keycloak_realm FROM platform.tenants');
      expect(sql).toContain('tenant_id');
      expect(mockTenantPrisma.run).toHaveBeenCalled();
    });

    it('returns null when no row comes back rather than undefined', async () => {
      // The caller branches on null to decide whether there is a Keycloak account to erase at all.
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      await expect(repo.findTenantRealm()).resolves.toBeNull();
    });
  });
});
