// Unit tests — Safety Repository (Phase 6)
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { SafetyRepository } from '../safety.repository';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

const mockPrisma = { $queryRaw: jest.fn() };
const mockTenantPrisma = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};

const incidentRow = { incident_id: 'inc-1', tenant_id: 'tenant-1', status: 'OPEN' };
const permitRow = { permit_id: 'perm-1', tenant_id: 'tenant-1', status: 'PENDING' };

describe('SafetyRepository', () => {
  let repo: SafetyRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SafetyRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: { tenantId: 'tenant-1' } },
      ],
    }).compile();
    repo = await moduleRef.resolve<SafetyRepository>(SafetyRepository);
  });

  it('uses empty string tenantId when request has none', async () => {
    const m = await Test.createTestingModule({
      providers: [
        SafetyRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    const noCtx = await m.resolve<SafetyRepository>(SafetyRepository);
    expect(noCtx).toBeDefined();
    expect((noCtx as unknown as { tenantId: string }).tenantId).toBe('');
  });

  it('createIncident with and without task_id', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([incidentRow]);
    expect(
      (
        await repo.createIncident({
          project_id: 'p1',
          incident_type: 'fall',
          severity: 'HIGH',
          reported_by: 'u1',
          task_id: 't1',
        })
      ).incident_id,
    ).toBe('inc-1');
    expect(
      (
        await repo.createIncident({
          project_id: 'p1',
          incident_type: 'fall',
          severity: 'LOW',
          reported_by: 'u1',
        })
      ).incident_id,
    ).toBe('inc-1');
  });

  it('findIncidents returns rows + total (filters), and 0 when count empty', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([incidentRow])
      .mockResolvedValueOnce([{ count: 1n }]);
    expect(
      (
        await repo.findIncidents({
          project_id: 'p1',
          status: 'OPEN',
          severity: 'HIGH',
          page: 1,
          limit: 20,
        })
      ).total,
    ).toBe(1);
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect((await repo.findIncidents({ page: 1, limit: 20 })).total).toBe(0);
  });

  it('findIncidentById returns row then null', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([incidentRow]);
    expect((await repo.findIncidentById('inc-1'))?.incident_id).toBe('inc-1');
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.findIncidentById('x')).toBeNull();
  });

  it('acknowledgeIncident returns updated row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ...incidentRow, status: 'IN_PROGRESS' }]);
    expect((await repo.acknowledgeIncident('inc-1', 'u1')).status).toBe('IN_PROGRESS');
  });

  it('createPermit with and without optionals', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([permitRow]);
    expect(
      (
        await repo.createPermit({
          project_id: 'p1',
          permit_type: 'WORK_PERMIT',
          permit_number: 'WP-1',
          created_by: 'u1',
          linked_task_id: 't1',
          valid_from: '2026-07-01',
          valid_until: '2026-07-31',
        })
      ).permit_id,
    ).toBe('perm-1');
    expect(
      (
        await repo.createPermit({
          project_id: 'p1',
          permit_type: 'WORK_PERMIT',
          permit_number: 'WP-2',
          created_by: 'u1',
        })
      ).permit_id,
    ).toBe('perm-1');
  });

  it('findPermits returns rows + total (filters), and 0 when count empty', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([permitRow]).mockResolvedValueOnce([{ count: 1n }]);
    expect(
      (await repo.findPermits({ project_id: 'p1', status: 'PENDING', page: 1, limit: 20 })).total,
    ).toBe(1);
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect((await repo.findPermits({ page: 1, limit: 20 })).total).toBe(0);
  });

  it('findPermitById returns row then null', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([permitRow]);
    expect((await repo.findPermitById('perm-1'))?.permit_id).toBe('perm-1');
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.findPermitById('x')).toBeNull();
  });

  it('updatePermitStatus returns updated row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ...permitRow, status: 'ACTIVE' }]);
    expect((await repo.updatePermitStatus('perm-1', 'ACTIVE')).status).toBe('ACTIVE');
  });

  it('getComplianceSummary returns counts (with and without project filter)', async () => {
    const summary = {
      open_incidents: 2,
      high_critical_incidents: 1,
      expired_permits: 0,
      revoked_permits: 1,
    };
    mockPrisma.$queryRaw.mockResolvedValue([summary]);
    expect((await repo.getComplianceSummary('p1')).open_incidents).toBe(2);
    expect((await repo.getComplianceSummary()).revoked_permits).toBe(1);
  });
});
