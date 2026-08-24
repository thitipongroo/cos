// Unit tests — NotificationController (Phase 20)
// Direct method invocation (no supertest) — tests delegation to service/sse.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { NotificationController } from '../notification.controller';
import type { Request } from 'express';
import { of } from 'rxjs';

type AuthReq = Request & { tenantId?: string; user?: { user_id?: string } };

const mockSvc = {
  listNotifications: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
  getPreferences: jest.fn(),
  updatePreferences: jest.fn(),
  registerDeviceToken: jest.fn(),
};

const mockSse = {
  stream: jest.fn(),
};

const req = (): AuthReq => ({ tenantId: 'tenant-001', user: { user_id: 'user-001' } }) as AuthReq;

let ctrl: NotificationController;

beforeEach(() => {
  jest.resetAllMocks();
  ctrl = new NotificationController(mockSvc as never, mockSse as never);
});

describe('list', () => {
  it('delegates to svc.listNotifications with defaults', async () => {
    mockSvc.listNotifications.mockResolvedValue({ rows: [], total: 0 });
    await ctrl.list(req(), 1, 20);
    expect(mockSvc.listNotifications).toHaveBeenCalledWith('tenant-001', 'user-001', 1, 20);
  });

  it('clamps page to 1 minimum', async () => {
    mockSvc.listNotifications.mockResolvedValue({ rows: [], total: 0 });
    await ctrl.list(req(), 0, 20);
    expect(mockSvc.listNotifications).toHaveBeenCalledWith('tenant-001', 'user-001', 1, 20);
  });

  it('clamps limit to 100 maximum', async () => {
    mockSvc.listNotifications.mockResolvedValue({ rows: [], total: 0 });
    await ctrl.list(req(), 1, 500);
    expect(mockSvc.listNotifications).toHaveBeenCalledWith('tenant-001', 'user-001', 1, 100);
  });

  it('clamps limit to 1 minimum', async () => {
    mockSvc.listNotifications.mockResolvedValue({ rows: [], total: 0 });
    await ctrl.list(req(), 1, 0);
    expect(mockSvc.listNotifications).toHaveBeenCalledWith('tenant-001', 'user-001', 1, 1);
  });
});

describe('markRead', () => {
  it('delegates to svc.markRead', async () => {
    mockSvc.markRead.mockResolvedValue(true);
    await ctrl.markRead(req(), 'notif-001');
    expect(mockSvc.markRead).toHaveBeenCalledWith('tenant-001', 'notif-001', 'user-001');
  });
});

describe('markAllRead', () => {
  it('delegates to svc.markAllRead', async () => {
    mockSvc.markAllRead.mockResolvedValue({ updated: 3 });
    await ctrl.markAllRead(req());
    expect(mockSvc.markAllRead).toHaveBeenCalledWith('tenant-001', 'user-001');
  });
});

describe('getPreferences', () => {
  it('delegates to svc.getPreferences', async () => {
    mockSvc.getPreferences.mockResolvedValue([]);
    await ctrl.getPreferences(req());
    expect(mockSvc.getPreferences).toHaveBeenCalledWith('tenant-001', 'user-001');
  });
});

describe('updatePreferences', () => {
  it('delegates to svc.updatePreferences with dto.preferences (no quiet-hours window)', async () => {
    mockSvc.updatePreferences.mockResolvedValue([]);
    const dto = { preferences: [{ event_type: 'e', channel: 'EMAIL', is_enabled: false }] };
    await ctrl.updatePreferences(req(), dto as never);
    expect(mockSvc.updatePreferences).toHaveBeenCalledWith(
      'tenant-001',
      'user-001',
      dto.preferences,
      undefined,
    );
  });

  it('forwards the quiet-hours window when both edges are present', async () => {
    mockSvc.updatePreferences.mockResolvedValue([]);
    const dto = {
      preferences: [],
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
    };
    await ctrl.updatePreferences(req(), dto as never);
    expect(mockSvc.updatePreferences).toHaveBeenCalledWith('tenant-001', 'user-001', [], {
      start: '22:00',
      end: '07:00',
    });
  });
});

describe('registerDeviceToken', () => {
  it('delegates to svc.registerDeviceToken', async () => {
    mockSvc.registerDeviceToken.mockResolvedValue({ token_id: 't1' });
    const dto = { push_token: 'ExponentPushToken[abc]', platform: 'IOS' };
    await ctrl.registerDeviceToken(req(), dto as never);
    expect(mockSvc.registerDeviceToken).toHaveBeenCalledWith({
      tenant_id: 'tenant-001',
      user_id: 'user-001',
      push_token: 'ExponentPushToken[abc]',
      platform: 'IOS',
    });
  });
});

describe('stream', () => {
  it('returns SSE observable from sse.stream', () => {
    const obs = of({ data: {} as never });
    mockSse.stream.mockReturnValue(obs);
    const result = ctrl.stream(req());
    expect(mockSse.stream).toHaveBeenCalledWith('user-001');
    expect(result).toBe(obs);
  });
});
