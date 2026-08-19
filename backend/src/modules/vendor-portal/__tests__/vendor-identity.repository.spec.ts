jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { VendorIdentityRepository } from '../vendor-identity.repository';

const identity = {
  vendor_identity_id: 'vid-1',
  email: 'a@b.co',
  display_name: 'ACME',
  keycloak_user_id: null,
  is_active: true,
};
const relationship = {
  relationship_id: 'rel-1',
  vendor_identity_id: 'vid-1',
  tenant_id: 'ten-1',
  vendor_id: 'ven-1',
  status: 'ACTIVE' as const,
};

describe('VendorIdentityRepository', () => {
  let repo: VendorIdentityRepository;
  let q: jest.Mock;

  beforeEach(() => {
    repo = new VendorIdentityRepository();
    q = (repo as unknown as { prisma: { $queryRaw: jest.Mock } }).prisma.$queryRaw;
  });

  it('findIdentityByEmail returns the row', async () => {
    q.mockResolvedValue([identity]);
    expect(await repo.findIdentityByEmail('a@b.co')).toEqual(identity);
  });

  it('findIdentityByEmail returns null when none', async () => {
    q.mockResolvedValue([]);
    expect(await repo.findIdentityByEmail('x@y.z')).toBeNull();
  });

  it('createIdentity returns the inserted row', async () => {
    q.mockResolvedValue([identity]);
    expect(await repo.createIdentity('a@b.co', 'ACME')).toEqual(identity);
  });

  it('upsertIdentity returns the existing identity without creating', async () => {
    q.mockResolvedValueOnce([identity]);
    expect(await repo.upsertIdentity('a@b.co', 'ACME')).toEqual(identity);
    expect(q).toHaveBeenCalledTimes(1);
  });

  it('upsertIdentity creates when none exists', async () => {
    q.mockResolvedValueOnce([]).mockResolvedValueOnce([identity]);
    expect(await repo.upsertIdentity('a@b.co', 'ACME')).toEqual(identity);
    expect(q).toHaveBeenCalledTimes(2);
  });

  it('createRelationship returns the row', async () => {
    q.mockResolvedValue([relationship]);
    expect(await repo.createRelationship('vid-1', 'ten-1', 'ven-1')).toEqual(relationship);
  });

  it('findActiveRelationship returns the row', async () => {
    q.mockResolvedValue([relationship]);
    expect(await repo.findActiveRelationship('vid-1', 'ten-1')).toEqual(relationship);
  });

  it('findActiveRelationship returns null when none', async () => {
    q.mockResolvedValue([]);
    expect(await repo.findActiveRelationship('vid-1', 'ten-1')).toBeNull();
  });

  // A Tier-2 vendor session is a stateless 7-day HMAC, so this query IS the revocation check that
  // runs on every request. It used to filter on the relationship status alone, which left
  // vendor_identities.is_active enforced nowhere: disabling a vendor network-wide changed nothing
  // until their token expired. $queryRaw is mocked here, so assert on the SQL the repository builds
  // — the predicate is the behaviour, and dropping it again would otherwise pass silently.
  it('findActiveRelationship requires the network identity to still be active', async () => {
    q.mockResolvedValue([relationship]);
    await repo.findActiveRelationship('vid-1', 'ten-1');
    const sql = (q.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toContain('platform.vendor_identities');
    expect(sql.replace(/\s+/g, ' ')).toContain('i.is_active = true');
  });
});

describe('VendorIdentityRepository onModuleDestroy', () => {
  it('disconnects Prisma on shutdown', async () => {
    const r = new VendorIdentityRepository();
    await r.onModuleDestroy();
    expect(
      (r as unknown as { prisma: { $disconnect: jest.Mock } }).prisma.$disconnect,
    ).toHaveBeenCalledTimes(1);
  });
});
