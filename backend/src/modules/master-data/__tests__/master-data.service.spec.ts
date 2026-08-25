// Unit tests — Master Data Service (Priority 0 Section D)
// Tests: CRUD delegation, conflict detection, not-found handling, logger calls.

import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { MasterDataService } from '../master-data.service';
import { MasterDataRepository } from '../master-data.repository';
import type {
  MaterialRow,
  WorkCategoryRow,
  IssueCategoryRow,
  CostCategoryRow,
} from '../master-data.repository';
import { MaterialCategory, MaterialUnit } from '../dto/create-material.dto';
import { IssueSeverityDefault } from '../dto/create-issue-category.dto';
import { CostCategoryType } from '../dto/create-cost-category.dto';

jest.mock('@cos/logger', () => ({ createLogger: () => ({ info: jest.fn(), error: jest.fn() }) }));

const now = new Date();

// ── Fixtures ───────────────────────────────────────────────────────────────

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

const mockRepo = {
  listMaterials: jest.fn(),
  createMaterial: jest.fn(),
  updateMaterial: jest.fn(),
  deleteMaterial: jest.fn(),
  getMaterialById: jest.fn(),
  listWorkCategories: jest.fn(),
  createWorkCategory: jest.fn(),
  updateWorkCategory: jest.fn(),
  getWorkCategoryById: jest.fn(),
  listIssueCategories: jest.fn(),
  createIssueCategory: jest.fn(),
  listCostCategories: jest.fn(),
  createCostCategory: jest.fn(),
};

const mockRequest = { userId: 'user-uuid-001' };
const mockRequestNoUser = {};

/**
 * The error a duplicate ACTUALLY produces on this path.
 *
 * Every write in master-data.repository goes through `tx.$queryRaw`, and Prisma 7 on a driver
 * adapter wraps a failed raw query as P2010 with the driver's SQLSTATE nested underneath. The old
 * factory set `err.code = '23505'` at the top level — a shape this path never yields — so the tests
 * below passed against a service whose catch sites could not fire in production. Copied from a real
 * failure captured in the equipment integration suite.
 */
function uniqueError(): Error & { code: string; meta: unknown } {
  const err = new Error('unique constraint') as Error & { code: string; meta: unknown };
  err.code = 'P2010';
  err.meta = {
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: {
        kind: 'UniqueConstraintViolation',
        originalCode: '23505',
        originalMessage: 'duplicate key value violates unique constraint',
      },
    },
  };
  return err;
}

/** The plain driver shape, for a caller that is not on the Prisma raw path. */
function plainUniqueError(): Error & { code: string } {
  const err = new Error('unique constraint') as Error & { code: string };
  err.code = '23505';
  return err;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MasterDataService', () => {
  let svc: MasterDataService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MasterDataService,
        { provide: MasterDataRepository, useValue: mockRepo },
        { provide: REQUEST, useValue: mockRequest },
      ],
    }).compile();
    svc = await module.resolve(MasterDataService);
  });

  // ── Materials ──────────────────────────────────────────────────────────

  describe('listMaterials', () => {
    it('delegates to repo and returns list', async () => {
      mockRepo.listMaterials.mockResolvedValue([materialRow]);
      const result = await svc.listMaterials();
      expect(result).toEqual([materialRow]);
      expect(mockRepo.listMaterials).toHaveBeenCalledTimes(1);
    });
  });

  describe('createMaterial', () => {
    it('returns created row on success', async () => {
      mockRepo.createMaterial.mockResolvedValue(materialRow);
      const result = await svc.createMaterial({
        name: 'Ready Mix Concrete',
        category: MaterialCategory.CONCRETE,
        unit: MaterialUnit.M3,
      });
      expect(result).toEqual(materialRow);
      expect(mockRepo.createMaterial).toHaveBeenCalledWith(
        { name: 'Ready Mix Concrete', category: MaterialCategory.CONCRETE, unit: MaterialUnit.M3 },
        'user-uuid-001',
      );
    });

    it('throws ConflictException on unique violation', async () => {
      mockRepo.createMaterial.mockRejectedValue(uniqueError());
      await expect(
        svc.createMaterial({
          name: 'Dup',
          category: MaterialCategory.STEEL,
          unit: MaterialUnit.KG,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recognises the plain driver shape too, not only the Prisma wrapper', async () => {
      // A caller off the Prisma raw path reports SQLSTATE at the top level. Both shapes must map to
      // 409 — narrowing the check to whichever one the tests happened to fabricate is how this went
      // wrong the first time.
      mockRepo.createMaterial.mockRejectedValue(plainUniqueError());
      await expect(
        svc.createMaterial({
          name: 'Dup',
          category: MaterialCategory.STEEL,
          unit: MaterialUnit.KG,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('re-throws non-unique errors', async () => {
      const dbErr = new Error('connection lost');
      mockRepo.createMaterial.mockRejectedValue(dbErr);
      await expect(
        svc.createMaterial({
          name: 'X',
          category: MaterialCategory.OTHER,
          unit: MaterialUnit.UNIT,
        }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('updateMaterial', () => {
    it('returns updated row when found', async () => {
      mockRepo.updateMaterial.mockResolvedValue({ ...materialRow, name: 'Updated' });
      const result = await svc.updateMaterial('mat-uuid-001', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('throws NotFoundException when not found', async () => {
      mockRepo.updateMaterial.mockResolvedValue(null);
      await expect(svc.updateMaterial('mat-uuid-999', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ConflictException on unique violation during update', async () => {
      mockRepo.updateMaterial.mockRejectedValue(uniqueError());
      await expect(svc.updateMaterial('mat-uuid-001', { name: 'Dup' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('deleteMaterial', () => {
    it('completes without error when material found', async () => {
      mockRepo.deleteMaterial.mockResolvedValue(true);
      await expect(svc.deleteMaterial('mat-uuid-001')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when material not found', async () => {
      mockRepo.deleteMaterial.mockResolvedValue(false);
      await expect(svc.deleteMaterial('mat-uuid-999')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── Work Categories ────────────────────────────────────────────────────

  describe('listWorkCategories', () => {
    it('delegates to repo', async () => {
      mockRepo.listWorkCategories.mockResolvedValue([workCategoryRow]);
      const result = await svc.listWorkCategories();
      expect(result).toEqual([workCategoryRow]);
    });
  });

  describe('createWorkCategory', () => {
    it('returns created row on success', async () => {
      mockRepo.createWorkCategory.mockResolvedValue(workCategoryRow);
      const result = await svc.createWorkCategory({ name: 'Earthwork', code: 'EARTHWORK' });
      expect(result).toEqual(workCategoryRow);
    });

    it('throws ConflictException on unique violation', async () => {
      mockRepo.createWorkCategory.mockRejectedValue(uniqueError());
      await expect(
        svc.createWorkCategory({ name: 'Earthwork', code: 'EARTHWORK' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('re-throws non-unique errors', async () => {
      mockRepo.createWorkCategory.mockRejectedValue(new Error('db error'));
      await expect(svc.createWorkCategory({ name: 'X', code: 'X' })).rejects.toThrow('db error');
    });
  });

  describe('updateWorkCategory', () => {
    it('returns updated row', async () => {
      mockRepo.updateWorkCategory.mockResolvedValue({ ...workCategoryRow, name: 'Updated' });
      const result = await svc.updateWorkCategory('wc-uuid-001', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('throws NotFoundException when not found', async () => {
      mockRepo.updateWorkCategory.mockResolvedValue(null);
      await expect(svc.updateWorkCategory('wc-uuid-999', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── Issue Categories ───────────────────────────────────────────────────

  describe('listIssueCategories', () => {
    it('delegates to repo', async () => {
      mockRepo.listIssueCategories.mockResolvedValue([issueCategoryRow]);
      const result = await svc.listIssueCategories();
      expect(result).toEqual([issueCategoryRow]);
    });
  });

  describe('createIssueCategory', () => {
    it('returns created row', async () => {
      mockRepo.createIssueCategory.mockResolvedValue(issueCategoryRow);
      const result = await svc.createIssueCategory({
        name: 'Safety',
        severity_default: IssueSeverityDefault.HIGH,
      });
      expect(result).toEqual(issueCategoryRow);
    });

    it('throws ConflictException on unique violation', async () => {
      mockRepo.createIssueCategory.mockRejectedValue(uniqueError());
      await expect(svc.createIssueCategory({ name: 'Safety' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('re-throws non-unique errors', async () => {
      mockRepo.createIssueCategory.mockRejectedValue(new Error('db error'));
      await expect(svc.createIssueCategory({ name: 'X' })).rejects.toThrow('db error');
    });
  });

  // ── userId fallback when request.user is absent ────────────────────────

  describe('userId fallback', () => {
    it('falls back to empty string when request has no user', async () => {
      const module = await Test.createTestingModule({
        providers: [
          MasterDataService,
          { provide: MasterDataRepository, useValue: mockRepo },
          { provide: REQUEST, useValue: mockRequestNoUser },
        ],
      }).compile();
      const noUserSvc = await module.resolve(MasterDataService);
      mockRepo.listMaterials.mockResolvedValue([]);
      // Service constructs with userId = '' — no error thrown
      await expect(noUserSvc.listMaterials()).resolves.toEqual([]);
      // exercise the userId getter's `|| clsUserId()` fallback branch (no request.userId, no CLS → '')
      expect((noUserSvc as unknown as { userId: string }).userId).toBe('');
    });
  });

  // ── Cost Categories ────────────────────────────────────────────────────

  describe('listCostCategories', () => {
    it('delegates to repo', async () => {
      mockRepo.listCostCategories.mockResolvedValue([costCategoryRow]);
      const result = await svc.listCostCategories();
      expect(result).toEqual([costCategoryRow]);
    });
  });

  describe('createCostCategory', () => {
    it('returns created row', async () => {
      mockRepo.createCostCategory.mockResolvedValue(costCategoryRow);
      const result = await svc.createCostCategory({
        name: 'Material',
        type: CostCategoryType.MATERIAL,
      });
      expect(result).toEqual(costCategoryRow);
    });

    it('throws ConflictException on unique violation', async () => {
      mockRepo.createCostCategory.mockRejectedValue(uniqueError());
      await expect(
        svc.createCostCategory({ name: 'Material', type: CostCategoryType.MATERIAL }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('re-throws non-unique errors', async () => {
      mockRepo.createCostCategory.mockRejectedValue(new Error('db error'));
      await expect(
        svc.createCostCategory({ name: 'X', type: CostCategoryType.OVERHEAD }),
      ).rejects.toThrow('db error');
    });
  });
});
