// Unit tests — BOQ Service (Phase 4)
// Focus: calculation accuracy, versioning rules, immutability enforcement, Kafka events.

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { BoqService } from '../boq.service';
import { EventOutboxService } from '../../../shared/events/event-outbox.service';
import { makeOutboxDouble } from '../../../shared/events/__tests__/outbox-double';
import { BoqRepository } from '../boq.repository';
import type { BoqVersionRow, BoqCategoryRow, BoqItemRow } from '../boq.repository';

// ── Mocks ─────────────────────────────────────────────────────────────────
jest.mock('@cos/kafka', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockRepo = {
  createVersion: jest.fn(),
  claimNextVersion: jest.fn(),
  findVersionsByProject: jest.fn(),
  findVersionById: jest.fn(),
  findDraftVersion: jest.fn(),
  findLatestApprovedVersion: jest.fn(),
  findMaxVersionNumber: jest.fn(),
  approveVersion: jest.fn(),
  updateVersionTotal: jest.fn(),
  addCategory: jest.fn(),
  findCategoriesByVersion: jest.fn(),
  updateCategorySubtotal: jest.fn(),
  updateCategorySubtotals: jest.fn(),
  addItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
  findItemsByVersion: jest.fn(),
  findItemById: jest.fn(),
  findItemsByCategoryIds: jest.fn(),
  copyVersionContents: jest.fn(),
};

const mockRequest = {
  tenantId: 'tenant-uuid-001',
  // userId is what services read (projected by TenantContextInterceptor from req.user.user_id, ADR-031).
  userId: 'user-uuid-001',
  user: { user_id: 'user-uuid-001', role: 'PROJECT_MANAGER' },
};

// ── Fixtures ──────────────────────────────────────────────────────────────
const draftVersion: BoqVersionRow = {
  version_id: 'version-uuid-001',
  project_id: 'project-uuid-001',
  tenant_id: 'tenant-uuid-001',
  version_number: 1,
  version_name: null,
  status: 'DRAFT',
  total_estimated_amount: '0.0000',
  total_estimated_currency: 'THB',
  approved_by: null,
  approved_at: null,
  created_by: 'user-uuid-001',
  created_at: new Date(),
  updated_at: new Date(),
};

const approvedVersion: BoqVersionRow = {
  ...draftVersion,
  version_id: 'version-uuid-000',
  version_number: 1,
  status: 'APPROVED',
  total_estimated_amount: '420000.0000',
};

const category: BoqCategoryRow = {
  category_id: 'cat-uuid-001',
  version_id: 'version-uuid-001',
  tenant_id: 'tenant-uuid-001',
  parent_category_id: null,
  category_code: 'STR-01',
  category_name: 'Structural Works',
  sort_order: 0,
  subtotal_amount: '0.0000',
};

const item: BoqItemRow = {
  item_id: 'item-uuid-001',
  category_id: 'cat-uuid-001',
  version_id: 'version-uuid-001',
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
  created_at: new Date(),
  updated_at: new Date(),
};

// ── Tests ─────────────────────────────────────────────────────────────────
describe('BoqService', () => {
  let service: BoqService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoqService,
        { provide: EventOutboxService, useValue: makeOutboxDouble().service },
        { provide: BoqRepository, useValue: mockRepo },
        { provide: REQUEST, useValue: mockRequest },
      ],
    }).compile();
    service = await module.resolve<BoqService>(BoqService);
  });

  // ── Constructor fallbacks ────────────────────────────────────────────────
  describe('constructor', () => {
    it('uses empty strings when request has no tenantId or user (covers ?? branches on lines 45-46)', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BoqService,
          { provide: EventOutboxService, useValue: makeOutboxDouble().service },
          { provide: BoqRepository, useValue: mockRepo },
          { provide: REQUEST, useValue: {} },
        ],
      }).compile();
      const noCtxService = await module.resolve<BoqService>(BoqService);
      // Invoke the lazy getters so the `?? ''` fallback branches actually execute (ADR-031 made
      // these getters lazy; merely constructing the service no longer touches them).
      expect((noCtxService as unknown as { tenantId: string }).tenantId).toBe('');
      expect((noCtxService as unknown as { userId: string }).userId).toBe('');
    });
  });

  // ── Calculation accuracy ─────────────────────────────────────────────────
  describe('Decimal precision', () => {
    it('calculateLineTotal: 0.1 + 0.2 does NOT equal 0.3 with float, but decimal.js gives exact 30.0000', async () => {
      // This test demonstrates why decimal.js is required
      // Native JS: 0.1 * 300 = 30.000000000000004 (float error)
      // decimal.js: exactly 30.0000
      mockRepo.findDraftVersion.mockResolvedValue(null);
      mockRepo.claimNextVersion.mockResolvedValue({ version: draftVersion, version_number: 1 });
      mockRepo.findLatestApprovedVersion.mockResolvedValue(null);

      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      mockRepo.addItem.mockImplementation(async (p) => ({
        ...item,
        quantity: p.quantity,
        unit_cost: p.unit_cost,
        estimated_total: p.estimated_total,
      }));
      mockRepo.findItemsByVersion.mockResolvedValue([]);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.updateCategorySubtotals.mockResolvedValue(undefined);
      mockRepo.updateVersionTotal.mockResolvedValue(undefined);

      const result = await service.addItem('version-uuid-001', {
        category_id: 'cat-uuid-001',
        description: 'Test item',
        unit: 'unit',
        quantity: '0.1', // 0.1 × 300 = 30 exactly with decimal.js
        unit_cost: '300.0000',
        currency_code: 'THB',
      });

      // estimated_total must be exactly 30.0000, not 30.000000000000004
      expect(result.estimated_total).toBe('30.0000');
    });

    it('calculateLineTotal: 150 × 2800 = 420000.0000 (exact HALF_UP)', async () => {
      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      mockRepo.addItem.mockImplementation(async (p) => ({
        ...item,
        quantity: p.quantity,
        unit_cost: p.unit_cost,
        estimated_total: p.estimated_total,
      }));
      mockRepo.findItemsByVersion.mockResolvedValue([]);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.updateCategorySubtotals.mockResolvedValue(undefined);
      mockRepo.updateVersionTotal.mockResolvedValue(undefined);

      const result = await service.addItem('version-uuid-001', {
        category_id: 'cat-uuid-001',
        description: 'Concrete C30',
        unit: 'm3',
        quantity: '150.0000',
        unit_cost: '2800.0000',
        currency_code: 'THB',
      });

      expect(result.estimated_total).toBe('420000.0000');
    });

    it('calculateLineTotal: rounds 1.12345 × 3 = 3.3704 (HALF_UP on 4th decimal)', async () => {
      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      mockRepo.addItem.mockImplementation(async (p) => ({
        ...item,
        quantity: p.quantity,
        unit_cost: p.unit_cost,
        estimated_total: p.estimated_total,
      }));
      mockRepo.findItemsByVersion.mockResolvedValue([]);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.updateCategorySubtotals.mockResolvedValue(undefined);
      mockRepo.updateVersionTotal.mockResolvedValue(undefined);

      const result = await service.addItem('version-uuid-001', {
        category_id: 'cat-uuid-001',
        description: 'Rounding test',
        unit: 'unit',
        quantity: '3.0000',
        unit_cost: '1.12345', // 3 × 1.12345 = 3.37035 → ROUND_HALF_UP(4dp) = 3.3704
        currency_code: 'THB',
      });

      expect(result.estimated_total).toBe('3.3704');
    });
  });

  // ── Versioning rules ─────────────────────────────────────────────────────
  describe('Version creation', () => {
    it('creates first version with version_number = 1', async () => {
      mockRepo.findDraftVersion.mockResolvedValue(null);
      mockRepo.claimNextVersion.mockResolvedValue({ version: draftVersion, version_number: 1 });
      mockRepo.findLatestApprovedVersion.mockResolvedValue(null);

      const result = await service.createVersion('project-uuid-001', { currency_code: 'THB' });
      expect(result.version_number).toBe(1);
      // version_number is now allocated inside the transaction (COALESCE(MAX)+1), not passed in,
      // and the outbox builder rides along so the events commit with the row (§35.13 ESC-13).
      expect(mockRepo.claimNextVersion).toHaveBeenCalledWith(
        expect.objectContaining({ project_id: 'project-uuid-001', currency_code: 'THB' }),
        expect.any(Function),
      );
    });

    it('throws ConflictException if DRAFT already exists', async () => {
      // claimNextVersion returns null when it finds a DRAFT under the per-project advisory lock.
      mockRepo.claimNextVersion.mockResolvedValue(null);
      mockRepo.findDraftVersion.mockResolvedValue(draftVersion);

      await expect(
        service.createVersion('project-uuid-001', { currency_code: 'THB' }),
      ).rejects.toThrow(ConflictException);
    });

    it('still reports the conflict when the blocking DRAFT cannot be re-read', async () => {
      // claimNextVersion and findDraftVersion are two separate reads: the lock-holder can approve or
      // delete the DRAFT in between, so the id lookup comes back empty. The 409 is still correct —
      // the claim genuinely failed — and the message must degrade to 'unknown' rather than render
      // "(undefined)" at a user.
      mockRepo.claimNextVersion.mockResolvedValue(null);
      mockRepo.findDraftVersion.mockResolvedValue(null);

      await expect(
        service.createVersion('project-uuid-001', { currency_code: 'THB' }),
      ).rejects.toThrow(/already has a DRAFT BOQ version \(unknown\)/);
    });

    it('publishes boq.created.v1 on first version (version_number === 1 branch)', async () => {
      mockRepo.findDraftVersion.mockResolvedValue(null);
      mockRepo.claimNextVersion.mockResolvedValue({ version: draftVersion, version_number: 1 });
      mockRepo.findLatestApprovedVersion.mockResolvedValue(null);

      await service.createVersion('project-uuid-001', { currency_code: 'THB' });

      // Events now go to the outbox: assert on the builder handed to the repository.
      // The builder now rides claimNextVersion — that is the call that does the INSERT, so it is
      // the transaction the events have to join.
      const builder = mockRepo.claimNextVersion.mock.calls[0][1] as (
        row: BoqVersionRow,
      ) => { event_type: string }[];
      const eventTypes = builder(draftVersion).map((e) => e.event_type);
      expect(eventTypes).toEqual([
        'construction.boq.version_created.v1',
        'construction.boq.created.v1',
      ]);
    });

    it('does NOT publish boq.created.v1 on subsequent versions (version_number > 1 branch)', async () => {
      mockRepo.findDraftVersion.mockResolvedValue(null);
      mockRepo.claimNextVersion.mockResolvedValue({
        version: { ...draftVersion, version_number: 2 },
        version_number: 2,
      });
      mockRepo.findLatestApprovedVersion.mockResolvedValue(approvedVersion);
      mockRepo.copyVersionContents.mockResolvedValue(undefined);
      mockRepo.findItemsByVersion.mockResolvedValue([item]);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.updateCategorySubtotals.mockResolvedValue(undefined);
      mockRepo.updateVersionTotal.mockResolvedValue(undefined);

      const result = await service.createVersion('project-uuid-001', { currency_code: 'THB' });
      expect(result.version_number).toBe(2);
      expect(mockRepo.copyVersionContents).toHaveBeenCalled();

      // The builder now rides claimNextVersion — that is the call that does the INSERT, so it is
      // the transaction the events have to join.
      const builder = mockRepo.claimNextVersion.mock.calls[0][1] as (
        row: BoqVersionRow,
      ) => { event_type: string }[];
      const eventTypes = builder({ ...draftVersion, version_number: 2 }).map((e) => e.event_type);
      expect(eventTypes).not.toContain('construction.boq.created.v1');
    });

    it('creates version_number = 2 when no approved version to copy from (G5 — inner if false branch)', async () => {
      mockRepo.findDraftVersion.mockResolvedValue(null);
      mockRepo.claimNextVersion.mockResolvedValue({
        version: { ...draftVersion, version_number: 2 },
        version_number: 2,
      });
      mockRepo.findLatestApprovedVersion.mockResolvedValue(null);

      const result = await service.createVersion('project-uuid-001', { currency_code: 'THB' });
      expect(result.version_number).toBe(2);
      expect(mockRepo.copyVersionContents).not.toHaveBeenCalled();
    });
  });

  // ── Immutability ─────────────────────────────────────────────────────────
  describe('Immutability — APPROVED/SUPERSEDED versions cannot be modified', () => {
    it('addItem throws ForbiddenException on APPROVED version', async () => {
      mockRepo.findVersionById.mockResolvedValue({ ...approvedVersion });
      await expect(
        service.addItem('version-uuid-000', {
          category_id: 'cat-uuid-001',
          description: 'Test',
          unit: 'm3',
          quantity: '1.0000',
          unit_cost: '100.0000',
          currency_code: 'THB',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updateItem throws ForbiddenException on APPROVED version', async () => {
      mockRepo.findItemById.mockResolvedValue({ ...item, version_id: 'version-uuid-000' });
      mockRepo.findVersionById.mockResolvedValue({ ...approvedVersion });
      await expect(service.updateItem('item-uuid-001', { description: 'Changed' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deleteItem throws ForbiddenException on APPROVED version', async () => {
      mockRepo.findItemById.mockResolvedValue({ ...item, version_id: 'version-uuid-000' });
      mockRepo.findVersionById.mockResolvedValue({ ...approvedVersion });
      await expect(service.deleteItem('item-uuid-001')).rejects.toThrow(ForbiddenException);
    });

    it('approveVersion throws UnprocessableEntityException on non-DRAFT', async () => {
      mockRepo.findVersionById.mockResolvedValue({ ...approvedVersion });
      await expect(service.approveVersion('project-uuid-001', 'version-uuid-000')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // ── Approval flow ─────────────────────────────────────────────────────────
  describe('approveVersion', () => {
    it('throws NotFoundException when version is not found (G1)', async () => {
      mockRepo.findVersionById.mockResolvedValue(null);
      await expect(service.approveVersion('project-uuid-001', 'missing-version')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('calls repo.approveVersion and returns updated version', async () => {
      const draftV2: BoqVersionRow = {
        ...draftVersion,
        version_id: 'version-uuid-002',
        version_number: 2,
      };
      mockRepo.findVersionById
        .mockResolvedValueOnce(draftV2) // initial check
        .mockResolvedValueOnce({ ...draftV2, status: 'APPROVED' }); // final fetch
      mockRepo.findItemsByVersion.mockResolvedValue([item]);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.updateCategorySubtotals.mockResolvedValue(undefined);
      mockRepo.updateVersionTotal.mockResolvedValue(undefined);
      mockRepo.approveVersion.mockResolvedValue(undefined);

      const result = await service.approveVersion('project-uuid-001', 'version-uuid-002');
      expect(result.status).toBe('APPROVED');
      expect(mockRepo.approveVersion).toHaveBeenCalledWith(
        expect.objectContaining({ version_id: 'version-uuid-002', approved_by: 'user-uuid-001' }),
        expect.objectContaining({ event_type: 'construction.boq.version_approved.v1' }),
      );

      // ADR-058 CT-2c-2: approval also publishes the full itemized line set for downstream materialization.
      const outboxMock = (
        service as unknown as {
          outbox: { publish: jest.Mock };
        }
      ).outbox;
      const itemsEvent = outboxMock.publish.mock.calls
        .map((c) => c[0] as { event_type: string; payload: { items: unknown[] } })
        .find((e) => e.event_type === 'construction.boq.items_published.v1');
      expect(itemsEvent).toBeDefined();
      expect(itemsEvent!.payload.items).toHaveLength(1);
    });
  });

  // ── listVersions ──────────────────────────────────────────────────────────
  describe('listVersions', () => {
    it('returns empty array when no versions exist', async () => {
      mockRepo.findVersionsByProject.mockResolvedValue([]);
      const result = await service.listVersions('project-uuid-001');
      expect(result).toEqual([]);
    });

    it('returns list of versions', async () => {
      mockRepo.findVersionsByProject.mockResolvedValue([draftVersion]);
      const result = await service.listVersions('project-uuid-001');
      expect(result).toHaveLength(1);
    });
  });

  // ── addCategory ───────────────────────────────────────────────────────────
  describe('addCategory', () => {
    it('throws ForbiddenException when version is not DRAFT', async () => {
      mockRepo.findVersionById.mockResolvedValue({ ...approvedVersion });
      await expect(
        service.addCategory('version-uuid-000', {
          category_code: 'STR-01',
          category_name: 'Structural',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('adds category to DRAFT version', async () => {
      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      mockRepo.addCategory.mockResolvedValue(category);
      const result = await service.addCategory('version-uuid-001', {
        category_code: 'STR-01',
        category_name: 'Structural',
        sort_order: 0,
      });
      expect(result.category_code).toBe('STR-01');
    });

    it('adds category with parent_category_id', async () => {
      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      const childCat = { ...category, category_id: 'cat-002', parent_category_id: 'cat-001' };
      mockRepo.addCategory.mockResolvedValue(childCat);
      const result = await service.addCategory('version-uuid-001', {
        category_code: 'STR-01-A',
        category_name: 'Sub-structural',
        parent_category_id: 'cat-uuid-parent',
      });
      expect(result.parent_category_id).toBe('cat-001');
    });
  });

  // ── updateItem / deleteItem happy paths ───────────────────────────────────
  describe('updateItem', () => {
    it('throws NotFoundException when item not found (covers line 213)', async () => {
      mockRepo.findItemById.mockResolvedValue(null);
      await expect(service.updateItem('missing-item', {})).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when version not found in assertDraftVersion (covers line 258)', async () => {
      mockRepo.findItemById.mockResolvedValue(item);
      mockRepo.findVersionById.mockResolvedValue(null);
      await expect(service.updateItem('item-uuid-001', {})).rejects.toThrow(NotFoundException);
    });

    it('uses null version currency fallback to THB in publishItemsUpdated (covers line 322)', async () => {
      mockRepo.findItemById.mockResolvedValue(item);
      mockRepo.findVersionById
        .mockResolvedValueOnce(draftVersion) // assertDraftVersion
        .mockResolvedValueOnce(null); // publishItemsUpdated → ?? 'THB'
      mockRepo.updateItem.mockResolvedValue(item);
      mockRepo.findItemsByVersion.mockResolvedValue([item]);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.updateCategorySubtotals.mockResolvedValue(undefined);
      mockRepo.updateVersionTotal.mockResolvedValue(undefined);
      await expect(
        service.updateItem('item-uuid-001', { quantity: '1.0000' }),
      ).resolves.toBeDefined();
    });

    it('updates item using provided quantity/unit_cost (G2 — true branches)', async () => {
      mockRepo.findItemById.mockResolvedValue(item);
      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      mockRepo.updateItem.mockResolvedValue({
        ...item,
        quantity: '200.0000',
        estimated_total: '560000.0000',
      });
      mockRepo.findItemsByVersion.mockResolvedValue([item]);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.updateCategorySubtotals.mockResolvedValue(undefined);
      mockRepo.updateVersionTotal.mockResolvedValue(undefined);

      const result = await service.updateItem('item-uuid-001', {
        quantity: '200.0000',
        unit_cost: '2800.0000',
      });
      expect(mockRepo.updateItem).toHaveBeenCalled();
      expect(result.quantity).toBe('200.0000');
    });

    it('falls back to existing quantity/unit_cost when not in dto (G2 — false branches)', async () => {
      mockRepo.findItemById.mockResolvedValue(item);
      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      mockRepo.updateItem.mockResolvedValue({ ...item, description: 'Updated desc' });
      mockRepo.findItemsByVersion.mockResolvedValue([item]);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.updateCategorySubtotals.mockResolvedValue(undefined);
      mockRepo.updateVersionTotal.mockResolvedValue(undefined);

      const result = await service.updateItem('item-uuid-001', { description: 'Updated desc' });
      expect(mockRepo.updateItem).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: '150.0000', unit_cost: '2800.0000' }),
      );
      expect(result.description).toBe('Updated desc');
    });
  });

  describe('deleteItem', () => {
    it('throws NotFoundException when item not found (covers line 239)', async () => {
      mockRepo.findItemById.mockResolvedValue(null);
      await expect(service.deleteItem('missing-item')).rejects.toThrow(NotFoundException);
    });

    it('deletes item and recalculates totals (G3)', async () => {
      mockRepo.findItemById.mockResolvedValue(item);
      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      mockRepo.deleteItem.mockResolvedValue(undefined);
      mockRepo.findItemsByVersion.mockResolvedValue([]);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.updateCategorySubtotals.mockResolvedValue(undefined);
      mockRepo.updateVersionTotal.mockResolvedValue(undefined);

      await expect(service.deleteItem('item-uuid-001')).resolves.toBeUndefined();
      expect(mockRepo.deleteItem).toHaveBeenCalledWith('item-uuid-001');
    });
  });

  // ── exportVersion (JSON) / exportVersionCsv ─────────────────────────────────
  describe('exportVersion', () => {
    it('returns the version detail as JSON (keyed by version_id alone — no project check)', async () => {
      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.findItemsByVersion.mockResolvedValue([item]);

      const result = await service.exportVersion('version-uuid-001');
      expect(result.version.version_id).toBe('version-uuid-001');
      expect(result.items).toHaveLength(1);
    });

    it('throws NotFoundException when the version does not exist', async () => {
      mockRepo.findVersionById.mockResolvedValue(null);
      await expect(service.exportVersion('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportVersionCsv', () => {
    it('returns a CSV string with a header row and one row per item', async () => {
      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.findItemsByVersion.mockResolvedValue([item]);

      const csv = await service.exportVersionCsv('version-uuid-001');
      const lines = csv.split('\r\n');
      expect(lines[0]).toContain('version_number');
      expect(lines[0]).toContain('carbon_total_kg_co2e');
      expect(lines).toHaveLength(2); // header + 1 item
    });

    it('throws NotFoundException when the version does not exist', async () => {
      mockRepo.findVersionById.mockResolvedValue(null);
      await expect(service.exportVersionCsv('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Kafka error handling ───────────────────────────────────────────────────
  // §35.13 ESC-13: the service no longer holds a KafkaProducer, so there is no direct-publish
  // catch branch left. Item mutations instead write construction.boq.updated.v1 to the outbox in
  // the same transaction as the closing version-total UPDATE.
  describe('boq.updated.v1 outbox write on item mutation', () => {
    it('writes the event with the version total UPDATE and sources project_id from the version row', async () => {
      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      mockRepo.addItem.mockResolvedValue(item);
      mockRepo.findItemsByVersion.mockResolvedValue([item]);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.updateCategorySubtotal.mockResolvedValue(undefined);
      mockRepo.updateVersionTotal.mockResolvedValue(undefined);

      await service.addItem('version-uuid-001', {
        category_id: 'category-uuid-001',
        description: 'Concrete',
        unit: 'M3',
        quantity: '10',
        unit_cost: '100',
        currency_code: 'THB',
      } as never);

      const call = mockRepo.updateVersionTotal.mock.calls.at(-1) as [
        string,
        string,
        { event_type: string; payload: { project_id: string; version_id: string } },
      ];
      expect(call[2].event_type).toBe('construction.boq.updated.v1');
      // ESC-18: project_id must be the PROJECT id from the version row, not the version id.
      expect(call[2].payload.project_id).toBe(draftVersion.project_id);
      expect(call[2].payload.version_id).toBe('version-uuid-001');
    });

    it('falls back to an empty project_id and THB when the version row is missing', async () => {
      mockRepo.findVersionById.mockResolvedValueOnce(draftVersion).mockResolvedValue(null);
      mockRepo.addItem.mockResolvedValue(item);
      mockRepo.findItemsByVersion.mockResolvedValue([item]);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.updateCategorySubtotal.mockResolvedValue(undefined);
      mockRepo.updateVersionTotal.mockResolvedValue(undefined);

      await service.addItem('version-uuid-001', {
        category_id: 'category-uuid-001',
        description: 'Concrete',
        unit: 'M3',
        quantity: '10',
        unit_cost: '100',
        currency_code: 'THB',
      } as never);

      const call = mockRepo.updateVersionTotal.mock.calls.at(-1) as [
        string,
        string,
        { payload: { project_id: string; new_total_estimated_currency: string } },
      ];
      expect(call[2].payload.project_id).toBe('');
      expect(call[2].payload.new_total_estimated_currency).toBe('THB');
    });
  });

  // ── Category and item listing ─────────────────────────────────────────────
  describe('getVersionDetail', () => {
    it('returns version, categories, items', async () => {
      mockRepo.findVersionById.mockResolvedValue(draftVersion);
      mockRepo.findCategoriesByVersion.mockResolvedValue([category]);
      mockRepo.findItemsByVersion.mockResolvedValue([item]);

      const detail = await service.getVersionDetail('project-uuid-001', 'version-uuid-001');
      expect(detail.version.version_id).toBe('version-uuid-001');
      expect(detail.categories).toHaveLength(1);
      expect(detail.items).toHaveLength(1);
    });

    it('throws NotFoundException when version does not belong to project', async () => {
      mockRepo.findVersionById.mockResolvedValue({ ...draftVersion, project_id: 'other-project' });
      await expect(
        service.getVersionDetail('project-uuid-001', 'version-uuid-001'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
