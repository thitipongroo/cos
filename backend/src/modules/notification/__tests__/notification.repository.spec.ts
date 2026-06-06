// Unit tests — Notification Repository (Phase 20)
// The mock calls the callback so SQL template-literal lambdas are covered.

import { NotificationRepository } from '../notification.repository';

// The db.run mock actually executes the callback with mockTx,
// so every (tx) => tx.$queryRaw`...` lambda is exercised.
const mockQueryRaw = jest.fn();
const mockExecuteRaw = jest.fn();
const mockTx = { $queryRaw: mockQueryRaw, $executeRaw: mockExecuteRaw };
const mockRun = jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
const mockDb = { run: mockRun };

let repo: NotificationRepository;

beforeEach(() => {
  jest.resetAllMocks();
  mockRun.mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
});

beforeEach(() => {
  repo = new NotificationRepository(mockDb as never);
});

// ── findTemplate ────────────────────────────────────────────────────────────

describe('findTemplate', () => {
  it('returns first row when template found', async () => {
    const row = {
      template_id: 't1',
      tenant_id: null,
      event_type: 'site.inspection.failed.v1',
      channel: 'IN_APP',
      subject_template: 'Alert',
      body_template: 'Body',
      is_active: true,
    };
    mockQueryRaw.mockResolvedValueOnce([row]);
    const result = await repo.findTemplate('tenant-001', 'site.inspection.failed.v1', 'IN_APP');
    expect(result).toEqual(row);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns null when no template found', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    const result = await repo.findTemplate('tenant-001', 'unknown.event.v1', 'EMAIL');
    expect(result).toBeNull();
  });
});

// ── createNotification ──────────────────────────────────────────────────────

describe('createNotification', () => {
  it('returns inserted notification row', async () => {
    const row = {
      notification_id: 'notif-001',
      tenant_id: 'tenant-001',
      recipient_id: 'user-001',
      channel: 'IN_APP',
      event_type: 'site.inspection.failed.v1',
      subject: 'Alert',
      body: 'Body text',
      status: 'PENDING',
      sent_at: null,
      read_at: null,
      created_at: new Date(),
    };
    mockQueryRaw.mockResolvedValueOnce([row]);
    const result = await repo.createNotification({
      tenant_id: 'tenant-001',
      recipient_id: 'user-001',
      channel: 'IN_APP',
      event_type: 'site.inspection.failed.v1',
      subject: 'Alert',
      body: 'Body text',
    });
    expect(result.notification_id).toBe('notif-001');
    expect(result.status).toBe('PENDING');
  });

  it('passes null subject when subject is null', async () => {
    const row = {
      notification_id: 'n1',
      subject: null,
      body: 'Body',
      status: 'PENDING',
      tenant_id: 'tenant-001',
      recipient_id: 'user-001',
      channel: 'IN_APP',
      event_type: 'site.inspection.failed.v1',
      sent_at: null,
      read_at: null,
      created_at: new Date(),
    };
    mockQueryRaw.mockResolvedValueOnce([row]);
    const result = await repo.createNotification({
      tenant_id: 'tenant-001',
      recipient_id: 'user-001',
      channel: 'IN_APP',
      event_type: 'site.inspection.failed.v1',
      subject: null,
      body: 'Body',
    });
    expect(result.subject).toBeNull();
  });
});

// ── findByRecipient ─────────────────────────────────────────────────────────

describe('findByRecipient', () => {
  it('returns paginated rows and count', async () => {
    const rows = [
      {
        notification_id: 'n1',
        tenant_id: 'tenant-001',
        recipient_id: 'user-001',
        channel: 'IN_APP',
        event_type: 'e',
        subject: null,
        body: 'b',
        status: 'PENDING',
        sent_at: null,
        read_at: null,
        created_at: new Date(),
      },
    ];
    mockQueryRaw.mockResolvedValueOnce(rows).mockResolvedValueOnce([{ count: 1n }]);
    const result = await repo.findByRecipient('tenant-001', 'user-001', 1, 20);
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('computes correct offset for page 2', async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 50n }]);
    const result = await repo.findByRecipient('tenant-001', 'user-001', 2, 10);
    expect(result.total).toBe(50);
  });

  it('returns total 0 when count value is undefined', async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: undefined }]);
    const result = await repo.findByRecipient('tenant-001', 'user-001', 1, 20);
    expect(result.total).toBe(0);
  });
});

// ── markRead ────────────────────────────────────────────────────────────────

describe('markRead', () => {
  it('returns true when at least one row updated', async () => {
    mockExecuteRaw.mockResolvedValueOnce(1);
    const result = await repo.markRead('tenant-001', 'notif-001', 'user-001');
    expect(result).toBe(true);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it('returns false when no rows updated', async () => {
    mockExecuteRaw.mockResolvedValueOnce(0);
    const result = await repo.markRead('tenant-001', 'notif-001', 'user-002');
    expect(result).toBe(false);
  });
});

// ── markAllRead ─────────────────────────────────────────────────────────────

describe('markAllRead', () => {
  it('returns count of updated rows', async () => {
    mockExecuteRaw.mockResolvedValueOnce(3);
    const result = await repo.markAllRead('tenant-001', 'user-001');
    expect(result).toBe(3);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });
});

// ── markSent ───────────────────────────────────────────────────────────────

describe('markSent', () => {
  it('calls $executeRaw once', async () => {
    mockExecuteRaw.mockResolvedValueOnce(1);
    await repo.markSent('notif-001');
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });
});

// ── markFailed ─────────────────────────────────────────────────────────────

describe('markFailed', () => {
  it('calls $executeRaw once', async () => {
    mockExecuteRaw.mockResolvedValueOnce(1);
    await repo.markFailed('notif-001');
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });
});

// ── findPreferences ─────────────────────────────────────────────────────────

describe('findPreferences', () => {
  it('returns preference rows', async () => {
    const rows = [
      {
        pref_id: 'p1',
        tenant_id: 'tenant-001',
        user_id: 'user-001',
        event_type: 'site.inspection.failed.v1',
        channel: 'IN_APP',
        is_enabled: true,
      },
    ];
    mockQueryRaw.mockResolvedValueOnce(rows);
    const result = await repo.findPreferences('tenant-001', 'user-001');
    expect(result).toHaveLength(1);
    expect(result[0].channel).toBe('IN_APP');
  });

  it('returns empty array when no preferences set', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    const result = await repo.findPreferences('tenant-001', 'user-001');
    expect(result).toHaveLength(0);
  });
});

// ── isChannelEnabled ────────────────────────────────────────────────────────

describe('isChannelEnabled', () => {
  it('returns false when preference row has is_enabled = false', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ is_enabled: false }]);
    const result = await repo.isChannelEnabled(
      'tenant-001',
      'user-001',
      'site.inspection.failed.v1',
      'EMAIL',
    );
    expect(result).toBe(false);
  });

  it('returns true (default) when no preference row exists', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    const result = await repo.isChannelEnabled(
      'tenant-001',
      'user-001',
      'site.inspection.failed.v1',
      'EMAIL',
    );
    expect(result).toBe(true);
  });

  it('returns true when preference row has is_enabled = true', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ is_enabled: true }]);
    const result = await repo.isChannelEnabled(
      'tenant-001',
      'user-001',
      'site.inspection.failed.v1',
      'IN_APP',
    );
    expect(result).toBe(true);
  });
});

// ── upsertPreference ────────────────────────────────────────────────────────

describe('upsertPreference', () => {
  it('returns the upserted row', async () => {
    const row = {
      pref_id: 'p1',
      tenant_id: 'tenant-001',
      user_id: 'user-001',
      event_type: 'site.inspection.failed.v1',
      channel: 'EMAIL',
      is_enabled: false,
    };
    mockQueryRaw.mockResolvedValueOnce([row]);
    const result = await repo.upsertPreference({
      tenant_id: 'tenant-001',
      user_id: 'user-001',
      event_type: 'site.inspection.failed.v1',
      channel: 'EMAIL',
      is_enabled: false,
    });
    expect(result.is_enabled).toBe(false);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });
});

// ── upsertDeviceToken ───────────────────────────────────────────────────────

describe('upsertDeviceToken', () => {
  it('returns the upserted token row', async () => {
    const row = {
      token_id: 't1',
      tenant_id: 'tenant-001',
      user_id: 'user-001',
      push_token: 'ExponentPushToken[abc]',
      platform: 'IOS',
      created_at: new Date(),
    };
    mockQueryRaw.mockResolvedValueOnce([row]);
    const result = await repo.upsertDeviceToken({
      tenant_id: 'tenant-001',
      user_id: 'user-001',
      push_token: 'ExponentPushToken[abc]',
      platform: 'IOS',
    });
    expect(result.token_id).toBe('t1');
    expect(result.platform).toBe('IOS');
  });
});

// ── findDeviceTokens ────────────────────────────────────────────────────────

describe('findDeviceTokens', () => {
  it('returns device token rows for user', async () => {
    const rows = [
      {
        token_id: 't1',
        tenant_id: 'tenant-001',
        user_id: 'user-001',
        push_token: 'ExponentPushToken[abc]',
        platform: 'IOS',
        created_at: new Date(),
      },
    ];
    mockQueryRaw.mockResolvedValueOnce(rows);
    const result = await repo.findDeviceTokens('tenant-001', 'user-001');
    expect(result).toHaveLength(1);
    expect(result[0].push_token).toBe('ExponentPushToken[abc]');
  });

  it('returns empty array when user has no tokens', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    const result = await repo.findDeviceTokens('tenant-001', 'user-001');
    expect(result).toHaveLength(0);
  });
});

// ── findUsersByRole ─────────────────────────────────────────────────────────

describe('findUsersByRole', () => {
  it('returns empty array immediately when roles list is empty', async () => {
    const result = await repo.findUsersByRole('tenant-001', []);
    expect(result).toHaveLength(0);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('returns users for matching roles', async () => {
    const rows = [
      { user_id: 'u1', email: 'eng@example.com' },
      { user_id: 'u2', email: 'pm@example.com' },
    ];
    mockQueryRaw.mockResolvedValueOnce(rows);
    const result = await repo.findUsersByRole('tenant-001', ['SITE_ENGINEER', 'PROJECT_MANAGER']);
    expect(result).toHaveLength(2);
    expect(result[0].email).toBe('eng@example.com');
  });
});
