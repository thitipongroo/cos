// Equipment Service unit tests — Phase 21
// Tests: status transitions, assignment logic, maintenance logging, utilization recording

import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MaintenanceType } from '../dto/log-maintenance.dto';
import type { EquipmentRepository } from '../equipment.repository';

type MockRequest = { tenantId: string; userId: string };

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

// clsUserId is the FALLBACK the getter uses when Fastify leaves req.userId unset. In a bare unit
// test CLS is not active and the real helper returns '' — which is the "no context" case — so it is
// mocked here to let the CLS-supplies-it branch be exercised too.
const mockClsUserId = jest.fn<string, []>(() => '');
jest.mock('../../../shared/context/cls-context', () => ({
  ...jest.requireActual<Record<string, unknown>>('../../../shared/context/cls-context'),
  clsUserId: (): string => mockClsUserId(),
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

// req.userId — the PLATFORM user UUID that TenantMiddleware publishes. The mock used to supply
// `user: { sub }` instead: `sub` is the KEYCLOAK id, and under the Fastify adapter req.user does not
// reliably reach a Scope.REQUEST provider at all, so the service read undefined and fell back to the
// literal 'system'. That is not a UUID, and assigned_by is a NOT NULL UUID column.
const makeReq = (userId = 'user-1', tenantId = 'tenant-1'): MockRequest => ({
  tenantId,
  userId,
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

  describe('missing authenticated user', () => {
    it('refuses the write instead of attributing it to "system"', async () => {
      // This used to assert actor_id: 'system'. That value cannot be stored — assigned_by is a NOT
      // NULL UUID, so every assignment made without a user died with 22P02 at the database rather
      // than being recorded against anyone. Refusing here keeps the failure at the boundary, where
      // it says what is actually wrong.
      const outboxMock = makeOutboxDouble();
      const noUserReq = { tenantId: 'tenant-1' };
      repo = makeRepo();
      service = new EquipmentService(
        noUserReq as unknown as ConstructorParameters<typeof EquipmentService>[0],
        repo as unknown as EquipmentRepository,
        outboxMock.service,
      );
      repo.findById.mockResolvedValue({ equipment_id: 'eq-1', status: 'AVAILABLE' });

      await expect(service.assignToProject('eq-1', { project_id: 'p-1' } as never)).rejects.toThrow(
        /No authenticated user/,
      );
      expect(outboxMock.publish).not.toHaveBeenCalled();
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

// ── createEquipment: the duplicate-code rule ───────────────────────────────
//
// (tenant_id, equipment_code) is unique. Reusing a code is an operator mistake, not an internal
// fault, so it must surface as 409 — a 500 tells the operator the system broke rather than that the
// code is taken. The three error SHAPES below are all real: Prisma reports the same SQLSTATE in a
// different place depending on whether the query ran through the ORM or through $queryRaw on a
// driver adapter, and matching only one of them let the other reach the client as a 500.

describe('createEquipment — duplicate equipment_code', () => {
  let service: EquipmentService;
  let repo: ReturnType<typeof makeRepo>;

  const dto = {
    equipment_code: 'EX-001',
    equipment_name: 'Excavator',
    equipment_type: 'HEAVY',
  } as unknown as Parameters<EquipmentService['createEquipment']>[0];

  beforeEach(() => {
    repo = makeRepo();
    service = new EquipmentService(
      makeReq() as unknown as ConstructorParameters<typeof EquipmentService>[0],
      repo as unknown as EquipmentRepository,
      makeOutboxDouble().service,
    );
  });

  it('answers 409 when Prisma reports the SQLSTATE at the top level', async () => {
    repo.createEquipment.mockRejectedValue({ code: '23505' });

    await expect(service.createEquipment(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers 409 when the SQLSTATE arrives under meta.code', async () => {
    repo.createEquipment.mockRejectedValue({ code: 'P2010', meta: { code: '23505' } });

    await expect(service.createEquipment(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers 409 for the Prisma 7 driver-adapter shape', async () => {
    // P2010 with the driver's code buried at meta.driverAdapterError.cause.originalCode — the shape
    // a failing $queryRaw actually produces.
    repo.createEquipment.mockRejectedValue({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '23505' } } },
    });

    await expect(service.createEquipment(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers 409 when the adapter names the violation instead of numbering it', async () => {
    repo.createEquipment.mockRejectedValue({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation' } } },
    });

    await expect(service.createEquipment(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('names the offending code in the message', async () => {
    // The operator has to know WHICH code collided; "conflict" alone sends them looking.
    repo.createEquipment.mockRejectedValue({ code: '23505' });

    await expect(service.createEquipment(dto)).rejects.toThrow(/EX-001/);
  });

  it('re-throws an unrelated database error untouched', async () => {
    // A connection failure is not a duplicate code. Swallowing it into a 409 would have the operator
    // renaming equipment while the database is down.
    const boom = Object.assign(new Error('connection terminated'), { code: '08006' });
    repo.createEquipment.mockRejectedValue(boom);

    await expect(service.createEquipment(dto)).rejects.toThrow('connection terminated');
    await expect(service.createEquipment(dto)).rejects.not.toBeInstanceOf(ConflictException);
  });

  it('re-throws a non-object rejection untouched', async () => {
    // isUniqueViolation must not read properties off a string or null.
    repo.createEquipment.mockRejectedValue('a string, not an error');

    await expect(service.createEquipment(dto)).rejects.toBe('a string, not an error');
  });

  it('re-throws a null rejection untouched', async () => {
    repo.createEquipment.mockRejectedValue(null);

    await expect(service.createEquipment(dto)).rejects.toBeNull();
  });

  it('returns the row when the code is free', async () => {
    // CONTROL: the conflicts above must come from the ERROR, not from a create path that never works.
    repo.createEquipment.mockResolvedValue({ equipment_id: 'eq-1', equipment_code: 'EX-001' });

    await expect(service.createEquipment(dto)).resolves.toEqual(
      expect.objectContaining({ equipment_code: 'EX-001' }),
    );
  });
});

// ── the acting user ────────────────────────────────────────────────────────

describe('userId resolution', () => {
  beforeEach(() => {
    mockClsUserId.mockReturnValue('');
  });

  /** A repo whose equipment exists and is assignable, so the getter is what the test reaches. */
  const assignableRepo = (): ReturnType<typeof makeRepo> => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue({ equipment_id: 'eq-1', status: 'AVAILABLE' });
    repo.createAssignment.mockResolvedValue({ assignment_id: 'as-1' });
    return repo;
  };

  it('rejects the request when no user can be resolved at all', async () => {
    // assigned_by is a NOT NULL UUID. Falling through to a literal like 'system' produced 22P02 on
    // every assignment — a 401 is the honest answer for an unidentified caller.
    const repo = assignableRepo();
    const svc = new EquipmentService(
      { tenantId: 'tenant-1' } as unknown as ConstructorParameters<typeof EquipmentService>[0],
      repo as unknown as EquipmentRepository,
      makeOutboxDouble().service,
    );

    await expect(
      svc.assignToProject('eq-1', { project_id: 'proj-1' } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // And nothing was written: the refusal happens before the row, not after it.
    expect(repo.createAssignment).not.toHaveBeenCalled();
  });

  it('falls back to CLS when Fastify left req.userId unset', async () => {
    // Not belt-and-braces: JwtAuthGuard publishes the context to CLS precisely because req.userId
    // may be absent under the Fastify adapter, and without this the route would 401 instead.
    mockClsUserId.mockReturnValue('user-from-cls');
    const repo = makeRepo();
    repo.findById.mockResolvedValue({ equipment_id: 'eq-1', status: 'AVAILABLE' });
    repo.createAssignment.mockResolvedValue({ assignment_id: 'as-1' });
    const svc = new EquipmentService(
      { tenantId: 'tenant-1' } as unknown as ConstructorParameters<typeof EquipmentService>[0],
      repo as unknown as EquipmentRepository,
      makeOutboxDouble().service,
    );

    await svc.assignToProject('eq-1', { project_id: 'proj-1' } as never);

    expect(repo.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_by: 'user-from-cls' }),
    );
  });

  it('prefers req.userId over CLS when both are present', async () => {
    mockClsUserId.mockReturnValue('user-from-cls');
    const repo = makeRepo();
    repo.findById.mockResolvedValue({ equipment_id: 'eq-1', status: 'AVAILABLE' });
    repo.createAssignment.mockResolvedValue({ assignment_id: 'as-1' });
    const svc = new EquipmentService(
      { tenantId: 'tenant-1', userId: 'user-from-req' } as unknown as ConstructorParameters<
        typeof EquipmentService
      >[0],
      repo as unknown as EquipmentRepository,
      makeOutboxDouble().service,
    );

    await svc.assignToProject('eq-1', { project_id: 'proj-1' } as never);

    expect(repo.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_by: 'user-from-req' }),
    );
  });
});
