// Unit tests — Notification Escalation Sweep (Phase 20 §19.3).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  NotificationEscalationService,
  ESCALATION_RULES,
} from '../notification.escalation.service';

const mockRepo = {
  findEscalationCandidates: jest.fn(),
  markEscalated: jest.fn(),
};
const mockSvc = { escalate: jest.fn() };

function makeService(): NotificationEscalationService {
  return new NotificationEscalationService(mockRepo as never, mockSvc as never);
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
