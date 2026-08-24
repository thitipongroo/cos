// Unit tests — BOQ Controller (Phase 4)

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BoqController } from '../boq.controller';
import { BoqService } from '../boq.service';
import { LastSeenService } from '../../identity/last-seen.service';

const mockVersion = {
  version_id: 'v-001',
  project_id: 'p-001',
  tenant_id: 't-001',
  version_number: 1,
  version_name: null,
  status: 'DRAFT' as const,
  total_estimated_amount: '0.0000',
  total_estimated_currency: 'THB',
  approved_by: null,
  approved_at: null,
  created_by: 'u-001',
  created_at: new Date(),
  updated_at: new Date(),
};

const mockCategory = {
  category_id: 'cat-001',
  version_id: 'v-001',
  tenant_id: 't-001',
  parent_category_id: null,
  category_code: 'STR-01',
  category_name: 'Structural',
  sort_order: 0,
  subtotal_amount: '0.0000',
};

const mockItem = {
  item_id: 'i-001',
  category_id: 'cat-001',
  version_id: 'v-001',
  tenant_id: 't-001',
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

const mockService = {
  createVersion: jest.fn(),
  listVersions: jest.fn(),
  getVersionDetail: jest.fn(),
  approveVersion: jest.fn(),
  addCategory: jest.fn(),
  addItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
  exportVersion: jest.fn(),
  exportVersionCsv: jest.fn(),
};

const makeRes = () => ({ header: jest.fn() });

describe('BoqController', () => {
  let controller: BoqController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BoqController],
      providers: [
        { provide: BoqService, useValue: mockService },
        // JwtAuthGuard (class-level @UseGuards) gained a LastSeenService dependency; provide a mock so
        // the guard resolves under DI. The guard never runs here — these tests call the controller
        // methods directly — but the module must still compile.
        { provide: LastSeenService, useValue: { touch: jest.fn() } },
      ],
    }).compile();
    controller = module.get<BoqController>(BoqController);
  });

  it('createVersion delegates to service', async () => {
    mockService.createVersion.mockResolvedValue(mockVersion);
    const result = await controller.createVersion('p-001', { currency_code: 'THB' });
    expect(result).toEqual(mockVersion);
    expect(mockService.createVersion).toHaveBeenCalledWith('p-001', { currency_code: 'THB' });
  });

  it('listVersions delegates to service', async () => {
    mockService.listVersions.mockResolvedValue([mockVersion]);
    const result = await controller.listVersions('p-001');
    expect(result).toHaveLength(1);
  });

  it('getVersionDetail delegates to service', async () => {
    const detail = { version: mockVersion, categories: [mockCategory], items: [mockItem] };
    mockService.getVersionDetail.mockResolvedValue(detail);
    const result = await controller.getVersionDetail('p-001', 'v-001');
    expect(result.version.version_id).toBe('v-001');
  });

  it('approveVersion delegates to service', async () => {
    const approved = { ...mockVersion, status: 'APPROVED' as const };
    mockService.approveVersion.mockResolvedValue(approved);
    const result = await controller.approveVersion('p-001', 'v-001');
    expect(result.status).toBe('APPROVED');
  });

  it('createVersion propagates ConflictException from service', async () => {
    mockService.createVersion.mockRejectedValue(new ConflictException('DRAFT exists'));
    await expect(controller.createVersion('p-001', { currency_code: 'THB' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('addCategory delegates to service', async () => {
    mockService.addCategory.mockResolvedValue(mockCategory);
    const result = await controller.addCategory('v-001', {
      category_code: 'STR-01',
      category_name: 'Structural Works',
    });
    expect(result.category_code).toBe('STR-01');
  });

  it('addItem delegates to service', async () => {
    mockService.addItem.mockResolvedValue(mockItem);
    const result = await controller.addItem('v-001', {
      category_id: 'cat-001',
      description: 'Concrete C30',
      unit: 'm3',
      quantity: '150.0000',
      unit_cost: '2800.0000',
      currency_code: 'THB',
    });
    expect(result.estimated_total).toBe('420000.0000');
  });

  it('updateItem delegates to service', async () => {
    const updated = { ...mockItem, quantity: '200.0000', estimated_total: '560000.0000' };
    mockService.updateItem.mockResolvedValue(updated);
    const result = await controller.updateItem('i-001', { quantity: '200.0000' });
    expect(result.quantity).toBe('200.0000');
  });

  it('deleteItem delegates to service', async () => {
    mockService.deleteItem.mockResolvedValue(undefined);
    await expect(controller.deleteItem('i-001')).resolves.toBeUndefined();
  });

  it('deleteItem propagates ForbiddenException from service', async () => {
    mockService.deleteItem.mockRejectedValue(new ForbiddenException('Not DRAFT'));
    await expect(controller.deleteItem('i-001')).rejects.toThrow(ForbiddenException);
  });

  it('exportVersion returns JSON by default (no format)', async () => {
    const detail = { version: mockVersion, categories: [], items: [] };
    mockService.exportVersion.mockResolvedValue(detail);
    const res = makeRes();
    const result = await controller.exportVersion('v-001', res as never);
    expect(mockService.exportVersion).toHaveBeenCalledWith('v-001');
    expect((result as typeof detail).version.version_id).toBe('v-001');
    expect(res.header).not.toHaveBeenCalled();
  });

  it('exportVersion returns CSV with text/csv headers when format=csv', async () => {
    mockService.exportVersionCsv.mockResolvedValue('version_number\r\n1');
    const res = makeRes();
    const result = await controller.exportVersion('v-001', res as never, 'csv');
    expect(mockService.exportVersionCsv).toHaveBeenCalledWith('v-001');
    expect(result).toBe('version_number\r\n1');
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.header).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="boq-v-001.csv"',
    );
  });

  it('getVersionDetail propagates NotFoundException from service', async () => {
    mockService.getVersionDetail.mockRejectedValue(new NotFoundException('Not found'));
    await expect(controller.getVersionDetail('p-001', 'bad-id')).rejects.toThrow(NotFoundException);
  });
});
