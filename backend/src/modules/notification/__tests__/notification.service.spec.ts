// Unit tests — Notification Service (Phase 20)
// Focus: template rendering, consumer routing, preference filtering.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { NotificationService } from '../notification.service';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockRepo = {
  findUsersByRole: jest.fn(),
  isChannelEnabled: jest.fn(),
  findTemplate: jest.fn(),
  createNotification: jest.fn(),
  markSent: jest.fn(),
  markFailed: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
  findByRecipient: jest.fn(),
  findPreferences: jest.fn(),
  upsertPreference: jest.fn(),
  upsertDeviceToken: jest.fn(),
  findDeviceTokens: jest.fn(),
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
    mockRepo.isChannelEnabled.mockResolvedValue(false); // skip delivery
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
    mockRepo.isChannelEnabled.mockResolvedValue(false);
    await svc.handleEvent({
      event_type: 'procurement.po.status_changed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });
    expect(mockRepo.findUsersByRole).not.toHaveBeenCalled();
  });

  it('routes po.approval_requested to the approver_id carried in the payload', async () => {
    mockRepo.isChannelEnabled.mockResolvedValue(false);
    await svc.handleEvent({
      event_type: 'procurement.po.approval_requested.v1',
      tenant_id: 'tenant-001',
      actor_id: 'system',
      payload: { po_id: 'po-1', approver_id: 'approver-9', tier: 'PM' },
    });
    // Targeted at the payload user — no role lookup, and the approver's channels are checked.
    expect(mockRepo.findUsersByRole).not.toHaveBeenCalled();
    expect(mockRepo.isChannelEnabled).toHaveBeenCalledWith(
      'tenant-001',
      'approver-9',
      'procurement.po.approval_requested.v1',
      expect.any(String),
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
    expect(mockRepo.isChannelEnabled).not.toHaveBeenCalled();
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
    mockRepo.isChannelEnabled.mockResolvedValue(false);
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
    mockRepo.isChannelEnabled.mockResolvedValue(true);
    mockRepo.findTemplate.mockResolvedValue(null);
    await svc.handleEvent({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {},
    });
    expect(mockRepo.createNotification).not.toHaveBeenCalled();
  });
});

// ── IN_APP channel dispatch ────────────────────────────────────────────────

describe('IN_APP channel dispatch', () => {
  it('pushes SSE event and marks sent on IN_APP delivery', async () => {
    mockRepo.findUsersByRole.mockResolvedValue([{ user_id: 'u1', email: 'a@b.com' }]);
    mockRepo.isChannelEnabled.mockImplementation((_t, _u, _e, ch) =>
      Promise.resolve(ch === 'IN_APP'),
    );
    mockRepo.findTemplate.mockResolvedValue({
      template_id: 't1',
      tenant_id: null,
      event_type: 'site.inspection.failed.v1',
      channel: 'IN_APP',
      subject_template: 'Alert',
      body_template: 'Inspection failed on {{project_id}}',
      is_active: true,
    });
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
    mockRepo.isChannelEnabled.mockImplementation((_t, _u, _e, ch) =>
      Promise.resolve(ch === 'IN_APP'),
    );
    mockRepo.findTemplate.mockResolvedValue({
      template_id: 't1',
      tenant_id: null,
      event_type: 'site.inspection.failed.v1',
      channel: 'IN_APP',
      subject_template: null,
      body_template: 'Body',
      is_active: true,
    });
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
    mockRepo.isChannelEnabled.mockImplementation((_t, _u, _e, ch) =>
      Promise.resolve(ch === 'IN_APP'),
    );
    mockRepo.findTemplate.mockResolvedValue({
      template_id: 't1',
      tenant_id: null,
      event_type: 'site.inspection.failed.v1',
      channel: 'IN_APP',
      subject_template: null,
      body_template: 'Body',
      is_active: true,
    });
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
    mockRepo.isChannelEnabled.mockImplementation((_t, _u, _e, ch) =>
      Promise.resolve(ch === 'IN_APP'),
    );
    mockRepo.findTemplate.mockResolvedValue({
      template_id: 't1',
      tenant_id: null,
      event_type: 'site.inspection.failed.v1',
      channel: 'IN_APP',
      subject_template: 'Alert',
      body_template: 'Body',
      is_active: true,
    });
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
    mockRepo.isChannelEnabled.mockImplementation((_t, _u, _e, ch) =>
      Promise.resolve(ch === 'IN_APP'),
    );
    mockRepo.findTemplate.mockResolvedValue({
      template_id: 't1',
      tenant_id: null,
      event_type: 'site.inspection.failed.v1',
      channel: 'IN_APP',
      subject_template: null,
      body_template: 'Body',
      is_active: true,
    });
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
    mockRepo.isChannelEnabled.mockImplementation((_t, _u, _e, ch) =>
      Promise.resolve(ch === 'EMAIL'),
    );
    mockRepo.findTemplate.mockResolvedValue({
      template_id: 't2',
      tenant_id: null,
      event_type: 'site.inspection.failed.v1',
      channel: 'EMAIL',
      subject_template: 'Subject',
      body_template: 'Body',
      is_active: true,
    });
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
    mockRepo.isChannelEnabled.mockImplementation((_t, _u, _e, ch) =>
      Promise.resolve(ch === 'LINE'),
    );
    mockRepo.findTemplate.mockResolvedValue({
      template_id: 't3',
      tenant_id: null,
      event_type: 'site.inspection.failed.v1',
      channel: 'LINE',
      subject_template: null,
      body_template: 'Inspection failed',
      is_active: true,
    });
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
    mockRepo.isChannelEnabled.mockImplementation((_t, _u, _e, ch) =>
      Promise.resolve(ch === 'LINE'),
    );
    mockRepo.findTemplate.mockResolvedValue({
      template_id: 't3',
      tenant_id: null,
      event_type: 'site.inspection.failed.v1',
      channel: 'LINE',
      subject_template: null,
      body_template: 'Inspection failed',
      is_active: true,
    });
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
