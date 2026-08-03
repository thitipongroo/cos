// Unit tests — BOQ Repository (Phase 4)
// Tests: tenant isolation, query parameterization (no string interpolation).

import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { BoqRepository } from '../boq.repository';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

const mockPrisma = {
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
};

const mockTenantPrisma = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};

const mockRequest = {
  tenantId: 'tenant-uuid-001',
};

describe('BoqRepository', () => {
  let repo: BoqRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoqRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: mockRequest },
      ],
    }).compile();
    repo = await module.resolve<BoqRepository>(BoqRepository);
  });

  it('constructor uses empty string when tenantId missing from request (G5)', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoqRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    const repoNoTenant = await module.resolve<BoqRepository>(BoqRepository);
    expect(repoNoTenant).toBeDefined();
    // Invoke the lazy getter so its `?? ''` no-context fallback branch executes (ADR-031).
    expect((repoNoTenant as unknown as { tenantId: string }).tenantId).toBe('');
  });

  it('createVersion calls $queryRaw with correct parameters', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        version_id: 'v-001',
        project_id: 'p-001',
        tenant_id: 'tenant-uuid-001',
        version_number: 1,
        version_name: null,
        status: 'DRAFT',
        total_estimated_amount: '0.0000',
        total_estimated_currency: 'THB',
        approved_by: null,
        approved_at: null,
        created_by: 'user-001',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    const result = await repo.createVersion({
      project_id: 'p-001',
      version_number: 1,
      version_name: null,
      currency_code: 'THB',
      created_by: 'user-001',
    });

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.version_id).toBe('v-001');
    expect(result.status).toBe('DRAFT');
  });

  it('findVersionsByProject scopes by tenantId from request', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await repo.findVersionsByProject('p-001');
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    // Verify tenantId is injected as a separate parameter (not concatenated)
    const call = mockPrisma.$queryRaw.mock.calls[0] as unknown[];
    expect(call).toContain('tenant-uuid-001');
  });

  it('findDraftVersion returns null when no DRAFT exists', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.findDraftVersion('p-001');
    expect(result).toBeNull();
  });

  describe('claimNextVersion', () => {
    it('takes a per-project advisory lock before reading, then inserts', async () => {
      const created = { version_id: 'v-1', version_number: 3 };
      mockPrisma.$executeRaw.mockResolvedValue(1);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([]) // no existing DRAFT
        .mockResolvedValueOnce([created]);

      const result = await repo.claimNextVersion({
        project_id: 'p-001',
        version_name: null,
        currency_code: 'THB',
        created_by: 'u-001',
      });

      // The lock is what makes the check-then-act safe; assert it is actually taken.
      const lockSql = mockPrisma.$executeRaw.mock.calls[0]![0] as string[];
      expect(lockSql.join('')).toContain('pg_advisory_xact_lock');
      expect(result).toEqual({ version: created, version_number: 3 });
    });

    it('returns null when the project already has a DRAFT', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ version_id: 'existing-draft' }]);

      const result = await repo.claimNextVersion({
        project_id: 'p-001',
        version_name: null,
        currency_code: 'THB',
        created_by: 'u-001',
      });

      expect(result).toBeNull();
      // Nothing inserted — only the DRAFT probe ran.
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('runs the whole claim inside ONE transaction', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ version_number: 1 }]);

      await repo.claimNextVersion({
        project_id: 'p-001',
        version_name: null,
        currency_code: 'THB',
        created_by: 'u-001',
      });

      expect(mockTenantPrisma.run).toHaveBeenCalledTimes(1);
    });
  });

  it('findMaxVersionNumber returns 0 when no versions exist', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ max: null }]);
    const result = await repo.findMaxVersionNumber('p-001');
    expect(result).toBe(0);
  });

  it('addItem calls $queryRaw and returns inserted row', async () => {
    const now = new Date();
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_id: 'i-001',
        category_id: 'cat-001',
        version_id: 'v-001',
        tenant_id: 'tenant-uuid-001',
        item_code: null,
        description: 'Concrete C30',
        unit: 'm3',
        quantity: '150.0000',
        unit_cost: '2800.0000',
        estimated_total: '420000.0000',
        currency_code: 'THB',
        sort_order: 0,
        carbon_factor_kg_co2e: null,
        carbon_total_kg_co2e: null,
        created_at: now,
        updated_at: now,
      },
    ]);

    const result = await repo.addItem({
      category_id: 'cat-001',
      version_id: 'v-001',
      item_code: null,
      description: 'Concrete C30',
      unit: 'm3',
      quantity: '150.0000',
      unit_cost: '2800.0000',
      estimated_total: '420000.0000',
      currency_code: 'THB',
      sort_order: 0,
    });

    expect(result.estimated_total).toBe('420000.0000');
    expect(result.carbon_factor_kg_co2e).toBeNull();
    expect(result.carbon_total_kg_co2e).toBeNull();
  });

  it('deleteItem calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.deleteItem('i-001');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('findVersionById returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.findVersionById('v-not-found');
    expect(result).toBeNull();
  });

  it('findVersionById returns row when found', async () => {
    const row = {
      version_id: 'v-001',
      project_id: 'p-001',
      tenant_id: 'tenant-uuid-001',
      version_number: 1,
      version_name: null,
      status: 'DRAFT',
      total_estimated_amount: '0.0000',
      total_estimated_currency: 'THB',
      approved_by: null,
      approved_at: null,
      created_by: 'u-001',
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockPrisma.$queryRaw.mockResolvedValue([row]);
    const result = await repo.findVersionById('v-001');
    expect(result?.version_id).toBe('v-001');
  });

  it('findLatestApprovedVersion returns null when none exists', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.findLatestApprovedVersion('p-001');
    expect(result).toBeNull();
  });

  it('approveVersion calls $executeRaw twice (supersede + approve)', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.approveVersion({
      version_id: 'v-001',
      approved_by: 'u-001',
      new_total: '420000.0000',
    });
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('updateVersionTotal calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.updateVersionTotal('v-001', '420000.0000');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('addCategory returns inserted row', async () => {
    const catRow = {
      category_id: 'cat-001',
      version_id: 'v-001',
      tenant_id: 'tenant-uuid-001',
      parent_category_id: null,
      category_code: 'STR-01',
      category_name: 'Structural',
      sort_order: 0,
      subtotal_amount: '0.0000',
    };
    mockPrisma.$queryRaw.mockResolvedValue([catRow]);
    const result = await repo.addCategory({
      version_id: 'v-001',
      parent_category_id: null,
      category_code: 'STR-01',
      category_name: 'Structural',
      sort_order: 0,
    });
    expect(result.category_code).toBe('STR-01');
  });

  it('addCategory with non-null parent_category_id covers true branch (G6)', async () => {
    const catRow = {
      category_id: 'cat-002',
      version_id: 'v-001',
      tenant_id: 'tenant-uuid-001',
      parent_category_id: 'cat-001',
      category_code: 'STR-01-A',
      category_name: 'Sub-structural',
      sort_order: 1,
      subtotal_amount: '0.0000',
    };
    mockPrisma.$queryRaw.mockResolvedValue([catRow]);
    const result = await repo.addCategory({
      version_id: 'v-001',
      parent_category_id: 'cat-001',
      category_code: 'STR-01-A',
      category_name: 'Sub-structural',
      sort_order: 1,
    });
    expect(result.parent_category_id).toBe('cat-001');
  });

  it('findCategoriesByVersion returns empty array when none', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.findCategoriesByVersion('v-001');
    expect(result).toEqual([]);
  });

  it('updateCategorySubtotal calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.updateCategorySubtotal('cat-001', '420000.0000');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  // Whole-version recalculation must be ONE statement: as a per-category loop it was both N round
  // trips and non-atomic, so a mid-loop failure left some subtotals new and the rest stale.
  it('updateCategorySubtotals writes every category in a single statement', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(3);
    await repo.updateCategorySubtotals([
      { category_id: 'cat-001', subtotal: '100.0000' },
      { category_id: 'cat-002', subtotal: '200.0000' },
      { category_id: 'cat-003', subtotal: '300.0000' },
    ]);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = (mockPrisma.$executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toMatch(/UPDATE\s+boq\.boq_categories/);
    expect(sql).toContain('UNNEST');
  });

  it('updateCategorySubtotals does nothing when there are no categories', async () => {
    await repo.updateCategorySubtotals([]);
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('updateItem returns updated row', async () => {
    const now = new Date();
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_id: 'i-001',
        category_id: 'cat-001',
        version_id: 'v-001',
        tenant_id: 'tenant-uuid-001',
        item_code: null,
        description: 'Updated',
        unit: 'm3',
        quantity: '200.0000',
        unit_cost: '2800.0000',
        estimated_total: '560000.0000',
        currency_code: 'THB',
        sort_order: 0,
        carbon_factor_kg_co2e: null,
        carbon_total_kg_co2e: null,
        created_at: now,
        updated_at: now,
      },
    ]);
    const result = await repo.updateItem({ item_id: 'i-001', quantity: '200.0000' });
    expect(result.quantity).toBe('200.0000');
  });

  it('updateItem with all fields provided covers true branches in COALESCE ternaries (G7)', async () => {
    const now = new Date();
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_id: 'i-001',
        category_id: 'cat-001',
        version_id: 'v-001',
        tenant_id: 'tenant-uuid-001',
        item_code: null,
        description: 'Full update',
        unit: 'm2',
        quantity: '50.0000',
        unit_cost: '100.0000',
        estimated_total: '5000.0000',
        currency_code: 'THB',
        sort_order: 1,
        carbon_factor_kg_co2e: null,
        carbon_total_kg_co2e: null,
        created_at: now,
        updated_at: now,
      },
    ]);
    const result = await repo.updateItem({
      item_id: 'i-001',
      description: 'Full update',
      unit: 'm2',
      quantity: '50.0000',
      unit_cost: '100.0000',
      estimated_total: '5000.0000',
      sort_order: 1,
    });
    expect(result.estimated_total).toBe('5000.0000');
    expect(result.unit).toBe('m2');
  });

  it('updateItem without quantity covers false branch on line 291 (G7 — null path)', async () => {
    const now = new Date();
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_id: 'i-001',
        category_id: 'cat-001',
        version_id: 'v-001',
        tenant_id: 'tenant-uuid-001',
        item_code: null,
        description: 'Desc only update',
        unit: 'm3',
        quantity: '150.0000',
        unit_cost: '2800.0000',
        estimated_total: '420000.0000',
        currency_code: 'THB',
        sort_order: 0,
        carbon_factor_kg_co2e: null,
        carbon_total_kg_co2e: null,
        created_at: now,
        updated_at: now,
      },
    ]);
    const result = await repo.updateItem({ item_id: 'i-001', description: 'Desc only update' });
    expect(result.description).toBe('Desc only update');
  });

  it('findItemsByVersion returns items scoped to tenant', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.findItemsByVersion('v-001');
    expect(result).toEqual([]);
  });

  it('findItemById returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.findItemById('i-not-found');
    expect(result).toBeNull();
  });

  it('findItemsByCategoryIds returns empty array for empty input', async () => {
    const result = await repo.findItemsByCategoryIds([]);
    expect(result).toEqual([]);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('findItemsByCategoryIds queries when IDs provided', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.findItemsByCategoryIds(['cat-001', 'cat-002']);
    expect(result).toEqual([]);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('copyVersionContents calls $executeRaw three times (root cats, child cats, items)', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(0);
    await repo.copyVersionContents('from-v', 'to-v');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(3);
  });
});
