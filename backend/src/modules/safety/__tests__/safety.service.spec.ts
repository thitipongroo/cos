// Unit tests — Safety Service (Phase 6)
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

import {
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { SafetyService } from '../safety.service';
import { SafetyRepository } from '../safety.repository';

const mockRepo = {
  createIncident: jest.fn(),
  findIncidents: jest.fn(),
  findIncidentById: jest.fn(),
  acknowledgeIncident: jest.fn(),
  createPermit: jest.fn(),
  findPermits: jest.fn(),
  findPermitById: jest.fn(),
  updatePermitStatus: jest.fn(),
  getComplianceSummary: jest.fn(),
};

let service: SafetyService;

beforeEach(async () => {
  jest.clearAllMocks();
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      SafetyService,
      { provide: SafetyRepository, useValue: mockRepo },
      { provide: REQUEST, useValue: { userId: 'user-1' } },
    ],
  }).compile();
  service = await moduleRef.resolve<SafetyService>(SafetyService);
});

it('constructor tolerates missing request context; userId falls back to empty', async () => {
  const m = await Test.createTestingModule({
    providers: [
      SafetyService,
      { provide: SafetyRepository, useValue: mockRepo },
      { provide: REQUEST, useValue: {} },
    ],
  }).compile();
  const s = await m.resolve<SafetyService>(SafetyService);
  expect(s).toBeDefined();
  // exercise the userId getter's `|| clsUserId()` fallback branch (no request.userId, no CLS → '')
  expect((s as unknown as { userId: string }).userId).toBe('');
});

describe('incidents', () => {
  it('createIncident sets reported_by from session', async () => {
    mockRepo.createIncident.mockResolvedValue({ incident_id: 'inc-1' });
    await service.createIncident({
      project_id: 'p1',
      incident_type: 'fall',
      severity: 'HIGH',
    } as never);
    expect(mockRepo.createIncident).toHaveBeenCalledWith(
      expect.objectContaining({ reported_by: 'user-1', task_id: null }),
    );
  });

  it('createIncident emits safety.incident.created.v1 (§19.3 escalation source)', async () => {
    mockRepo.createIncident.mockResolvedValue({ incident_id: 'inc-1', project_id: 'p1' });
    await service.createIncident({
      project_id: 'p1',
      incident_type: 'fall',
      severity: 'CRITICAL',
    } as never);
    const { KafkaProducer } = jest.requireMock('@cos/shared') as { KafkaProducer: jest.Mock };
    const instance = KafkaProducer.mock.results[KafkaProducer.mock.results.length - 1]?.value as {
      publish: jest.Mock;
    };
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'safety.incident.created.v1',
        payload: expect.objectContaining({ incident_id: 'inc-1', severity: 'CRITICAL' }),
      }),
    );
  });

  it('createIncident still succeeds when the Kafka publish fails (error swallowed)', async () => {
    mockRepo.createIncident.mockResolvedValue({ incident_id: 'inc-2', project_id: 'p1' });
    const { KafkaProducer } = jest.requireMock('@cos/shared') as { KafkaProducer: jest.Mock };
    const instance = KafkaProducer.mock.results[KafkaProducer.mock.results.length - 1]?.value as {
      publish: jest.Mock;
    };
    instance.publish.mockRejectedValueOnce(new Error('kafka down'));
    const result = await service.createIncident({
      project_id: 'p1',
      incident_type: 'fall',
      severity: 'HIGH',
    } as never);
    expect(result.incident_id).toBe('inc-2');
  });

  it('listIncidents returns envelope', async () => {
    mockRepo.findIncidents.mockResolvedValue({ rows: [{ incident_id: 'inc-1' }], total: 1 });
    expect(await service.listIncidents({ page: 1, limit: 20 })).toEqual({
      items: [{ incident_id: 'inc-1' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('acknowledgeIncident updates / throws NotFound', async () => {
    mockRepo.findIncidentById.mockResolvedValueOnce({ incident_id: 'inc-1' });
    mockRepo.acknowledgeIncident.mockResolvedValue({ incident_id: 'inc-1', status: 'IN_PROGRESS' });
    expect((await service.acknowledgeIncident('inc-1')).status).toBe('IN_PROGRESS');
    mockRepo.findIncidentById.mockResolvedValueOnce(null);
    await expect(service.acknowledgeIncident('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('permits', () => {
  const pendingWork = { permit_id: 'perm-1', permit_type: 'WORK_PERMIT', status: 'PENDING' };
  const pendingSafety = { permit_id: 'perm-2', permit_type: 'SAFETY_PERMIT', status: 'PENDING' };

  it('createPermit sets created_by', async () => {
    mockRepo.createPermit.mockResolvedValue(pendingWork);
    await service.createPermit({
      project_id: 'p1',
      permit_type: 'WORK_PERMIT',
      permit_number: 'WP-1',
    } as never);
    expect(mockRepo.createPermit).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: 'user-1' }),
    );
  });

  it('listPermits returns envelope', async () => {
    mockRepo.findPermits.mockResolvedValue({ rows: [pendingWork], total: 1 });
    expect((await service.listPermits({ page: 1, limit: 20 })).total).toBe(1);
  });

  it('getPermit throws NotFound when missing', async () => {
    mockRepo.findPermitById.mockResolvedValue(null);
    await expect(service.getPermit('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('approvePermit: work permit by Safety Officer → ACTIVE', async () => {
    mockRepo.findPermitById.mockResolvedValue(pendingWork);
    mockRepo.updatePermitStatus.mockResolvedValue({ ...pendingWork, status: 'ACTIVE' });
    expect((await service.approvePermit('perm-1', 'SAFETY_OFFICER')).status).toBe('ACTIVE');
  });

  it('approvePermit: safety permit by Safety Officer → Forbidden (PM final)', async () => {
    mockRepo.findPermitById.mockResolvedValue(pendingSafety);
    await expect(service.approvePermit('perm-2', 'SAFETY_OFFICER')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('approvePermit: safety permit by PM → ACTIVE', async () => {
    mockRepo.findPermitById.mockResolvedValue(pendingSafety);
    mockRepo.updatePermitStatus.mockResolvedValue({ ...pendingSafety, status: 'ACTIVE' });
    expect((await service.approvePermit('perm-2', 'PROJECT_MANAGER')).status).toBe('ACTIVE');
  });

  it('approvePermit: non-PENDING → Unprocessable', async () => {
    mockRepo.findPermitById.mockResolvedValue({ ...pendingWork, status: 'ACTIVE' });
    await expect(service.approvePermit('perm-1', 'TENANT_ADMIN')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejectPermit: PENDING → REVOKED; non-PENDING → Unprocessable', async () => {
    mockRepo.findPermitById.mockResolvedValueOnce(pendingWork);
    mockRepo.updatePermitStatus.mockResolvedValue({ ...pendingWork, status: 'REVOKED' });
    expect((await service.rejectPermit('perm-1')).status).toBe('REVOKED');
    mockRepo.findPermitById.mockResolvedValueOnce({ ...pendingWork, status: 'REVOKED' });
    await expect(service.rejectPermit('perm-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  // The `reason ?? null` branch, both ways. A rejection with no reason must store NULL rather than
  // an empty string: "nobody gave a reason" is the fact, and '' would read as one that was blank.
  it('rejectPermit passes the reason through to the repository', async () => {
    mockRepo.findPermitById.mockResolvedValueOnce(pendingWork);
    mockRepo.updatePermitStatus.mockResolvedValue({ ...pendingWork, status: 'REVOKED' });
    await service.rejectPermit('perm-1', 'Scaffold not tagged');
    expect(mockRepo.updatePermitStatus).toHaveBeenCalledWith(
      'perm-1',
      'REVOKED',
      'Scaffold not tagged',
    );
  });

  it('rejectPermit stores NULL when no reason is given', async () => {
    mockRepo.findPermitById.mockResolvedValueOnce(pendingWork);
    mockRepo.updatePermitStatus.mockResolvedValue({ ...pendingWork, status: 'REVOKED' });
    await service.rejectPermit('perm-1');
    expect(mockRepo.updatePermitStatus).toHaveBeenCalledWith('perm-1', 'REVOKED', null);
  });

  // The two `?? null` branches added with the 2026-08-13 columns, both ways.
  it('createPermit forwards contractor_name and description when supplied', async () => {
    mockRepo.createPermit.mockResolvedValue(pendingWork);
    await service.createPermit({
      project_id: 'p1',
      permit_type: 'WORK_PERMIT',
      permit_number: 'WP-1',
      contractor_name: 'Skyline Structural',
      description: 'Hot work, level 4',
    } as never);
    expect(mockRepo.createPermit).toHaveBeenCalledWith(
      expect.objectContaining({
        contractor_name: 'Skyline Structural',
        description: 'Hot work, level 4',
      }),
    );
  });

  it('createPermit sends NULL for contractor_name and description when omitted', async () => {
    mockRepo.createPermit.mockResolvedValue(pendingWork);
    await service.createPermit({
      project_id: 'p1',
      permit_type: 'WORK_PERMIT',
      permit_number: 'WP-1',
    } as never);
    expect(mockRepo.createPermit).toHaveBeenCalledWith(
      expect.objectContaining({ contractor_name: null, description: null }),
    );
  });
});

it('getCompliance delegates to repo', async () => {
  mockRepo.getComplianceSummary.mockResolvedValue({ open_incidents: 3 });
  expect((await service.getCompliance('p1')).open_incidents).toBe(3);
});
