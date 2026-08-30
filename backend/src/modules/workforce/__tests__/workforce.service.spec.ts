// Workforce Service unit tests — Phase 22
// Tests: attendance calculation, timesheet aggregation, check-in/out cycle

// §35.13 ESC-13: the service no longer holds a KafkaProducer — it hands an outbox envelope to
// the repository write that anchors it, so these tests assert on the repository call itself.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

import type { WorkforceRepository } from '../workforce.repository';

type MockRequest = { tenantId: string; userId: string };

const makeRepo = () => ({
  createWorker: jest.fn(),
  findAllWorkers: jest.fn(),
  findWorkerById: jest.fn(),
  findWorkerByUserId: jest.fn(),
  allocateWorker: jest.fn(),
  getProjectWorkforce: jest.fn(),
  getProjectDirectory: jest.fn(),
  recordAttendance: jest.fn(),
  getAttendanceHistory: jest.fn(),
  submitTimesheet: jest.fn(),
  approveTimesheet: jest.fn(),
  getManpowerSummary: jest.fn(),
});

// req.userId — the PLATFORM user UUID. The mock used to supply `user: { sub }`, which is the
// KEYCLOAK id and, under the Fastify adapter, does not reliably reach a Scope.REQUEST provider at
// all — so the service read undefined and attributed every event to the literal 'system'.
const makeReq = (userId = 'user-1', tenantId = 'tenant-1'): MockRequest => ({
  tenantId,
  userId,
});

import { NotFoundException } from '@nestjs/common';
import { WorkforceService } from '../workforce.service';

describe('WorkforceService', () => {
  let service: WorkforceService;
  let repo: ReturnType<typeof makeRepo>;
  const req = makeReq();

  beforeEach(() => {
    repo = makeRepo();
    service = new WorkforceService(
      req as unknown as ConstructorParameters<typeof WorkforceService>[0],
      repo as unknown as WorkforceRepository,
    );
  });

  describe('attendance calculation', () => {
    it('calculates hours_worked from check_in and check_out when not provided', async () => {
      const worker = { worker_id: 'w1', full_name: 'Alice' };
      repo.findWorkerById.mockResolvedValue(worker);
      repo.recordAttendance.mockImplementation(async (p: { hours_worked: number }) => ({
        log_id: 'log-1',
        hours_worked: String(p.hours_worked),
      }));

      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
        check_out_at: '2026-06-08T17:00:00Z',
      });

      const callArg = repo.recordAttendance.mock.calls[0][0];
      expect(callArg.hours_worked).toBeCloseTo(9, 1);
    });

    it('uses provided hours_worked when supplied', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.recordAttendance.mockResolvedValue({ log_id: 'log-1' });

      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        hours_worked: 7.5,
      });

      const callArg = repo.recordAttendance.mock.calls[0][0];
      expect(callArg.hours_worked).toBe(7.5);
    });

    it('writes the checkin event to the outbox when only check_in_at is set', async () => {
      repo = makeRepo();
      service = new WorkforceService(
        req as unknown as ConstructorParameters<typeof WorkforceService>[0],
        repo as unknown as WorkforceRepository,
      );

      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.recordAttendance.mockResolvedValue({ log_id: 'log-1' });

      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
      });

      // The payload is §32.4 row 9, NOT the master:5338 shorthand ({ worker_id, project_id,
      // checked_in_at }): workforce.checkin.created.v1.avsc requires checkin_id, checkin_at and
      // method with no default, so the shorthand could not encode and every check-in died at the
      // outbox poller.
      const [params, event] = repo.recordAttendance.mock.calls[0] as [
        { worker_id: string; log_id: string },
        {
          event_type: string;
          tenant_id: string;
          actor_id: string;
          payload: Record<string, unknown>;
        },
      ];
      expect(params.worker_id).toBe('w1');
      expect(event.event_type).toBe('workforce.checkin.created.v1');
      expect(event.tenant_id).toBe('tenant-1');
      expect(event.actor_id).toBe('user-1');
      expect(event.payload).toEqual({
        checkin_id: params.log_id,
        worker_id: 'w1',
        project_id: 'proj-1',
        checkin_at: '2026-06-08T08:00:00Z',
        method: 'MANUAL',
        location: null,
      });
    });

    it('throws if worker not found', async () => {
      repo.findWorkerById.mockResolvedValue(null);
      await expect(
        service.recordAttendance('unknown', { project_id: 'proj-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── check-in event payload (§32.4 row 9) ─────────────────────────────────
  //
  // checkin_id, checkin_at and method are REQUIRED with no default in
  // workforce.checkin.created.v1.avsc. The master:5338 shorthand omitted all three, so the event
  // could not Avro-encode and every check-in died at the outbox poller — silently, because nothing
  // downstream complained. analytics-worker builds site_activity_daily.manpower_total from this
  // event, so the PM dashboard's manpower read zero.

  describe('check-in event payload', () => {
    // The envelope now rides the INSERT, so it is the SECOND argument to repo.recordAttendance
    // rather than a publish on an injected outbox service (§35.13 ESC-13).
    const eventOf = (): { event_type: string; payload: Record<string, unknown> } => {
      const [, event] = repo.recordAttendance.mock.calls[0] as [
        Record<string, unknown>,
        { event_type: string; payload: Record<string, unknown> },
      ];
      return event;
    };
    const paramsOf = (): Record<string, unknown> =>
      (repo.recordAttendance.mock.calls[0] as [Record<string, unknown>])[0];

    beforeEach(() => {
      repo = makeRepo();
      service = new WorkforceService(
        req as unknown as ConstructorParameters<typeof WorkforceService>[0],
        repo as unknown as WorkforceRepository,
      );
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.recordAttendance.mockResolvedValue({ log_id: 'log-1' });
    });

    it('carries the three fields the Avro schema requires with no default', async () => {
      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
        method: 'BIOMETRIC',
        latitude: 13.75,
        longitude: 100.5,
      } as never);

      // checkin_id is the attendance row's own id. The event is built before the INSERT returns, so
      // the service generates it once and uses it for both — asserting they match is what proves the
      // event points at the row it was written with.
      expect(eventOf().payload).toEqual(
        expect.objectContaining({
          checkin_id: paramsOf().log_id,
          checkin_at: '2026-06-08T08:00:00Z',
          method: 'BIOMETRIC',
        }),
      );
      expect(paramsOf().log_id).toEqual(expect.any(String));
    });

    it('defaults the method to MANUAL when the client sends none', async () => {
      // `method` has no Avro default, so omitting it is not an option — the service supplies one.
      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
      });

      expect(eventOf().payload).toEqual(expect.objectContaining({ method: 'MANUAL' }));
    });

    it('sends the location only when BOTH coordinates are present', async () => {
      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
        latitude: 13.75,
        longitude: 100.5,
      } as never);

      expect(eventOf().payload).toEqual(
        expect.objectContaining({ location: { lat: 13.75, lng: 100.5 } }),
      );
    });

    it.each([
      ['only a latitude', { latitude: 13.75 }],
      ['only a longitude', { longitude: 100.5 }],
      ['neither coordinate', {}],
    ])('sends a null location for %s', async (_label, coords) => {
      // Half a coordinate pair is not a location. Emitting { lat, lng: undefined } would either fail
      // the encode or place the check-in on the equator.
      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
        ...coords,
      } as never);

      expect(eventOf().payload).toEqual(expect.objectContaining({ location: null }));
    });

    it('does not put the check-in shape on a check-OUT event', async () => {
      // check-out is a different schema: hours_worked, no checkin_id. Sending the check-in payload
      // under the check-out type would fail the encode the same way.
      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
        check_out_at: '2026-06-08T17:00:00Z',
      });

      const event = eventOf();
      expect(event.event_type).toBe('workforce.checkout.created.v1');
      expect(event.payload).not.toHaveProperty('checkin_id');
      expect(event.payload).toHaveProperty('hours_worked');
    });
  });

  describe('timesheet aggregation', () => {
    it('approves timesheet and builds the outbox event from the UPDATEd row', async () => {
      repo = makeRepo();
      service = new WorkforceService(
        req as unknown as ConstructorParameters<typeof WorkforceService>[0],
        repo as unknown as WorkforceRepository,
      );

      const ts = {
        timesheet_id: 'ts-1',
        worker_id: 'w1',
        project_id: 'proj-1',
        period_date: new Date('2026-06-01'),
        regular_hours: '160',
        overtime_hours: '8',
        status: 'APPROVED',
      };
      // Stand in for the real repository, which invokes the builder with the UPDATEd row —
      // the builder must actually run for its Decimal arithmetic to be exercised (QM-1).
      let built: { event_type: string; payload: Record<string, unknown> } | undefined;
      repo.approveTimesheet.mockImplementation(
        async (_id: string, build?: (row: typeof ts) => typeof built) => {
          built = build?.(ts);
          return ts;
        },
      );

      const result = await service.approveTimesheet('ts-1');
      expect(result.status).toBe('APPROVED');
      expect(built).toEqual(
        expect.objectContaining({
          event_type: 'workforce.timesheet.approved.v1',
          payload: expect.objectContaining({
            worker_id: 'w1',
            project_id: 'proj-1',
            total_hours: 168,
          }),
        }),
      );
    });

    it('throws if timesheet not found on approve', async () => {
      repo.approveTimesheet.mockResolvedValue(null);
      await expect(service.approveTimesheet('unknown')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('submits timesheet with zero overtime when not provided', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.submitTimesheet.mockResolvedValue({ timesheet_id: 'ts-1', status: 'SUBMITTED' });

      const result = await service.submitTimesheet({
        worker_id: 'w1',
        project_id: 'proj-1',
        period_date: '2026-06-01',
        regular_hours: 160,
      });

      expect(result.status).toBe('SUBMITTED');
      expect(repo.submitTimesheet).toHaveBeenCalledWith(
        expect.objectContaining({ overtime_hours: 0 }),
      );
    });
  });

  describe('check-in/out cycle integration', () => {
    it('can record check-in then check-out for same worker', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.recordAttendance
        .mockResolvedValueOnce({ log_id: 'log-1', check_in_at: '2026-06-08T08:00:00Z' })
        .mockResolvedValueOnce({ log_id: 'log-2', check_out_at: '2026-06-08T17:00:00Z' });

      const checkIn = await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
      });
      const checkOut = await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_out_at: '2026-06-08T17:00:00Z',
      });

      expect(checkIn.log_id).toBe('log-1');
      expect(checkOut.log_id).toBe('log-2');
      expect(repo.recordAttendance).toHaveBeenCalledTimes(2);
    });
  });

  describe('createWorker', () => {
    it('delegates to repo.createWorker and returns row', async () => {
      const row = { worker_id: 'w-new', full_name: 'Bob' };
      repo.createWorker.mockResolvedValue(row);
      const result = await service.createWorker({
        employee_code: 'EMP-001',
        full_name: 'Bob',
        trade_type: 'CARPENTER',
        employment_type: 'FULL_TIME',
      } as never);
      expect(result).toBe(row);
    });
  });

  describe('listWorkers', () => {
    it('returns all active workers', async () => {
      repo.findAllWorkers.mockResolvedValue([{ worker_id: 'w1' }, { worker_id: 'w2' }]);
      const result = await service.listWorkers();
      expect(result).toHaveLength(2);
    });
  });

  describe('allocateToProject', () => {
    it('allocates worker and returns allocation row', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.allocateWorker.mockResolvedValue({ allocation_id: 'alloc-1' });
      const result = await service.allocateToProject('proj-1', {
        worker_id: 'w1',
        start_date: '2026-06-01',
      } as never);
      expect(result).toEqual({ allocation_id: 'alloc-1' });
    });

    it('throws NotFoundException if worker does not exist', async () => {
      repo.findWorkerById.mockResolvedValue(null);
      await expect(
        service.allocateToProject('proj-1', {
          worker_id: 'unknown',
          start_date: '2026-06-01',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getProjectWorkforce', () => {
    it('returns workforce allocations for project', async () => {
      repo.getProjectWorkforce.mockResolvedValue([{ allocation_id: 'a1' }]);
      const result = await service.getProjectWorkforce('proj-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getProjectDirectory', () => {
    it('returns the project crew with its on-site state', async () => {
      repo.getProjectDirectory.mockResolvedValue([{ worker_id: 'w1', on_site: true }]);
      const result = await service.getProjectDirectory('proj-1');
      expect(result).toEqual([{ worker_id: 'w1', on_site: true }]);
      expect(repo.getProjectDirectory).toHaveBeenCalledWith('proj-1');
    });
  });

  describe('getAttendanceHistory', () => {
    it('returns attendance logs for worker in date range', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.getAttendanceHistory.mockResolvedValue([{ log_id: 'log-1' }]);
      const result = await service.getAttendanceHistory('w1', '2026-06-01', '2026-06-30');
      expect(result).toHaveLength(1);
      expect(repo.getAttendanceHistory).toHaveBeenCalledWith('w1', '2026-06-01', '2026-06-30');
    });
  });

  describe('getManpowerSummary', () => {
    it('returns aggregated daily summary', async () => {
      repo.getManpowerSummary.mockResolvedValue([
        { date: new Date('2026-06-08'), total_workers: 5, total_hours: '40' },
      ]);
      const result = await service.getManpowerSummary('proj-1');
      expect(result).toHaveLength(1);
    });
  });

  // §35.13 ESC-13: the previous `emitEvent` swallowed Kafka failures, so a broker outage silently
  // dropped the event. Under the outbox the write shares the transaction — a failure there must
  // propagate and roll the attendance log back rather than be logged and ignored.
  describe('outbox write failure', () => {
    it('propagates the failure instead of silently dropping the event', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.recordAttendance.mockRejectedValue(new Error('outbox insert failed'));

      await expect(
        service.recordAttendance('w1', {
          project_id: 'proj-1',
          check_in_at: '2026-06-08T08:00:00Z',
        }),
      ).rejects.toThrow('outbox insert failed');
    });
  });

  // ADR-031 / §35.13 ESC-16: the service previously read `req.user?.sub`, which nothing sets, so it
  // always produced the literal 'system'. It now reads `req.userId` with a CLS fallback.
  describe('actor attribution when the request carries no user id', () => {
    it('records the CLS user rather than the literal "system"', async () => {
      // This used to assert actor_id: 'system'. Every workforce event was then attributed to nobody
      // — an audit trail that answers "who checked this worker in?" with a placeholder. It did not
      // crash, unlike the equipment module's version of the same getter, because actor_id lands in
      // the outbox payload JSON rather than in a UUID column. That is exactly why it survived.
      const noUserReq = { tenantId: 'tenant-1' };
      repo = makeRepo();
      service = new WorkforceService(
        noUserReq as unknown as ConstructorParameters<typeof WorkforceService>[0],
        repo as unknown as WorkforceRepository,
      );
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.recordAttendance.mockResolvedValue({ log_id: 'log-1' });

      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
      });

      // No CLS context in a bare unit test, so clsUserId() returns '' — the point is that the
      // fabricated 'system' identity is gone, not that a specific id appears here.
      expect(repo.recordAttendance).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ actor_id: '' }),
      );
    });

    it('tenantId also falls back to CLS on an empty request', () => {
      // Invoking the getter is required — constructing the service does not exercise the
      // `?? clsTenantId()` branch (context.md QM-1; ADR-031).
      const emptyReq = {};
      const svc = new WorkforceService(
        emptyReq as unknown as ConstructorParameters<typeof WorkforceService>[0],
        makeRepo() as unknown as WorkforceRepository,
      );
      expect((svc as unknown as { tenantId: string }).tenantId).toBe('');
      expect((svc as unknown as { userId: string }).userId).toBe('');
    });
  });

  describe('submitTimesheet with no regular_hours', () => {
    it('defaults regular_hours to 0 when not provided', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.submitTimesheet.mockResolvedValue({ timesheet_id: 'ts-1', status: 'SUBMITTED' });

      await service.submitTimesheet({
        worker_id: 'w1',
        project_id: 'proj-1',
        period_date: '2026-06-01',
      } as never);

      expect(repo.submitTimesheet).toHaveBeenCalledWith(
        expect.objectContaining({ regular_hours: 0 }),
      );
    });
  });

  describe('getMyWorker', () => {
    it('returns the worker linked to the user', async () => {
      const worker = { worker_id: 'w-1', user_id: 'u-1' };
      repo.findWorkerByUserId.mockResolvedValue(worker);
      await expect(service.getMyWorker('u-1')).resolves.toBe(worker);
      expect(repo.findWorkerByUserId).toHaveBeenCalledWith('u-1');
    });

    it('throws NotFoundException when no worker is linked', async () => {
      repo.findWorkerByUserId.mockResolvedValue(null);
      await expect(service.getMyWorker('u-none')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
