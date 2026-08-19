// Equipment Service unit tests — Phase 21
// Tests: status transitions, assignment logic, maintenance logging, utilization recording

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MaintenanceType } from '../dto/log-maintenance.dto';
import type { EquipmentRepository } from '../equipment.repository';

type MockRequest = { tenantId: string; user: { sub: string } };

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

const makeRepo = () => ({
  createEquipment: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  createAssignment: jest.fn(),
  returnAssignment: jest.fn(),
  createMaintenance: jest.fn(),
  recordUtilization: jest.fn(),
  findEquipmentByProject: jest.fn(),
});

const makeReq = (userId = 'user-1', tenantId = 'tenant-1'): MockRequest => ({
  tenantId,
  user: { sub: userId },
});

import { EquipmentService } from '../equipment.service';
import { makeOutboxDouble } from '../../../shared/events/__tests__/outbox-double';

describe('EquipmentService', () => {
  let service: EquipmentService;
  let repo: ReturnType<typeof makeRepo>;
  const req = makeReq();

  beforeEach(() => {
    repo = makeRepo();
    service = new EquipmentService(
      req as unknown as ConstructorParameters<typeof EquipmentService>[0],
      repo as unknown as EquipmentRepository,
      makeOutboxDouble().service,
    );
  });

  describe('status transitions', () => {
    it('allows AVAILABLE → IN_USE', async () => {
      const eq = { equipment_id: 'eq-1', status: 'AVAILABLE' };
      repo.findById.mockResolvedValue(eq);
      repo.updateStatus.mockResolvedValue({ ...eq, status: 'IN_USE' });

      const result = await service.updateStatus('eq-1', 'IN_USE');
      expect(result.status).toBe('IN_USE');
      expect(repo.updateStatus).toHaveBeenCalledWith('eq-1', 'IN_USE');
    });

    it('blocks RETIRED → AVAILABLE transition', async () => {
      repo.findById.mockResolvedValue({ equipment_id: 'eq-1', status: 'RETIRED' });
      await expect(service.updateStatus('eq-1', 'AVAILABLE')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('allows MAINTENANCE → AVAILABLE', async () => {
      const eq = { equipment_id: 'eq-1', status: 'MAINTENANCE' };
      repo.findById.mockResolvedValue(eq);
      repo.updateStatus.mockResolvedValue({ ...eq, status: 'AVAILABLE' });

      const result = await service.updateStatus('eq-1', 'AVAILABLE');
      expect(result.status).toBe('AVAILABLE');
    });

    it('throws NotFoundException for unknown equipment', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.updateStatus('unknown', 'IN_USE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('assignment logic', () => {
    it('assigns available equipment and transitions to IN_USE', async () => {
      const eq = { equipment_id: 'eq-1', status: 'AVAILABLE' };
      const assignment = {
        assignment_id: 'asgn-1',
        equipment_id: 'eq-1',
        project_id: 'proj-1',
        returned_at: null,
      };
      repo.findById.mockResolvedValue(eq);
      repo.createAssignment.mockResolvedValue(assignment);
      repo.updateStatus.mockResolvedValue({ ...eq, status: 'IN_USE' });

      const result = await service.assignToProject('eq-1', { project_id: 'proj-1' });
      expect(result.assignment_id).toBe('asgn-1');
      expect(repo.updateStatus).toHaveBeenCalledWith('eq-1', 'IN_USE');
    });

    it('rejects assignment if equipment is IN_USE', async () => {
      repo.findById.mockResolvedValue({ equipment_id: 'eq-1', status: 'IN_USE' });
      await expect(
        service.assignToProject('eq-1', { project_id: 'proj-1' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('returns equipment and transitions back to AVAILABLE', async () => {
      const assignment = { assignment_id: 'asgn-1', equipment_id: 'eq-1', project_id: 'proj-1' };
      repo.returnAssignment.mockResolvedValue(assignment);
      repo.updateStatus.mockResolvedValue({ equipment_id: 'eq-1', status: 'AVAILABLE' });

      await service.returnFromProject('eq-1', 'asgn-1', {});
      expect(repo.updateStatus).toHaveBeenCalledWith('eq-1', 'AVAILABLE');
    });
  });

  describe('maintenance logging', () => {
    it('creates maintenance record and emits Kafka event', async () => {
      repo.findById.mockResolvedValue({ equipment_id: 'eq-1', status: 'AVAILABLE' });
      repo.createMaintenance.mockResolvedValue({ maintenance_id: 'maint-1' });

      const result = await service.logMaintenance('eq-1', {
        maintenance_type: MaintenanceType.SCHEDULED,
        scheduled_at: '2026-07-01T00:00:00Z',
      });

      expect(result.maintenance_id).toBe('maint-1');
      expect(repo.createMaintenance).toHaveBeenCalledWith(
        expect.objectContaining({ maintenance_type: 'SCHEDULED' }),
      );
    });

    it('throws if equipment not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.logMaintenance('unknown', {
          maintenance_type: MaintenanceType.REPAIR,
          scheduled_at: '2026-07-01T00:00:00Z',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('utilization recording', () => {
    it('records utilization data', async () => {
      repo.findById.mockResolvedValue({ equipment_id: 'eq-1' });
      repo.recordUtilization.mockResolvedValue(undefined);

      await expect(
        service.recordUtilization('eq-1', {
          recorded_at: '2026-06-08T06:00:00Z',
          hours_operated: 8.5,
          fuel_consumed: 120,
        }),
      ).resolves.toBeUndefined();

      expect(repo.recordUtilization).toHaveBeenCalledWith(
        expect.objectContaining({ hours_operated: 8.5, fuel_consumed: 120 }),
      );
    });
  });

  describe('project equipment query', () => {
    it('returns equipment assigned to project', async () => {
      const rows = [{ equipment_id: 'eq-1' }, { equipment_id: 'eq-2' }];
      repo.findEquipmentByProject.mockResolvedValue(rows);

      const result = await service.getEquipmentByProject('proj-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('createEquipment', () => {
    it('delegates to repo.createEquipment and returns the row', async () => {
      const row = { equipment_id: 'eq-new', status: 'AVAILABLE' };
      repo.createEquipment.mockResolvedValue(row);

      const result = await service.createEquipment({
        equipment_code: 'EQ-001',
        equipment_name: 'Excavator',
        equipment_type: 'EXCAVATOR',
      } as never);
      expect(result).toBe(row);
    });
  });

  describe('listEquipment', () => {
    it('delegates to repo.findAll with filters', async () => {
      repo.findAll.mockResolvedValue([]);
      await service.listEquipment({ status: 'AVAILABLE' });
      expect(repo.findAll).toHaveBeenCalledWith({ status: 'AVAILABLE' });
    });
  });

  describe('userId fallback to system', () => {
    it('uses "system" as actor_id when req.user is undefined', async () => {
      const outboxMock = makeOutboxDouble();
      const noUserReq = { tenantId: 'tenant-1' };
      repo = makeRepo();
      service = new EquipmentService(
        noUserReq as unknown as ConstructorParameters<typeof EquipmentService>[0],
        repo as unknown as EquipmentRepository,
        outboxMock.service,
      );
      repo.findById.mockResolvedValue({ equipment_id: 'eq-1', status: 'AVAILABLE' });
      repo.createAssignment.mockResolvedValue({ assignment_id: 'a-1', equipment_id: 'eq-1' });
      repo.updateStatus.mockResolvedValue({ equipment_id: 'eq-1', status: 'IN_USE' });

      await service.assignToProject('eq-1', { project_id: 'p-1' } as never);

      expect(outboxMock.publish).toHaveBeenCalledWith(
        expect.objectContaining({ actor_id: 'system' }),
      );
    });
  });

  describe('listEquipment with no args (default filter)', () => {
    it('calls repo.findAll with empty object when no filter passed', async () => {
      repo.findAll.mockResolvedValue([]);
      await service.listEquipment();
      expect(repo.findAll).toHaveBeenCalledWith({});
    });
  });

  describe('updateStatus with unknown current status', () => {
    it('throws UnprocessableEntityException when current status is not in transition map', async () => {
      repo.findById.mockResolvedValue({ equipment_id: 'eq-1', status: 'UNKNOWN_STATUS' });
      await expect(service.updateStatus('eq-1', 'AVAILABLE')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  describe('recordUtilization with null optional fields', () => {
    it('passes null for hours_operated and fuel_consumed when not provided', async () => {
      repo.findById.mockResolvedValue({ equipment_id: 'eq-1' });
      repo.recordUtilization.mockResolvedValue(undefined);

      await service.recordUtilization('eq-1', {
        recorded_at: '2026-06-08T06:00:00Z',
      } as never);

      expect(repo.recordUtilization).toHaveBeenCalledWith(
        expect.objectContaining({ hours_operated: null, fuel_consumed: null }),
      );
    });
  });
});
