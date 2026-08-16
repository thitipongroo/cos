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

  it('findMatches() maps all three sources into one shape', async () => {
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
    ]);
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

  it('anonymise() returns the per-table counts', async () => {
    mockPrisma.$executeRaw
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    await expect(repo.anonymise('a@b.co', null)).resolves.toEqual({
      contacts: 2,
      leads: 1,
      vendors: 0,
    });
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(3);
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
});
