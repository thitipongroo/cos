// Unit tests — Master Data Repository (Priority 0 Section D)
// Tests: query delegation, RLS context, null-return handling.

import { Test } from '@nestjs/testing';
import { MasterDataRepository } from '../master-data.repository';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import type {
  MaterialRow,
  WorkCategoryRow,
  IssueCategoryRow,
  CostCategoryRow,
} from '../master-data.repository';
import { MaterialCategory, MaterialUnit } from '../dto/create-material.dto';
import { IssueSeverityDefault } from '../dto/create-issue-category.dto';
import { CostCategoryType } from '../dto/create-cost-category.dto';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockTx = {
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
  $queryRawUnsafe: jest.fn(),
};

const mockTenantPrisma = {
  run: jest.fn((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
};

// ── Fixtures ───────────────────────────────────────────────────────────────

const now = new Date();

const materialRow: MaterialRow = {
  material_id: 'mat-uuid-001',
  tenant_id: 'tenant-uuid-001',
  name: 'Ready Mix Concrete',
  category: 'CONCRETE',
  unit: 'M3',
  is_active: true,
  created_by: 'user-uuid-001',
  created_at: now,
  updated_at: now,
};

const workCategoryRow: WorkCategoryRow = {
  work_category_id: 'wc-uuid-001',
  tenant_id: 'tenant-uuid-001',
  name: 'Earthwork',
  code: 'EARTHWORK',
  phase: 'Site Preparation',
  is_active: true,
  created_by: 'user-uuid-001',
  created_at: now,
  updated_at: now,
};

const issueCategoryRow: IssueCategoryRow = {
  issue_category_id: 'ic-uuid-001',
  tenant_id: 'tenant-uuid-001',
  name: 'Safety',
  severity_default: 'HIGH',
  is_active: true,
  created_by: 'user-uuid-001',
  created_at: now,
  updated_at: now,
};

const costCategoryRow: CostCategoryRow = {
  cost_category_id: 'cc-uuid-001',
  tenant_id: 'tenant-uuid-001',
  name: 'Material',
  type: 'MATERIAL',
  is_active: true,
  created_by: 'user-uuid-001',
  created_at: now,
  updated_at: now,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MasterDataRepository', () => {
  let repo: MasterDataRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MasterDataRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
      ],
    }).compile();
    repo = await module.resolve(MasterDataRepository);
  });

  // ── Materials ──────────────────────────────────────────────────────────

  describe('listMaterials', () => {
    it('returns rows from $queryRaw', async () => {
      mockTx.$queryRaw.mockResolvedValue([materialRow]);
      const result = await repo.listMaterials();
      expect(result).toEqual([materialRow]);
      expect(mockTenantPrisma.run).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no materials', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);
      const result = await repo.listMaterials();
      expect(result).toEqual([]);
    });
  });

  describe('createMaterial', () => {
    it('returns the created row', async () => {
      mockTx.$queryRaw.mockResolvedValue([materialRow]);
      const result = await repo.createMaterial(
        { name: 'Ready Mix Concrete', category: MaterialCategory.CONCRETE, unit: MaterialUnit.M3 },
        'user-uuid-001',
      );
      expect(result).toEqual(materialRow);
    });
  });

  describe('getMaterialById', () => {
    it('returns row when found', async () => {
      mockTx.$queryRaw.mockResolvedValue([materialRow]);
      const result = await repo.getMaterialById('mat-uuid-001');
      expect(result).toEqual(materialRow);
    });

    it('returns null when not found', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);
      const result = await repo.getMaterialById('mat-uuid-999');
      expect(result).toBeNull();
    });
  });

  describe('updateMaterial', () => {
    it('returns updated row via $queryRawUnsafe when name provided', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValue([{ ...materialRow, name: 'Updated' }]);
      const result = await repo.updateMaterial('mat-uuid-001', { name: 'Updated' });
      expect(result?.name).toBe('Updated');
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('includes category in SET clause when provided', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValue([{ ...materialRow, category: 'STEEL' }]);
      const result = await repo.updateMaterial('mat-uuid-001', {
        category: MaterialCategory.STEEL,
      });
      expect(result?.category).toBe('STEEL');
    });

    it('includes unit in SET clause when provided', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValue([{ ...materialRow, unit: 'KG' }]);
      const result = await repo.updateMaterial('mat-uuid-001', { unit: MaterialUnit.KG });
      expect(result?.unit).toBe('KG');
    });

    it('includes is_active in SET clause when provided', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValue([{ ...materialRow, is_active: false }]);
      const result = await repo.updateMaterial('mat-uuid-001', { is_active: false });
      expect(result?.is_active).toBe(false);
    });

    it('calls getMaterialById when dto is empty (no fields to set)', async () => {
      mockTx.$queryRaw.mockResolvedValue([materialRow]);
      const result = await repo.updateMaterial('mat-uuid-001', {});
      expect(result).toEqual(materialRow);
      expect(mockTx.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('returns null when material not found after update', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValue([]);
      const result = await repo.updateMaterial('mat-uuid-999', { name: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('deleteMaterial', () => {
    it('returns true when soft-delete succeeds', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ material_id: 'mat-uuid-001' }]);
      const result = await repo.deleteMaterial('mat-uuid-001');
      expect(result).toBe(true);
    });

    it('returns false when material not found or already inactive', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);
      const result = await repo.deleteMaterial('mat-uuid-999');
      expect(result).toBe(false);
    });
  });

  // ── Work Categories ────────────────────────────────────────────────────

  describe('listWorkCategories', () => {
    it('returns rows from $queryRaw', async () => {
      mockTx.$queryRaw.mockResolvedValue([workCategoryRow]);
      const result = await repo.listWorkCategories();
      expect(result).toEqual([workCategoryRow]);
    });
  });

  describe('createWorkCategory', () => {
    it('returns the created row', async () => {
      mockTx.$queryRaw.mockResolvedValue([workCategoryRow]);
      const result = await repo.createWorkCategory(
        { name: 'Earthwork', code: 'EARTHWORK', phase: 'Site Preparation' },
        'user-uuid-001',
      );
      expect(result).toEqual(workCategoryRow);
    });

    it('inserts null phase when phase not provided', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ ...workCategoryRow, phase: null }]);
      const result = await repo.createWorkCategory(
        { name: 'Earthwork', code: 'EARTHWORK' },
        'user-uuid-001',
      );
      expect(result.phase).toBeNull();
    });
  });

  describe('getWorkCategoryById', () => {
    it('returns null when not found', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);
      const result = await repo.getWorkCategoryById('wc-uuid-999');
      expect(result).toBeNull();
    });
  });

  describe('updateWorkCategory', () => {
    it('calls getMaterialById-equivalent when dto is empty', async () => {
      mockTx.$queryRaw.mockResolvedValue([workCategoryRow]);
      const result = await repo.updateWorkCategory('wc-uuid-001', {});
      expect(result).toEqual(workCategoryRow);
      expect(mockTx.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('returns null when work category not found after update', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValue([]);
      const result = await repo.updateWorkCategory('wc-uuid-999', { name: 'X' });
      expect(result).toBeNull();
    });

    it('returns updated row via $queryRawUnsafe', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValue([{ ...workCategoryRow, name: 'Updated' }]);
      const result = await repo.updateWorkCategory('wc-uuid-001', { name: 'Updated' });
      expect(result?.name).toBe('Updated');
    });

    it('includes phase in SET clause when provided', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValue([{ ...workCategoryRow, phase: 'New Phase' }]);
      const result = await repo.updateWorkCategory('wc-uuid-001', { phase: 'New Phase' });
      expect(result?.phase).toBe('New Phase');
    });

    it('includes is_active in SET clause when provided', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValue([{ ...workCategoryRow, is_active: false }]);
      const result = await repo.updateWorkCategory('wc-uuid-001', { is_active: false });
      expect(result?.is_active).toBe(false);
    });
  });

  // ── Issue Categories ───────────────────────────────────────────────────

  describe('listIssueCategories', () => {
    it('returns rows from $queryRaw', async () => {
      mockTx.$queryRaw.mockResolvedValue([issueCategoryRow]);
      const result = await repo.listIssueCategories();
      expect(result).toEqual([issueCategoryRow]);
    });
  });

  describe('createIssueCategory', () => {
    it('returns the created row', async () => {
      mockTx.$queryRaw.mockResolvedValue([issueCategoryRow]);
      const result = await repo.createIssueCategory(
        { name: 'Safety', severity_default: IssueSeverityDefault.HIGH },
        'user-uuid-001',
      );
      expect(result).toEqual(issueCategoryRow);
    });

    it('defaults severity_default to MEDIUM when not provided', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ ...issueCategoryRow, severity_default: 'MEDIUM' }]);
      const result = await repo.createIssueCategory({ name: 'Other' }, 'user-uuid-001');
      expect(result.severity_default).toBe('MEDIUM');
    });
  });

  // ── Cost Categories ────────────────────────────────────────────────────

  describe('listCostCategories', () => {
    it('returns rows from $queryRaw', async () => {
      mockTx.$queryRaw.mockResolvedValue([costCategoryRow]);
      const result = await repo.listCostCategories();
      expect(result).toEqual([costCategoryRow]);
    });
  });

  describe('createCostCategory', () => {
    it('returns the created row', async () => {
      mockTx.$queryRaw.mockResolvedValue([costCategoryRow]);
      const result = await repo.createCostCategory(
        { name: 'Material', type: CostCategoryType.MATERIAL },
        'user-uuid-001',
      );
      expect(result).toEqual(costCategoryRow);
    });
  });
});
