// Unit tests — Master Data Controller (Priority 0 Section D)
// Tests: delegation to service, HTTP method wiring, void return on DELETE.

import { Test } from '@nestjs/testing';
import { MasterDataController } from '../master-data.controller';
import { MasterDataService } from '../master-data.service';
import type {
  MaterialRow,
  WorkCategoryRow,
  IssueCategoryRow,
  CostCategoryRow,
} from '../master-data.repository';
import { MaterialCategory, MaterialUnit } from '../dto/create-material.dto';
import { IssueSeverityDefault } from '../dto/create-issue-category.dto';
import { CostCategoryType } from '../dto/create-cost-category.dto';

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

const mockSvc = {
  listMaterials: jest.fn(),
  createMaterial: jest.fn(),
  updateMaterial: jest.fn(),
  deleteMaterial: jest.fn(),
  listWorkCategories: jest.fn(),
  createWorkCategory: jest.fn(),
  updateWorkCategory: jest.fn(),
  listIssueCategories: jest.fn(),
  createIssueCategory: jest.fn(),
  listCostCategories: jest.fn(),
  createCostCategory: jest.fn(),
};

describe('MasterDataController', () => {
  let ctrl: MasterDataController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [MasterDataController],
      providers: [{ provide: MasterDataService, useValue: mockSvc }],
    }).compile();
    ctrl = module.get(MasterDataController);
  });

  // ── Materials ──────────────────────────────────────────────────────────

  describe('listMaterials', () => {
    it('returns materials from service', async () => {
      mockSvc.listMaterials.mockResolvedValue([materialRow]);
      const result = await ctrl.listMaterials();
      expect(result).toEqual([materialRow]);
      expect(mockSvc.listMaterials).toHaveBeenCalledTimes(1);
    });
  });

  describe('createMaterial', () => {
    it('delegates to service and returns new row', async () => {
      mockSvc.createMaterial.mockResolvedValue(materialRow);
      const dto = {
        name: 'Ready Mix Concrete',
        category: MaterialCategory.CONCRETE,
        unit: MaterialUnit.M3,
      };
      const result = await ctrl.createMaterial(dto);
      expect(result).toEqual(materialRow);
      expect(mockSvc.createMaterial).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateMaterial', () => {
    it('delegates to service and returns updated row', async () => {
      mockSvc.updateMaterial.mockResolvedValue({ ...materialRow, name: 'Updated' });
      const result = await ctrl.updateMaterial('mat-uuid-001', { name: 'Updated' });
      expect(result.name).toBe('Updated');
      expect(mockSvc.updateMaterial).toHaveBeenCalledWith('mat-uuid-001', { name: 'Updated' });
    });
  });

  describe('deleteMaterial', () => {
    it('delegates to service and returns void', async () => {
      mockSvc.deleteMaterial.mockResolvedValue(undefined);
      await expect(ctrl.deleteMaterial('mat-uuid-001')).resolves.toBeUndefined();
      expect(mockSvc.deleteMaterial).toHaveBeenCalledWith('mat-uuid-001');
    });
  });

  // ── Work Categories ────────────────────────────────────────────────────

  describe('listWorkCategories', () => {
    it('returns work categories from service', async () => {
      mockSvc.listWorkCategories.mockResolvedValue([workCategoryRow]);
      const result = await ctrl.listWorkCategories();
      expect(result).toEqual([workCategoryRow]);
    });
  });

  describe('createWorkCategory', () => {
    it('delegates to service and returns new row', async () => {
      mockSvc.createWorkCategory.mockResolvedValue(workCategoryRow);
      const dto = { name: 'Earthwork', code: 'EARTHWORK' };
      const result = await ctrl.createWorkCategory(dto);
      expect(result).toEqual(workCategoryRow);
      expect(mockSvc.createWorkCategory).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateWorkCategory', () => {
    it('delegates to service and returns updated row', async () => {
      mockSvc.updateWorkCategory.mockResolvedValue({ ...workCategoryRow, name: 'Updated' });
      const result = await ctrl.updateWorkCategory('wc-uuid-001', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  // ── Issue Categories ───────────────────────────────────────────────────

  describe('listIssueCategories', () => {
    it('returns issue categories from service', async () => {
      mockSvc.listIssueCategories.mockResolvedValue([issueCategoryRow]);
      const result = await ctrl.listIssueCategories();
      expect(result).toEqual([issueCategoryRow]);
    });
  });

  describe('createIssueCategory', () => {
    it('delegates to service and returns new row', async () => {
      mockSvc.createIssueCategory.mockResolvedValue(issueCategoryRow);
      const dto = { name: 'Safety', severity_default: IssueSeverityDefault.HIGH };
      const result = await ctrl.createIssueCategory(dto);
      expect(result).toEqual(issueCategoryRow);
      expect(mockSvc.createIssueCategory).toHaveBeenCalledWith(dto);
    });
  });

  // ── Cost Categories ────────────────────────────────────────────────────

  describe('listCostCategories', () => {
    it('returns cost categories from service', async () => {
      mockSvc.listCostCategories.mockResolvedValue([costCategoryRow]);
      const result = await ctrl.listCostCategories();
      expect(result).toEqual([costCategoryRow]);
    });
  });

  describe('createCostCategory', () => {
    it('delegates to service and returns new row', async () => {
      mockSvc.createCostCategory.mockResolvedValue(costCategoryRow);
      const dto = { name: 'Material', type: CostCategoryType.MATERIAL };
      const result = await ctrl.createCostCategory(dto);
      expect(result).toEqual(costCategoryRow);
      expect(mockSvc.createCostCategory).toHaveBeenCalledWith(dto);
    });
  });
});
