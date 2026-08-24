// Unit tests — Notification Escalation Sweep (Phase 20 §19.3).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  NotificationEscalationService,
  ESCALATION_RULES,
  ESCALATION_JOB,
  ESCALATION_LEASE_SECONDS,
} from '../notification.escalation.service';
import { makeLockDouble } from '../../../shared/scheduling/__tests__/lock-double';

const mockRepo = {
  findEscalationCandidates: jest.fn(),
  markEscalated: jest.fn(),
};
const mockSvc = { escalate: jest.fn() };

// Default to a lock that GRANTS, so every existing assertion below still exercises the sweep. The
// lease is what decides whether the work happens at all now, and the tests about the work should not
// have to restate that decision.
function makeService(lock = makeLockDouble()): NotificationEscalationService {
  return new NotificationEscalationService(mockRepo as never, mockSvc as never, lock.service);
}

const candidate = {
  notification_id: 'n1',
  tenant_id: 'tenant-001',
  recipient_id: 'u1',
  event_type: 'safety.incident.created.v1',
  subject: 'Safety incident',
  body: 'A fall occurred',
};

beforeEach(() => jest.resetAllMocks());

describe('ESCALATION_RULES', () => {
  it('encodes the exact §19.3 timeouts and targets', () => {
    const byEvent = Object.fromEntries(ESCALATION_RULES.map((r) => [r.eventType, r]));
    expect(byEvent['safety.incident.created.v1']).toMatchObject({
      timeoutSeconds: 1800,
      escalateToRoles: ['PROJECT_MANAGER'],
    });
    expect(byEvent['finance.variance.alert.v1']).toMatchObject({
      timeoutSeconds: 7200,
      escalateToRoles: ['EXECUTIVE'],
    });
    expect(byEvent['ai.risk_prediction.generated.v1']).toMatchObject({
      timeoutSeconds: 86400,
      escalateToRoles: ['PROJECT_MANAGER'],
    });
  });
});

describe('runEscalationSweep', () => {
  it('escalates each candidate and marks it escalated (once)', async () => {
    // Only the safety rule returns a candidate; the other two return none.
    mockRepo.findEscalationCandidates.mockImplementation((eventType: string) =>
      Promise.resolve(eventType === 'safety.incident.created.v1' ? [candidate] : []),
    );
    mockSvc.escalate.mockResolvedValue(undefined);
    mockRepo.markEscalated.mockResolvedValue(undefined);

    await makeService().runEscalationSweep();

    expect(mockRepo.findEscalationCandidates).toHaveBeenCalledTimes(ESCALATION_RULES.length);
    expect(mockSvc.escalate).toHaveBeenCalledWith(
      'tenant-001',
      ['PROJECT_MANAGER'],
      expect.stringContaining('Safety incident'),
      expect.stringContaining('escalated'),
    );
    expect(mockRepo.markEscalated).toHaveBeenCalledWith('n1');
  });

  it('falls back to the body when the candidate has no subject', async () => {
    mockRepo.findEscalationCandidates.mockImplementation((eventType: string) =>
      Promise.resolve(
        eventType === 'safety.incident.created.v1' ? [{ ...candidate, subject: null }] : [],
      ),
    );
    mockSvc.escalate.mockResolvedValue(undefined);
    mockRepo.markEscalated.mockResolvedValue(undefined);

    await makeService().runEscalationSweep();

    expect(mockSvc.escalate).toHaveBeenCalledWith(
      'tenant-001',
      ['PROJECT_MANAGER'],
      expect.any(String),
      expect.stringContaining('A fall occurred'), // candidate.body
    );
  });

  it('does not mark escalated when delivery throws (retried next sweep)', async () => {
    mockRepo.findEscalationCandidates.mockImplementation((eventType: string) =>
      Promise.resolve(eventType === 'safety.incident.created.v1' ? [candidate] : []),
    );
    mockSvc.escalate.mockRejectedValue(new Error('delivery down'));

    await makeService().runEscalationSweep();

    expect(mockRepo.markEscalated).not.toHaveBeenCalled();
  });
});

// Prod runs three replicas (values-prod.yaml) and @nestjs/schedule arms this timer in every one of
// them. `escalated_at` is written only after svc.escalate() has already sent, so without the lease
// all three read the same unescalated rows and all three sent — one unacknowledged incident, three
// escalation messages to the site manager.
describe('NotificationEscalationService — single-replica execution', () => {
  it('does nothing at all on a replica that does not hold the lease', async () => {
    const lock = makeLockDouble(false);
    await makeService(lock).runEscalationSweep();

    expect(mockRepo.findEscalationCandidates).not.toHaveBeenCalled();
    expect(mockSvc.escalate).not.toHaveBeenCalled();
    expect(mockRepo.markEscalated).not.toHaveBeenCalled();
  });

  it('claims the lease under the job name, with a lease shorter than the five-minute schedule', async () => {
    mockRepo.findEscalationCandidates.mockResolvedValue([]);
    const lock = makeLockDouble();
    await makeService(lock).runEscalationSweep();

    expect(lock.calls).toEqual([
      { jobName: ESCALATION_JOB, leaseSeconds: ESCALATION_LEASE_SECONDS },
    ]);
    // A lease that outlived the interval would let a crashed holder block escalations indefinitely.
    expect(ESCALATION_LEASE_SECONDS).toBeLessThan(5 * 60);
  });
});
