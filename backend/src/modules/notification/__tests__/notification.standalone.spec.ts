// Unit tests — createStandaloneNotifier.
//
// This factory exists because a Temporal activity runs outside the Nest container and cannot inject
// NotificationService (§19.8: the enterprise human gate is "sent directly by
// EnterpriseProvisioningWorkflow via the Notification Service"). Hand-built graphs get no lifecycle
// hooks, so the two things that can silently rot here are the hook Nest would have called and the
// clients nobody would otherwise close. Both are asserted.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const mockDbDestroy = jest.fn().mockResolvedValue(undefined);
const mockRepoDestroy = jest.fn().mockResolvedValue(undefined);
const mockEmailInit = jest.fn();

jest.mock('../notification-prisma.service', () => ({
  NotificationPrismaService: jest.fn().mockImplementation(() => ({
    onModuleDestroy: mockDbDestroy,
    __kind: 'db',
  })),
}));
jest.mock('../notification.repository', () => ({
  NotificationRepository: jest.fn().mockImplementation((db: unknown) => ({
    onModuleDestroy: mockRepoDestroy,
    __kind: 'repo',
    db,
  })),
}));
jest.mock('../notification.sse.service', () => ({
  NotificationSseService: jest.fn().mockImplementation(() => ({ __kind: 'sse' })),
}));
jest.mock('../adapters/expo-push.adapter', () => ({
  ExpoPushAdapter: jest.fn().mockImplementation(() => ({ __kind: 'push' })),
}));
jest.mock('../adapters/sendgrid.adapter', () => ({
  SendGridAdapter: jest.fn().mockImplementation(() => ({
    __kind: 'email',
    onModuleInit: mockEmailInit,
  })),
}));
jest.mock('../adapters/line-messaging.adapter', () => ({
  LineMessagingAdapter: jest.fn().mockImplementation(() => ({ __kind: 'line' })),
}));
jest.mock('../notification.service', () => ({
  NotificationService: jest.fn().mockImplementation((...args: unknown[]) => ({
    __kind: 'service',
    args,
  })),
}));

import { createStandaloneNotifier } from '../notification.standalone';
import { NotificationService } from '../notification.service';
import { NotificationRepository } from '../notification.repository';
import { NotificationPrismaService } from '../notification-prisma.service';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createStandaloneNotifier', () => {
  it('returns a usable NotificationService', () => {
    const notifier = createStandaloneNotifier();

    expect(NotificationService).toHaveBeenCalledTimes(1);
    expect(notifier.service).toBeDefined();
  });

  it('wires the repository onto its own Prisma client', () => {
    // Nothing else supplies one outside the container; a repository built against `undefined` would
    // throw on the first query rather than at construction.
    createStandaloneNotifier();

    expect(NotificationPrismaService).toHaveBeenCalledTimes(1);
    expect(NotificationRepository).toHaveBeenCalledWith(expect.objectContaining({ __kind: 'db' }));
  });

  it('hands the service all five collaborators, in the constructor order', () => {
    createStandaloneNotifier();

    const args = (NotificationService as unknown as jest.Mock).mock.calls[0] as Array<{
      __kind: string;
    }>;
    expect(args.map((a) => a.__kind)).toEqual(['repo', 'sse', 'push', 'email', 'line']);
  });

  it('calls the SendGrid lifecycle hook Nest would have called', () => {
    // The load-bearing line. Without it sgMail never receives the API key and every human-gate email
    // fails authentication — which the adapter reports as an auth error, not as the "not configured"
    // skip it intends, so the failure would read as a credential problem instead of missing wiring.
    createStandaloneNotifier();

    expect(mockEmailInit).toHaveBeenCalledTimes(1);
  });

  it('initialises the adapter BEFORE the service can use it', () => {
    // Order matters: NotificationService is constructed with the adapter, and an activity may send
    // immediately. Initialising after construction would leave a window with an unkeyed client.
    createStandaloneNotifier();

    const initOrder = mockEmailInit.mock.invocationCallOrder[0];
    const serviceOrder = (NotificationService as unknown as jest.Mock).mock.invocationCallOrder[0];
    expect(initOrder).toBeLessThan(serviceOrder);
  });
});

describe('dispose', () => {
  it('releases both the repository and the Prisma client', () => {
    // A Temporal worker outlives the activity. Leaking a connection per human gate would exhaust the
    // pool over a long-running worker, so dispose must close what the factory opened.
    const notifier = createStandaloneNotifier();

    return notifier.dispose().then(() => {
      expect(mockRepoDestroy).toHaveBeenCalledTimes(1);
      expect(mockDbDestroy).toHaveBeenCalledTimes(1);
    });
  });

  it('does not close anything until dispose is called', () => {
    createStandaloneNotifier();

    expect(mockRepoDestroy).not.toHaveBeenCalled();
    expect(mockDbDestroy).not.toHaveBeenCalled();
  });
});
