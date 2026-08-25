// Unit tests — Notification Service (Phase 20)
// Focus: template rendering, consumer routing, preference filtering.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  NotificationService,
  isWithinQuietHours,
  CRITICAL_EVENT_TYPES,
  EVENT_ROLE_MAP,
} from '../notification.service';
import { CANONICAL_EVENT_TYPES } from '@cos/shared';

// ── Mocks ──────────────────────────────────────────────────────────────────

// The repository resolves preferences and templates for the whole channel set at once (one query
// each) rather than per channel, so these helpers express the same intent the old per-channel mocks
// did. `findDisabledChannels` returns explicit OPT-OUTS: a channel absent from the set is enabled,
// matching the "no preference row means enabled" default.
const ALL_CHANNELS = ['IN_APP', 'EMAIL', 'LINE'] as const;
const allDisabled = (): Set<string> => new Set<string>(ALL_CHANNELS);
const onlyEnabled = (channel: string): Set<string> =>
  new Set<string>(ALL_CHANNELS.filter((c) => c !== channel));
const templatesFor = (template: unknown): Map<string, unknown> =>
  new Map<string, unknown>(ALL_CHANNELS.map((c) => [c, template]));

const mockRepo = {
  findUsersByRole: jest.fn(),
  findDisabledChannels: jest.fn().mockResolvedValue(new Set<string>()),
  findTemplatesByChannel: jest.fn().mockResolvedValue(new Map()),
  createNotification: jest.fn(),
  markSent: jest.fn(),
  markFailed: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
  findByRecipient: jest.fn(),
  findPreferences: jest.fn(),
  upsertPreference: jest.fn(),
  updateQuietHours: jest.fn(),
  upsertDeviceToken: jest.fn(),
  findDeviceTokens: jest.fn(),
  getTenantTimezone: jest.fn(),
  getUserQuietHours: jest.fn(),
};

const mockSse = { push: jest.fn() };
const mockPush = { send: jest.fn() };
const mockEmail = { send: jest.fn() };
const mockLine = { send: jest.fn() };

const notifRow = {
  notification_id: 'notif-001',
  tenant_id: 'tenant-001',
  recipient_id: 'user-001',
  channel: 'IN_APP',
  event_type: 'site.inspection.failed.v1',
  subject: 'Inspection failed',
  body: 'Project Alpha failed',
  status: 'PENDING',
  sent_at: null,
  read_at: null,
  created_at: new Date(),
};

let svc: NotificationService;

beforeEach(() => {
  jest.resetAllMocks();
  // Default: no device tokens unless overridden per test
  mockRepo.findDeviceTokens.mockResolvedValue([]);
  // Default quiet-hours window is empty (start==end → never quiet) so push tests are time-independent.
  mockRepo.getTenantTimezone.mockResolvedValue('Asia/Bangkok');
  mockRepo.getUserQuietHours.mockResolvedValue({ start: '00:00:00', end: '00:00:00' });
  svc = new NotificationService(
    mockRepo as never,
    mockSse as never,
    mockPush as never,
    mockEmail as never,
    mockLine as never,
  );
});

// ── render ─────────────────────────────────────────────────────────────────

describe('render', () => {
  it('renders handlebars template with context', () => {
    const result = svc.render('Hello {{name}}!', { name: 'Alice' });
    expect(result).toBe('Hello Alice!');
  });

  it('renders template with nested context', () => {
    const result = svc.render('Project: {{project.name}}', { project: { name: 'Alpha' } });
    expect(result).toBe('Project: Alpha');
  });

  it('renders empty string for missing variable (handlebars default)', () => {
    const result = svc.render('Hello {{missing}}!', {});
    expect(result).toBe('Hello !');
  });
});

// ── handleEvent — routing ──────────────────────────────────────────────────

describe('handleEvent — routing', () => {
  it('routes inspection.failed to SITE_ENGINEER and PROJECT_MANAGER roles', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(allDisabled()); // skip delivery
    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });
    expect(mockRepo.findUsersByRole).toHaveBeenCalledWith('tenant-001', [
      'SITE_ENGINEER',
      'PROJECT_MANAGER',
    ]);
  });

  it('routes po.status_changed directly to actor (not role lookup)', async () => {
    mockRepo.findDisabledChannels.mockResolvedValue(allDisabled());
    await svc.handleEvent({
      event_type: 'procurement.po.status_changed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });
    expect(mockRepo.findUsersByRole).not.toHaveBeenCalled();
  });

  it('routes po.approval_requested to the approver_id carried in the payload', async () => {
    mockRepo.findDisabledChannels.mockResolvedValue(allDisabled());
    await svc.handleEvent({
      event_type: 'procurement.po.approval_requested.v1',
      tenant_id: 'tenant-001',
      actor_id: 'system',
      payload: { po_id: 'po-1', approver_id: 'approver-9', tier: 'PM' },
    });
    // Targeted at the payload user — no role lookup, and the approver's channels are checked.
    // The channel argument is now the whole set (one query instead of one per channel).
    expect(mockRepo.findUsersByRole).not.toHaveBeenCalled();
    expect(mockRepo.findDisabledChannels).toHaveBeenCalledWith(
      'tenant-001',
      'approver-9',
      'procurement.po.approval_requested.v1',
      expect.arrayContaining(['IN_APP', 'EMAIL', 'LINE']),
    );
  });

  it('drops po.approval_requested when payload has no valid approver_id', async () => {
    await svc.handleEvent({
      event_type: 'procurement.po.approval_requested.v1',
      tenant_id: 'tenant-001',
      actor_id: 'system',
      payload: { po_id: 'po-1' }, // no approver_id → empty recipients
    });
    expect(mockRepo.findUsersByRole).not.toHaveBeenCalled();
    expect(mockRepo.findDisabledChannels).not.toHaveBeenCalled();
    expect(mockRepo.createNotification).not.toHaveBeenCalled();
  });

  it('skips unknown event_type and logs warning', async () => {
    await svc.handleEvent({
      event_type: 'unknown.event.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });
    expect(mockRepo.findUsersByRole).not.toHaveBeenCalled();
    expect(mockRepo.createNotification).not.toHaveBeenCalled();
  });

  it('routes variance.alert to FINANCE and TENANT_ADMIN', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([]);
    await svc.handleEvent({
      event_type: 'finance.variance.alert.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });
    expect(mockRepo.findUsersByRole).toHaveBeenCalledWith('tenant-001', [
      'FINANCE',
      'TENANT_ADMIN',
    ]);
  });

  it('routes report.created to PROJECT_MANAGER', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([]);
    await svc.handleEvent({
      event_type: 'site.report.created.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });
    expect(mockRepo.findUsersByRole).toHaveBeenCalledWith('tenant-001', ['PROJECT_MANAGER']);
  });

  it('routes vendor_invoice.received to FINANCE', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([]);
    await svc.handleEvent({
      event_type: 'procurement.invoice.received.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });
    expect(mockRepo.findUsersByRole).toHaveBeenCalledWith('tenant-001', ['FINANCE']);
  });

  it('routes file.document.quarantined to SYSTEM_ADMIN', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([]);
    await svc.handleEvent({
      event_type: 'file.document.quarantined.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: { file_id: 'fid-1', threat_type: 'Eicar' },
    });
    expect(mockRepo.findUsersByRole).toHaveBeenCalledWith('tenant-001', ['SYSTEM_ADMIN']);
  });

  it('routes site.conflict.flagged to SITE_ENGINEER, PROJECT_MANAGER and TENANT_ADMIN', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([]);
    await svc.handleEvent({
      event_type: 'site.conflict.flagged.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {
        conflict_id: 'conf-1',
        entity_type: 'issues',
        entity_id: 'issue-1',
        conflict_type: 'STATUS_CONFLICT',
      },
    });
    expect(mockRepo.findUsersByRole).toHaveBeenCalledWith('tenant-001', [
      'SITE_ENGINEER',
      'PROJECT_MANAGER',
      'TENANT_ADMIN',
    ]);
  });
});

// ── preference filtering ───────────────────────────────────────────────────

describe('preference filtering', () => {
  it('skips channel when is_enabled = false', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(allDisabled());
    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });
    expect(mockRepo.createNotification).not.toHaveBeenCalled();
  });

  it('skips channel when no template found', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(new Set<string>());
    mockRepo.findTemplatesByChannel.mockResolvedValue(new Map());
    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });
    expect(mockRepo.createNotification).not.toHaveBeenCalled();
  });
});

// ── §19.6 critical safety override ─────────────────────────────────────────

// "Critical safety notifications (SafetyIncidentReported, SafetyViolationDetected) cannot be
// disabled." (19-notification-architecture §19.6; master:5100-5101 adds "or quieted — always
// delivered"). Both halves are asserted here, each against a control proving the filter it
// bypasses is genuinely active for a non-critical event.
describe('critical safety notifications (§19.6)', () => {
  const criticalTemplate = {
    template_id: 't-safety',
    tenant_id: null,
    event_type: 'safety.incident.created.v1',
    channel: 'IN_APP',
    subject_template: 'Safety incident reported ({{severity}})',
    body_template: 'A {{severity}} incident on project {{project_id}}.',
    is_active: true,
  };

  const emitIncident = async (): Promise<void> => {
    await svc.handleEvent({
      event_type: 'safety.incident.created.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: { project_id: 'proj-001', severity: 'CRITICAL', incident_id: 'inc-001' },
    });
  };

  beforeEach(() => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findTemplatesByChannel.mockResolvedValue(templatesFor(criticalTemplate));
    mockRepo.createNotification.mockResolvedValue({
      ...notifRow,
      event_type: 'safety.incident.created.v1',
    });
    mockRepo.markSent.mockResolvedValue(undefined);
  });

  it('delivers even when the recipient has disabled every channel', async () => {
    mockRepo.findDisabledChannels.mockResolvedValue(allDisabled());

    await emitIncident();

    // Every channel the recipient switched off is still written and dispatched.
    expect(mockRepo.createNotification).toHaveBeenCalledTimes(ALL_CHANNELS.length);
    expect(mockSse.push).toHaveBeenCalled();
  });

  it('control: a non-critical event with the same disabled set is suppressed', async () => {
    mockRepo.findDisabledChannels.mockResolvedValue(allDisabled());
    mockRepo.findTemplatesByChannel.mockResolvedValue(
      templatesFor({ ...criticalTemplate, event_type: 'site.inspection.failed.v1' }),
    );

    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });

    expect(mockRepo.createNotification).not.toHaveBeenCalled();
  });

  it('pushes inside the quiet window when the recipient is disabled and quieted at once', async () => {
    // The two suppressors the spec forbids for this event, applied together.
    mockRepo.findDisabledChannels.mockResolvedValue(allDisabled());
    mockRepo.getUserQuietHours.mockResolvedValue({ start: '00:00:00', end: '23:59:00' });
    mockRepo.findDeviceTokens.mockResolvedValue([{ push_token: 'ExponentPushToken[x]' }]);
    mockPush.send.mockResolvedValue(undefined);

    await emitIncident();

    expect(mockPush.send).toHaveBeenCalled();
  });

  it('control: a non-critical event in the same quiet window sends no push', async () => {
    mockRepo.findDisabledChannels.mockResolvedValue(new Set<string>());
    mockRepo.getUserQuietHours.mockResolvedValue({ start: '00:00:00', end: '23:59:00' });
    mockRepo.findDeviceTokens.mockResolvedValue([{ push_token: 'ExponentPushToken[x]' }]);
    mockRepo.findTemplatesByChannel.mockResolvedValue(
      templatesFor({ ...criticalTemplate, event_type: 'site.inspection.failed.v1' }),
    );
    mockRepo.createNotification.mockResolvedValue({ ...notifRow });

    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });

    expect(mockPush.send).not.toHaveBeenCalled();
  });
});

// ── §19.6 critical set completeness ────────────────────────────────────────

// §19.6 names two events that "cannot be disabled": SafetyIncidentReported and
// SafetyViolationDetected. Only the first exists as a canonical event type; the second appears
// solely as a business-event display name (16-enterprise-event-flow §Safety) with no §32.4 name, no
// .avsc and no producer, so it cannot be added to the set without inventing an event.
//
// This guard exists so that gap stops being silent: the moment a safety incident/violation event
// enters the canonical catalogue, this test fails until it is also marked critical. Without it,
// adding safety.violation.detected.v1 later would quietly ship a notification users can disable —
// which is the exact defect §19.6 forbids.
describe('§19.6 critical event set', () => {
  const criticalCandidates = CANONICAL_EVENT_TYPES.filter(
    (e) => e.startsWith('safety.') && /incident|violation/.test(e),
  );

  it('covers every canonical safety incident/violation event', () => {
    const uncovered = criticalCandidates.filter((e) => !CRITICAL_EVENT_TYPES.has(e));
    expect(uncovered).toEqual([]);
  });

  it('lists only events that actually exist in the canonical catalogue', () => {
    const phantom = [...CRITICAL_EVENT_TYPES].filter((e) => !CANONICAL_EVENT_TYPES.includes(e));
    expect(phantom).toEqual([]);
  });

  it('has the violation event wired, not merely named', () => {
    // This slot used to assert that no canonical `violation` event existed — a placeholder for the
    // §19.6 gap, written so it would fail the day someone minted one. It did (Phase 23, product-owner
    // decision 2026-08-25), so the assertion becomes the thing the placeholder was protecting:
    // a critical event is only real when it is ALSO routed, subscribed and templated. Membership of
    // CRITICAL_EVENT_TYPES alone would mean "cannot be disabled" on a notification never created.
    const violations = CANONICAL_EVENT_TYPES.filter((e) => e.includes('violation'));
    expect(violations).toEqual(['safety.violation.detected.v1']);
    for (const event of violations) {
      expect(CRITICAL_EVENT_TYPES.has(event)).toBe(true);
      expect(Object.hasOwn(EVENT_ROLE_MAP, event)).toBe(true);
    }
  });
});

// ── IN_APP channel dispatch ────────────────────────────────────────────────

describe('IN_APP channel dispatch', () => {
  it('pushes SSE event and marks sent on IN_APP delivery', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(onlyEnabled('IN_APP'));
    mockRepo.findTemplatesByChannel.mockResolvedValue(
      templatesFor({
        template_id: 't1',
        tenant_id: null,
        event_type: 'site.inspection.failed.v1',
        channel: 'IN_APP',
        subject_template: 'Alert',
        body_template: 'Inspection failed on {{project_id}}',
        is_active: true,
      }),
    );
    mockRepo.createNotification.mockResolvedValue({ ...notifRow });
    mockRepo.markSent.mockResolvedValue(undefined);

    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: { project_id: 'proj-001' },
    });

    expect(mockSse.push).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ notification_id: 'notif-001' }),
    );
    expect(mockRepo.markSent).toHaveBeenCalledWith('tenant-001', 'notif-001');
  });

  it('marks failed when SSE push throws', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(onlyEnabled('IN_APP'));
    mockRepo.findTemplatesByChannel.mockResolvedValue(
      templatesFor({
        template_id: 't1',
        tenant_id: null,
        event_type: 'site.inspection.failed.v1',
        channel: 'IN_APP',
        subject_template: null,
        body_template: 'Body',
        is_active: true,
      }),
    );
    mockRepo.createNotification.mockResolvedValue({ ...notifRow });
    mockSse.push.mockImplementation(() => {
      throw new Error('SSE error');
    });
    mockRepo.markFailed.mockResolvedValue(undefined);

    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });

    expect(mockRepo.markFailed).toHaveBeenCalledWith('tenant-001', 'notif-001');
  });

  it('swallows markFailed rejection without rethrowing', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(onlyEnabled('IN_APP'));
    mockRepo.findTemplatesByChannel.mockResolvedValue(
      templatesFor({
        template_id: 't1',
        tenant_id: null,
        event_type: 'site.inspection.failed.v1',
        channel: 'IN_APP',
        subject_template: null,
        body_template: 'Body',
        is_active: true,
      }),
    );
    mockRepo.createNotification.mockResolvedValue({ ...notifRow });
    mockSse.push.mockImplementation(() => {
      throw new Error('SSE error');
    });
    // markFailed also rejects — the .catch(() => undefined) must handle it silently
    mockRepo.markFailed.mockRejectedValue(new Error('DB error'));

    await expect(
      svc.handleEvent({
        event_type: 'site.inspection.failed.v1',
        tenant_id: 'tenant-001',
        actor_id: 'actor-001',
        payload: {},
      }),
    ).resolves.not.toThrow();
  });
});

// ── Expo push alongside IN_APP ─────────────────────────────────────────────

describe('Expo push alongside IN_APP', () => {
  it('sends Expo push to all registered device tokens', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(onlyEnabled('IN_APP'));
    mockRepo.findTemplatesByChannel.mockResolvedValue(
      templatesFor({
        template_id: 't1',
        tenant_id: null,
        event_type: 'site.inspection.failed.v1',
        channel: 'IN_APP',
        subject_template: 'Alert',
        body_template: 'Body',
        is_active: true,
      }),
    );
    mockRepo.createNotification.mockResolvedValue({ ...notifRow });
    mockRepo.findDeviceTokens.mockResolvedValue([
      { token_id: 'tok1', user_id: 'u1', push_token: 'ExponentPushToken[abc]', platform: 'IOS' },
    ]);
    mockPush.send.mockResolvedValue(undefined);
    mockRepo.markSent.mockResolvedValue(undefined);

    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });

    expect(mockPush.send).toHaveBeenCalledWith(
      expect.objectContaining({ pushToken: 'ExponentPushToken[abc]' }),
    );
  });

  it('still marks sent even when push.send rejects', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(onlyEnabled('IN_APP'));
    mockRepo.findTemplatesByChannel.mockResolvedValue(
      templatesFor({
        template_id: 't1',
        tenant_id: null,
        event_type: 'site.inspection.failed.v1',
        channel: 'IN_APP',
        subject_template: null,
        body_template: 'Body',
        is_active: true,
      }),
    );
    mockRepo.createNotification.mockResolvedValue({ ...notifRow });
    mockRepo.findDeviceTokens.mockResolvedValue([
      { token_id: 'tok1', user_id: 'u1', push_token: 'ExponentPushToken[abc]', platform: 'IOS' },
    ]);
    mockPush.send.mockRejectedValue(new Error('Expo error'));
    mockRepo.markSent.mockResolvedValue(undefined);

    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });

    expect(mockRepo.markSent).toHaveBeenCalledWith('tenant-001', 'notif-001');
  });
});

// ── EMAIL channel dispatch ─────────────────────────────────────────────────

describe('EMAIL channel dispatch', () => {
  it('sends email and marks sent', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'user@example.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(onlyEnabled('EMAIL'));
    mockRepo.findTemplatesByChannel.mockResolvedValue(
      templatesFor({
        template_id: 't2',
        tenant_id: null,
        event_type: 'site.inspection.failed.v1',
        channel: 'EMAIL',
        subject_template: 'Subject',
        body_template: 'Body',
        is_active: true,
      }),
    );
    mockRepo.createNotification.mockResolvedValue({ ...notifRow, channel: 'EMAIL' });
    mockEmail.send.mockResolvedValue(undefined);
    mockRepo.markSent.mockResolvedValue(undefined);

    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });

    expect(mockEmail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' }),
    );
    expect(mockRepo.markSent).toHaveBeenCalled();
  });
});

// ── LINE channel dispatch ──────────────────────────────────────────────────

describe('LINE channel dispatch', () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('sends LINE message when LINE_USER_ID env var is set', async () => {
    process.env = { ...OLD_ENV, LINE_USER_ID_u1: 'U_line_user_001' };
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(onlyEnabled('LINE'));
    mockRepo.findTemplatesByChannel.mockResolvedValue(
      templatesFor({
        template_id: 't3',
        tenant_id: null,
        event_type: 'site.inspection.failed.v1',
        channel: 'LINE',
        subject_template: null,
        body_template: 'Inspection failed',
        is_active: true,
      }),
    );
    mockRepo.createNotification.mockResolvedValue({
      ...notifRow,
      channel: 'LINE',
    });
    mockLine.send.mockResolvedValue(undefined);
    mockRepo.markSent.mockResolvedValue(undefined);

    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });

    expect(mockLine.send).toHaveBeenCalledWith(
      expect.objectContaining({ lineUserId: 'U_line_user_001' }),
    );
    expect(mockRepo.markSent).toHaveBeenCalledWith('tenant-001', 'notif-001');
  });

  it('skips LINE send when LINE_USER_ID env var is not set', async () => {
    process.env = { ...OLD_ENV };
    delete process.env['LINE_USER_ID_u1'];
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(onlyEnabled('LINE'));
    mockRepo.findTemplatesByChannel.mockResolvedValue(
      templatesFor({
        template_id: 't3',
        tenant_id: null,
        event_type: 'site.inspection.failed.v1',
        channel: 'LINE',
        subject_template: null,
        body_template: 'Inspection failed',
        is_active: true,
      }),
    );
    mockRepo.createNotification.mockResolvedValue({ ...notifRow, channel: 'LINE' });

    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });

    expect(mockLine.send).not.toHaveBeenCalled();
    expect(mockRepo.markSent).not.toHaveBeenCalled();
  });
});

// ── Read operations ────────────────────────────────────────────────────────

describe('listNotifications', () => {
  it('returns paginated notifications', async () => {
    mockRepo.findByRecipient.mockResolvedValue({ rows: [notifRow], total: 1 });
    const result = await svc.listNotifications('tenant-001', 'user-001', 1, 20);
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

describe('markRead', () => {
  it('marks notification as read', async () => {
    mockRepo.markRead.mockResolvedValue(true);
    const result = await svc.markRead('tenant-001', 'notif-001', 'user-001');
    expect(result).toBe(true);
  });
});

describe('markAllRead', () => {
  it('returns count of updated notifications', async () => {
    mockRepo.markAllRead.mockResolvedValue(5n);
    const result = await svc.markAllRead('tenant-001', 'user-001');
    expect(result.updated).toBe(5);
  });
});

describe('getPreferences', () => {
  it('returns preference list', async () => {
    const pref = {
      pref_id: 'p1',
      tenant_id: 'tenant-001',
      user_id: 'user-001',
      event_type: 'site.inspection.failed.v1',
      channel: 'IN_APP',
      is_enabled: true,
    };
    mockRepo.findPreferences.mockResolvedValue([pref]);
    const result = await svc.getPreferences('tenant-001', 'user-001');
    expect(result).toHaveLength(1);
  });
});

describe('updatePreferences', () => {
  it('upserts each preference row', async () => {
    const pref = {
      pref_id: 'p1',
      tenant_id: 'tenant-001',
      user_id: 'user-001',
      event_type: 'site.inspection.failed.v1',
      channel: 'IN_APP',
      is_enabled: false,
    };
    mockRepo.upsertPreference.mockResolvedValue(pref);
    const result = await svc.updatePreferences('tenant-001', 'user-001', [
      { event_type: 'site.inspection.failed.v1', channel: 'IN_APP', is_enabled: false },
    ]);
    expect(result).toHaveLength(1);
    expect(mockRepo.upsertPreference).toHaveBeenCalledWith(
      expect.objectContaining({ is_enabled: false }),
    );
    // No window supplied → the quiet-hours update is skipped.
    expect(mockRepo.updateQuietHours).not.toHaveBeenCalled();
  });

  it('stamps the quiet-hours window on the rows when supplied', async () => {
    mockRepo.upsertPreference.mockResolvedValue({
      pref_id: 'p1',
      event_type: 'e',
      channel: 'IN_APP',
      is_enabled: true,
    });
    mockRepo.updateQuietHours.mockResolvedValue({ updated: 1 });
    await svc.updatePreferences(
      'tenant-001',
      'user-001',
      [{ event_type: 'e', channel: 'IN_APP', is_enabled: true }],
      { start: '22:00', end: '07:00' },
    );
    expect(mockRepo.updateQuietHours).toHaveBeenCalledWith(
      'tenant-001',
      'user-001',
      '22:00',
      '07:00',
    );
  });
});

describe('registerDeviceToken', () => {
  it('upserts device token', async () => {
    const token = {
      token_id: 't1',
      tenant_id: 'tenant-001',
      user_id: 'user-001',
      push_token: 'ExponentPushToken[abc]',
      platform: 'IOS',
      created_at: new Date(),
    };
    mockRepo.upsertDeviceToken.mockResolvedValue(token);
    const result = await svc.registerDeviceToken({
      tenant_id: 'tenant-001',
      user_id: 'user-001',
      push_token: 'ExponentPushToken[abc]',
      platform: 'IOS',
    });
    expect(result.token_id).toBe('t1');
  });
});

// ── quiet hours (§19.6) ───────────────────────────────────────────────────────

describe('isWithinQuietHours', () => {
  // 2026-01-01T16:00:00Z = 23:00 Asia/Bangkok (UTC+7) → inside 22:00–07:00 overnight window.
  const at23Bkk = new Date('2026-01-01T16:00:00Z');
  // 2026-01-01T05:00:00Z = 12:00 Asia/Bangkok → outside the overnight window.
  const at12Bkk = new Date('2026-01-01T05:00:00Z');

  it('overnight window: quiet at 23:00, awake at 12:00', () => {
    expect(isWithinQuietHours(at23Bkk, 'Asia/Bangkok', '22:00:00', '07:00:00')).toBe(true);
    expect(isWithinQuietHours(at12Bkk, 'Asia/Bangkok', '22:00:00', '07:00:00')).toBe(false);
  });

  it('same-day window: quiet inside, awake outside', () => {
    expect(isWithinQuietHours(at12Bkk, 'Asia/Bangkok', '09:00:00', '17:00:00')).toBe(true);
    expect(isWithinQuietHours(at23Bkk, 'Asia/Bangkok', '09:00:00', '17:00:00')).toBe(false);
  });

  it('empty window (start==end) is never quiet', () => {
    expect(isWithinQuietHours(at23Bkk, 'Asia/Bangkok', '00:00:00', '00:00:00')).toBe(false);
  });
});

describe('quiet-hours push suppression', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T16:00:00Z')); // 23:00 Bangkok
    mockRepo.getUserQuietHours.mockResolvedValue({ start: '22:00:00', end: '07:00:00' });
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.findDisabledChannels.mockResolvedValue(onlyEnabled('IN_APP'));
    mockRepo.findTemplatesByChannel.mockResolvedValue(
      templatesFor({
        template_id: 't1',
        tenant_id: null,
        event_type: 'x',
        channel: 'IN_APP',
        subject_template: 'S',
        body_template: 'B',
        is_active: true,
      }),
    );
    mockRepo.findDeviceTokens.mockResolvedValue([
      { token_id: 'tok1', user_id: 'u1', push_token: 'ExponentPushToken[abc]', platform: 'IOS' },
    ]);
    mockRepo.markSent.mockResolvedValue(undefined);
  });
  afterEach(() => jest.useRealTimers());

  it('suppresses push for a non-critical event during quiet hours (SSE still fires)', async () => {
    mockRepo.createNotification.mockResolvedValue({
      ...notifRow,
      event_type: 'site.inspection.failed.v1',
    });
    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'a',
      payload: {},
    });
    expect(mockPush.send).not.toHaveBeenCalled();
    expect(mockSse.push).toHaveBeenCalled();
    expect(mockRepo.markSent).toHaveBeenCalled();
  });

  it('still pushes a critical safety event during quiet hours', async () => {
    mockRepo.createNotification.mockResolvedValue({
      ...notifRow,
      event_type: 'safety.incident.created.v1',
    });
    mockPush.send.mockResolvedValue(undefined);
    await svc.handleEvent({
      event_type: 'safety.incident.created.v1',
      tenant_id: 'tenant-001',
      actor_id: 'a',
      payload: {},
    });
    expect(mockPush.send).toHaveBeenCalled();
  });
});

// ── escalation delivery (§19.3) ───────────────────────────────────────────────

describe('escalate', () => {
  it('creates an IN_APP notice + SSE + email for each role user', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'pm1', email: 'pm@b.com' }]);
    mockRepo.createNotification.mockResolvedValue({ ...notifRow, recipient_id: 'pm1' });
    mockRepo.markSent.mockResolvedValue(undefined);
    mockEmail.send.mockResolvedValue(undefined);

    await svc.escalate('tenant-001', ['PROJECT_MANAGER'], 'Escalation', 'Body');

    expect(mockRepo.findUsersByRole).toHaveBeenCalledWith('tenant-001', ['PROJECT_MANAGER']);
    expect(mockSse.push).toHaveBeenCalledWith('pm1', expect.any(Object));
    expect(mockRepo.markSent).toHaveBeenCalled();
    expect(mockEmail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'pm@b.com', subject: 'Escalation' }),
    );
  });

  it('skips email when the user has no address', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'pm1', email: '' }]);
    mockRepo.createNotification.mockResolvedValue({ ...notifRow, recipient_id: 'pm1' });
    mockRepo.markSent.mockResolvedValue(undefined);

    await svc.escalate('tenant-001', ['PROJECT_MANAGER'], 'Escalation', 'Body');
    expect(mockEmail.send).not.toHaveBeenCalled();
  });

  it('still delivers in-app when the email provider is down', async () => {
    // §19.3 escalations fire on unacknowledged SAFETY incidents. A SendGrid outage must not take the
    // in-app notice down with it — the .catch on the email send is what keeps one channel's failure
    // from becoming an unnotified safety escalation.
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'pm1', email: 'pm@b.com' }]);
    mockRepo.createNotification.mockResolvedValue({ ...notifRow, recipient_id: 'pm1' });
    mockRepo.markSent.mockResolvedValue(undefined);
    mockEmail.send.mockRejectedValue(new Error('sendgrid 503'));

    await expect(
      svc.escalate('tenant-001', ['PROJECT_MANAGER'], 'Escalation', 'Body'),
    ).resolves.toBeUndefined();

    expect(mockSse.push).toHaveBeenCalledWith('pm1', expect.any(Object));
    expect(mockRepo.markSent).toHaveBeenCalled();
  });
});

// ── digest delivery (§19.3) ───────────────────────────────────────────────────

describe('deliverDigest', () => {
  it('emails role users who have an address', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([
      { user_id: 'pm1', email: 'pm@b.com' },
      { user_id: 'pm2', email: '' },
    ]);
    mockEmail.send.mockResolvedValue(undefined);

    await svc.deliverDigest('tenant-001', ['PROJECT_MANAGER'], 'Daily site summary', 'Body');

    expect(mockEmail.send).toHaveBeenCalledTimes(1);
    expect(mockEmail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'pm@b.com', subject: 'Daily site summary' }),
    );
  });

  it('one bad address does not abort the rest of the digest run', async () => {
    // The digest is a scheduled fan-out (18:00 daily / Mon 08:00). Without the per-recipient catch a
    // single hard bounce would reject the batch and everyone after it would silently get nothing.
    mockRepo.findUsersByRole.mockResolvedValue([
      { user_id: 'pm1', email: 'bounces@b.com' },
      { user_id: 'pm2', email: 'ok@b.com' },
    ]);
    mockEmail.send
      .mockRejectedValueOnce(new Error('550 mailbox unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(
      svc.deliverDigest('tenant-001', ['PROJECT_MANAGER'], 'Daily site summary', 'Body'),
    ).resolves.toBeUndefined();

    expect(mockEmail.send).toHaveBeenCalledTimes(2);
  });
});
