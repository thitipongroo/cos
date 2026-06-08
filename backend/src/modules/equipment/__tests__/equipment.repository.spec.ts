// Equipment Repository unit tests — Phase 21
// Mocks TenantPrismaService.run() to avoid real DB connections.

import { EquipmentRepository } from '../equipment.repository';

const mockPrisma = {
  $queryRaw: jest.fn(),
};

const mockDb = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};

describe('EquipmentRepository', () => {
  let repo: EquipmentRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new EquipmentRepository(mockDb as never);
  });

  describe('createEquipment', () => {
    it('inserts and returns the first row', async () => {
      const row = { equipment_id: 'eq-1', status: 'AVAILABLE' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.createEquipment({
        equipment_id: 'eq-1',
        tenant_id: 'tenant-1',
        equipment_code: 'EQ-001',
        equipment_name: 'Excavator',
        equipment_type: 'EXCAVATOR',
        purchase_date: null,
        purchase_cost: null,
        currency_code: null,
      });
      expect(result).toBe(row);
    });
  });

  describe('findAll', () => {
    it('returns all rows with no filters', async () => {
      const rows = [{ equipment_id: 'eq-1' }, { equipment_id: 'eq-2' }];
      mockPrisma.$queryRaw.mockResolvedValue(rows);
      const result = await repo.findAll();
      expect(result).toHaveLength(2);
    });

    it('passes status and type filters', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await repo.findAll({ status: 'AVAILABLE', type: 'EXCAVATOR' });
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('returns row when found', async () => {
      const row = { equipment_id: 'eq-1' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.findById('eq-1');
      expect(result).toBe(row);
    });

    it('returns null when not found', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const result = await repo.findById('no-such');
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('updates status and returns updated row', async () => {
      const row = { equipment_id: 'eq-1', status: 'IN_USE' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.updateStatus('eq-1', 'IN_USE');
      expect(result.status).toBe('IN_USE');
    });
  });

  describe('createAssignment', () => {
    it('inserts assignment and returns first row', async () => {
      const row = { assignment_id: 'asgn-1', equipment_id: 'eq-1' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.createAssignment({
        assignment_id: 'asgn-1',
        equipment_id: 'eq-1',
        project_id: 'proj-1',
        tenant_id: 'tenant-1',
        assigned_by: 'user-1',
        notes: null,
      });
      expect(result).toBe(row);
    });
  });

  describe('returnAssignment', () => {
    it('marks returned_at and returns first row', async () => {
      const row = { assignment_id: 'asgn-1', returned_at: new Date() };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.returnAssignment('asgn-1');
      expect(result.assignment_id).toBe('asgn-1');
    });
  });

  describe('createMaintenance', () => {
    it('inserts maintenance record and returns first row', async () => {
      const row = { maintenance_id: 'maint-1', status: 'PENDING' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.createMaintenance({
        maintenance_id: 'maint-1',
        equipment_id: 'eq-1',
        tenant_id: 'tenant-1',
        maintenance_type: 'SCHEDULED',
        scheduled_at: '2026-07-01T00:00:00Z',
        cost: null,
        currency_code: null,
        performed_by: null,
        notes: null,
      });
      expect(result.maintenance_id).toBe('maint-1');
    });
  });

  describe('recordUtilization', () => {
    it('inserts utilization row and resolves void', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await expect(
        repo.recordUtilization({
          equipment_id: 'eq-1',
          tenant_id: 'tenant-1',
          project_id: 'proj-1',
          recorded_at: '2026-06-08T06:00:00Z',
          hours_operated: 8.5,
          fuel_consumed: 120,
          operator_id: null,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('findEquipmentByProject', () => {
    it('returns equipment assigned to project', async () => {
      const rows = [{ equipment_id: 'eq-1' }];
      mockPrisma.$queryRaw.mockResolvedValue(rows);
      const result = await repo.findEquipmentByProject('proj-1');
      expect(result).toBe(rows);
    });
  });
});
