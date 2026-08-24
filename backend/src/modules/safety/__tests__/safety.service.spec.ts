// Unit tests — Safety Service (Phase 6)
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('@cos/kafka', () => ({
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
import { EventOutboxService } from '../../../shared/events/event-outbox.service';
import { makeOutboxDouble } from '../../../shared/events/__tests__/outbox-double';
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
      { provide: EventOutboxService, useValue: makeOutboxDouble().service },
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
      { provide: EventOutboxService, useValue: makeOutboxDouble().service },
      { provide: SafetyRepository, useValue: mockRepo },
      { provide: REQUEST, useValue: {} },
    ],
  }).compile();
  const svc = await m.resolve<SafetyService>(SafetyService);
  expect(svc).toBeDefined();
  // Invoke the lazy getter — constructing the service alone does NOT exercise the
  // `|| clsUserId()` fallback branch (context.md QM-1; ADR-031).
  expect((svc as unknown as { userId: string }).userId).toBe('');
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

  // Offline idempotency (mirrors createIssue's G-M11 client_id). An incident filed with no signal is
  // queued and replayed by /sync/push - including after a TIMEOUT, where the first attempt may
  // already have landed. Without this a replay filed a SECOND safety record, re-notified the Safety
  // Officer and re-armed the 30-minute escalation timer.
  describe('client_id makes a replayed offline incident idempotent', () => {
    /** The outbox publish mock of the service under test — events are queued now, not published. */
    const lastPublish = (): jest.Mock =>
      (service as unknown as { outbox: { publish: jest.Mock } }).outbox.publish;

    it('uses the client-provided id as the incident_id', async () => {
      mockRepo.createIncident.mockResolvedValue({ incident_id: 'client-uuid', project_id: 'p1' });
      await service.createIncident({
        client_id: 'client-uuid',
        project_id: 'p1',
        incident_type: 'fall',
        severity: 'HIGH',
      } as never);
      expect(mockRepo.createIncident).toHaveBeenCalledWith(
        expect.objectContaining({ incident_id: 'client-uuid' }),
      );
    });

    it('generates an id when the client did not send one', async () => {
      mockRepo.createIncident.mockResolvedValue({ incident_id: 'gen', project_id: 'p1' });
      await service.createIncident({
        project_id: 'p1',
        incident_type: 'fall',
        severity: 'HIGH',
      } as never);
      const arg = mockRepo.createIncident.mock.calls[0][0] as { incident_id: string };
      expect(arg.incident_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('returns the existing incident on a replay, WITHOUT re-emitting the event', async () => {
      // Null from the repository is ON CONFLICT DO NOTHING reporting "already there".
      mockRepo.createIncident.mockResolvedValue(null);
      mockRepo.findIncidentById.mockResolvedValue({ incident_id: 'client-uuid', project_id: 'p1' });

      const result = await service.createIncident({
        client_id: 'client-uuid',
        project_id: 'p1',
        incident_type: 'fall',
        severity: 'CRITICAL',
      } as never);

      expect(result).toEqual({ incident_id: 'client-uuid', project_id: 'p1' });
      expect(mockRepo.findIncidentById).toHaveBeenCalledWith('client-uuid');
      // The whole point: no duplicate notification, no second escalation timer.
      expect(lastPublish()).not.toHaveBeenCalled();
    });

    it('rejects an id that conflicts but is not visible - it belongs to another tenant', async () => {
      // RLS hides the row while the primary key still rejects the insert. A silent success would
      // report an incident that this tenant cannot see and nobody will act on.
      mockRepo.createIncident.mockResolvedValue(null);
      mockRepo.findIncidentById.mockResolvedValue(null);

      await expect(
        service.createIncident({
          client_id: 'client-uuid',
          project_id: 'p1',
          incident_type: 'fall',
          severity: 'HIGH',
        } as never),
      ).rejects.toMatchObject({ status: 409 });
      expect(lastPublish()).not.toHaveBeenCalled();
    });
  });

  it('createIncident emits safety.incident.created.v1 (§19.3 escalation source)', async () => {
    mockRepo.createIncident.mockResolvedValue({ incident_id: 'inc-1', project_id: 'p1' });
    await service.createIncident({
      project_id: 'p1',
      incident_type: 'fall',
      severity: 'CRITICAL',
    } as never);
    const outbox = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'safety.incident.created.v1',
        payload: expect.objectContaining({ incident_id: 'inc-1', severity: 'CRITICAL' }),
      }),
    );
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
