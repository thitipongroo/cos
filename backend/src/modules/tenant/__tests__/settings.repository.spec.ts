// Unit tests — Tenant Settings Repository (Phase 2)
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TenantSettingsRepository } from '../settings.repository';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

const mockPrisma = { $queryRaw: jest.fn() };
const mockTenantPrisma = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};

const row = {
  tenant_id: 'tenant-1',
  variance_alert_threshold: '10.00',
  retention_percentage: '5.00',
  line_channel_token: null,
  notifications_enabled: true,
};

describe('TenantSettingsRepository', () => {
  let repo: TenantSettingsRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TenantSettingsRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: { tenantId: 'tenant-1' } },
      ],
    }).compile();
    repo = await moduleRef.resolve<TenantSettingsRepository>(TenantSettingsRepository);
  });

  it('uses empty string tenantId when request has none', async () => {
    const m = await Test.createTestingModule({
      providers: [
        TenantSettingsRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    const noCtx = await m.resolve<TenantSettingsRepository>(TenantSettingsRepository);
    expect(noCtx).toBeDefined();
    // Invoke the lazy getter so its `?? ''` no-context fallback branch executes (ADR-031).
    expect((noCtx as unknown as { tenantId: string }).tenantId).toBe('');
  });

  it('find returns row then null', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([row]);
    expect((await repo.find())?.tenant_id).toBe('tenant-1');
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.find()).toBeNull();
  });

  it('upsert returns the persisted row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([row]);
    const r = await repo.upsert({
      variance_alert_threshold: '12.00',
      retention_percentage: '7.00',
      line_channel_token: 'tok',
      notifications_enabled: false,
    });
    expect(r.tenant_id).toBe('tenant-1');
  });
});
