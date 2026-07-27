// AiUsageService — quota resolution (§26) + budget bands (§31.3 / COST-001). Pure logic: the DB (sum)
// and the plan lookup are mocked, so these assert the metering rules, not Postgres.

jest.mock('../../../shared/context/cls-context', () => ({
  clsTenantId: () => 'tenant-1',
}));

import { AiUsageService } from '../ai-usage.service';

const mockPrisma = {
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn().mockResolvedValue(1),
};
const mockDb = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};
const mockTenants = { getPlanType: jest.fn() };

function makeService(): AiUsageService {
  return new AiUsageService(mockDb as never, mockTenants as never);
}

function usedRows(n: number): void {
  mockPrisma.$queryRaw.mockResolvedValue([{ used: BigInt(n) }]);
}

describe('AiUsageService.getUsage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('STARTER quota is 500K; 100K used → 20 %, no alert', async () => {
    usedRows(100_000);
    mockTenants.getPlanType.mockResolvedValue('STARTER');
    const r = await makeService().getUsage();
    expect(r.quota).toBe(500_000);
    expect(r.tokensUsed).toBe(100_000);
    expect(r.percentUsed).toBe(20);
    expect(r.alertLevel).toBe('none');
    expect(r.periodMonth).toMatch(/^\d{4}-\d{2}$/);
  });

  it('STARTER at exactly 80 % → warning (§31.3 soft alert)', async () => {
    usedRows(400_000);
    mockTenants.getPlanType.mockResolvedValue('STARTER');
    const r = await makeService().getUsage();
    expect(r.percentUsed).toBe(80);
    expect(r.alertLevel).toBe('warning');
  });

  it('STARTER at 79 % → still none (below the soft threshold)', async () => {
    usedRows(395_000); // 79 %
    mockTenants.getPlanType.mockResolvedValue('STARTER');
    const r = await makeService().getUsage();
    expect(r.percentUsed).toBe(79);
    expect(r.alertLevel).toBe('none');
  });

  it('STARTER at 100 % → critical (§22.10 hard cap)', async () => {
    usedRows(500_000);
    mockTenants.getPlanType.mockResolvedValue('STARTER');
    const r = await makeService().getUsage();
    expect(r.percentUsed).toBe(100);
    expect(r.alertLevel).toBe('critical');
  });

  it('PROFESSIONAL quota is 5M', async () => {
    usedRows(1_000_000);
    mockTenants.getPlanType.mockResolvedValue('PROFESSIONAL');
    const r = await makeService().getUsage();
    expect(r.quota).toBe(5_000_000);
    expect(r.percentUsed).toBe(20);
    expect(r.alertLevel).toBe('none');
  });

  it('ENTERPRISE is uncapped → quota/percent null, no alert', async () => {
    usedRows(9_000_000);
    mockTenants.getPlanType.mockResolvedValue('ENTERPRISE');
    const r = await makeService().getUsage();
    expect(r.quota).toBeNull();
    expect(r.percentUsed).toBeNull();
    expect(r.alertLevel).toBe('none');
    expect(r.tokensUsed).toBe(9_000_000);
  });

  it('no usage rows → 0 tokens', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockTenants.getPlanType.mockResolvedValue('STARTER');
    const r = await makeService().getUsage();
    expect(r.tokensUsed).toBe(0);
    expect(r.percentUsed).toBe(0);
  });
});

describe('AiUsageService.recordUsage / isOverHardCap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('recordUsage upserts via $executeRaw', async () => {
    await makeService().recordUsage('gpt-4o-mini', 120, 30);
    expect(mockDb.run).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('isOverHardCap true at 100 %+, false below', async () => {
    mockTenants.getPlanType.mockResolvedValue('STARTER');
    usedRows(500_000);
    expect(await makeService().isOverHardCap()).toBe(true);
    usedRows(400_000);
    expect(await makeService().isOverHardCap()).toBe(false);
  });

  it('ENTERPRISE is never over the hard cap (uncapped)', async () => {
    mockTenants.getPlanType.mockResolvedValue('ENTERPRISE');
    usedRows(99_000_000);
    expect(await makeService().isOverHardCap()).toBe(false);
  });
});
