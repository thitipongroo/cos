// Unit tests — Notification Channel Adapters (Phase 20)
// All mock functions created inside jest.mock factories to avoid TDZ issues from hoisting.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

// ── Expo Push Adapter ───────────────────────────────────────────────────────
// Uses __esModule: true so TypeScript's __importDefault does NOT double-wrap the default export.

jest.mock('expo-server-sdk', () => {
  const isExpoPushToken = jest.fn();
  const chunkPushNotifications = jest.fn();
  const sendPushNotificationsAsync = jest.fn();
  const expoInstance = { chunkPushNotifications, sendPushNotificationsAsync };
  function MockExpo(this: unknown) {
    return expoInstance;
  }
  (MockExpo as unknown as Record<string, unknown>).isExpoPushToken = isExpoPushToken;
  (MockExpo as unknown as Record<string, unknown>)._mocks = {
    isExpoPushToken,
    chunkPushNotifications,
    sendPushNotificationsAsync,
  };
  return { __esModule: true, default: MockExpo };
});

// ── SendGrid Adapter ────────────────────────────────────────────────────────

jest.mock('@sendgrid/mail', () => {
  const setApiKey = jest.fn();
  const send = jest.fn();
  return { setApiKey, send, _mocks: { setApiKey, send } };
});

// ── LINE Messaging Adapter ──────────────────────────────────────────────────

jest.mock('@line/bot-sdk', () => {
  const pushMessage = jest.fn();
  return {
    messagingApi: {
      MessagingApiClient: jest.fn().mockImplementation(() => ({ pushMessage })),
      _mockPushMessage: pushMessage,
    },
  };
});

import { ExpoPushAdapter } from '../adapters/expo-push.adapter';
import { SendGridAdapter } from '../adapters/sendgrid.adapter';
import { LineMessagingAdapter } from '../adapters/line-messaging.adapter';

type ExpoMocks = {
  isExpoPushToken: jest.Mock;
  chunkPushNotifications: jest.Mock;
  sendPushNotificationsAsync: jest.Mock;
};
// Access via the factory-created _mocks reference on the default export
import ExpoSdk from 'expo-server-sdk';
const expoMocks = (ExpoSdk as unknown as { _mocks: ExpoMocks })._mocks;

const sgMocks = (
  jest.requireMock('@sendgrid/mail') as { _mocks: { setApiKey: jest.Mock; send: jest.Mock } }
)._mocks;
const lineMocks = (
  jest.requireMock('@line/bot-sdk') as { messagingApi: { _mockPushMessage: jest.Mock } }
).messagingApi;

// ── Tests: ExpoPushAdapter ─────────────────────────────────────────────────

describe('ExpoPushAdapter', () => {
  let adapter: ExpoPushAdapter;

  beforeEach(() => {
    jest.resetAllMocks();
    adapter = new ExpoPushAdapter();
  });

  it('skips when push token is invalid', async () => {
    expoMocks.isExpoPushToken.mockReturnValue(false);
    await adapter.send({ pushToken: 'invalid', title: null, body: 'Hello', notificationId: 'n1' });
    expect(expoMocks.chunkPushNotifications).not.toHaveBeenCalled();
  });

  it('sends chunked notifications for a valid token', async () => {
    expoMocks.isExpoPushToken.mockReturnValue(true);
    expoMocks.chunkPushNotifications.mockReturnValue([
      [{ to: 'ExponentPushToken[abc]', body: 'Hello' }],
    ]);
    expoMocks.sendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

    await adapter.send({
      pushToken: 'ExponentPushToken[abc]',
      title: 'Alert',
      body: 'Hello',
      notificationId: 'n1',
    });

    expect(expoMocks.sendPushNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  it('logs error when a ticket has status = error (does not throw)', async () => {
    expoMocks.isExpoPushToken.mockReturnValue(true);
    expoMocks.chunkPushNotifications.mockReturnValue([[{ to: 'ExponentPushToken[abc]' }]]);
    expoMocks.sendPushNotificationsAsync.mockResolvedValue([
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);

    await expect(
      adapter.send({
        pushToken: 'ExponentPushToken[abc]',
        title: null,
        body: 'Body',
        notificationId: 'n1',
      }),
    ).resolves.not.toThrow();
  });

  it('uses undefined title when title is null', async () => {
    expoMocks.isExpoPushToken.mockReturnValue(true);
    // Return no chunks so the send loop never runs (avoids mocking sendPushNotificationsAsync)
    expoMocks.chunkPushNotifications.mockReturnValue([]);
    await adapter.send({
      pushToken: 'ExponentPushToken[abc]',
      title: null,
      body: 'Body',
      notificationId: 'n1',
    });
    const msg = expoMocks.chunkPushNotifications.mock.calls[0][0][0];
    expect(msg.title).toBeUndefined();
  });
});

// ── Tests: SendGridAdapter ─────────────────────────────────────────────────

describe('SendGridAdapter', () => {
  let adapter: SendGridAdapter;
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV };
    adapter = new SendGridAdapter();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('onModuleInit skips setApiKey when SENDGRID_API_KEY is not set', () => {
    delete process.env['SENDGRID_API_KEY'];
    adapter.onModuleInit();
    expect(sgMocks.setApiKey).not.toHaveBeenCalled();
  });

  it('onModuleInit calls setApiKey when SENDGRID_API_KEY is set', () => {
    process.env['SENDGRID_API_KEY'] = 'SG.test-key';
    adapter.onModuleInit();
    expect(sgMocks.setApiKey).toHaveBeenCalledWith('SG.test-key');
  });

  it('send skips when SENDGRID_FROM_EMAIL is not set', async () => {
    process.env['SENDGRID_API_KEY'] = 'SG.test-key';
    delete process.env['SENDGRID_FROM_EMAIL'];
    await adapter.send({ to: 'a@b.com', subject: 'S', body: 'B' });
    expect(sgMocks.send).not.toHaveBeenCalled();
  });

  it('send skips when SENDGRID_API_KEY is not set', async () => {
    delete process.env['SENDGRID_API_KEY'];
    process.env['SENDGRID_FROM_EMAIL'] = 'no-reply@cos.app';
    await adapter.send({ to: 'a@b.com', subject: 'S', body: 'B' });
    expect(sgMocks.send).not.toHaveBeenCalled();
  });

  it('send calls sgMail.send with correct params when both env vars are set', async () => {
    process.env['SENDGRID_API_KEY'] = 'SG.test-key';
    process.env['SENDGRID_FROM_EMAIL'] = 'no-reply@cos.app';
    sgMocks.send.mockResolvedValue([{ statusCode: 202 }]);

    await adapter.send({ to: 'user@example.com', subject: 'Hello', body: '<p>Body</p>' });

    expect(sgMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'no-reply@cos.app',
        subject: 'Hello',
      }),
    );
  });

  it('send uses "(no subject)" when subject is null', async () => {
    process.env['SENDGRID_API_KEY'] = 'SG.test-key';
    process.env['SENDGRID_FROM_EMAIL'] = 'no-reply@cos.app';
    sgMocks.send.mockResolvedValue([{ statusCode: 202 }]);

    await adapter.send({ to: 'user@example.com', subject: null, body: 'Body' });

    expect(sgMocks.send).toHaveBeenCalledWith(expect.objectContaining({ subject: '(no subject)' }));
  });
});

// ── Tests: LineMessagingAdapter ────────────────────────────────────────────

describe('LineMessagingAdapter', () => {
  let adapter: LineMessagingAdapter;
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV };
    // Restore MessagingApiClient implementation after resetAllMocks clears it
    (
      jest.requireMock('@line/bot-sdk').messagingApi.MessagingApiClient as jest.Mock
    ).mockImplementation(() => ({ pushMessage: lineMocks._mockPushMessage }));
    adapter = new LineMessagingAdapter();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('send is no-op when LINE_CHANNEL_ACCESS_TOKEN is not set', async () => {
    delete process.env['LINE_CHANNEL_ACCESS_TOKEN'];
    await adapter.send({ lineUserId: 'Uabc', body: 'Hello' });
    expect(lineMocks._mockPushMessage).not.toHaveBeenCalled();
  });

  it('send calls pushMessage with correct params when token is set', async () => {
    process.env['LINE_CHANNEL_ACCESS_TOKEN'] = 'test-token';
    lineMocks._mockPushMessage.mockResolvedValue({});

    await adapter.send({ lineUserId: 'Uabc123', body: 'Hello from COS' });

    expect(lineMocks._mockPushMessage).toHaveBeenCalledWith({
      to: 'Uabc123',
      messages: [{ type: 'text', text: 'Hello from COS' }],
    });
  });
});
