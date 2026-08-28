// Unit tests — LastSeenService
// createPrismaClient is mocked so the service's platform (RLS-exempt) client is a jest stub:
//  - $executeRaw is the tagged-template UPDATE (fire-and-forget, .catch-swallowed)
//  - $disconnect is closed by onModuleDestroy
// @cos/logger is mocked to a stable debug spy so the swallowed-error path is assertable.

const mockExecuteRaw = jest.fn();
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockDebug = jest.fn();

jest.mock('@cos/logger', () => ({
  createLogger: () => ({
    debug: mockDebug,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../../prisma/create-prisma-client', () => ({
  createPrismaClient: () => ({
    $executeRaw: mockExecuteRaw,
    $disconnect: mockDisconnect,
  }),
}));

import { LastSeenService } from '../last-seen.service';

const THROTTLE_MS = 15 * 60 * 1000;

// Flush the microtask queue so a fire-and-forget .catch handler has run.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe('LastSeenService', () => {
  let service: LastSeenService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteRaw.mockResolvedValue(1);
    service = new LastSeenService();
  });

  describe('touch', () => {
    it('issues the UPDATE on the first touch (no prior throttle entry)', () => {
      service.touch('user-1', 'tenant-1');

      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
      // Tagged-template call: (TemplateStringsArray, ...interpolated values)
      expect(mockExecuteRaw).toHaveBeenCalledWith(expect.anything(), 'user-1', 'tenant-1');
    });

    it('throttles a repeat touch inside the window (prev defined && within THROTTLE_MS)', () => {
      service.touch('user-1', 'tenant-1');
      service.touch('user-1', 'tenant-1');

      // Second call short-circuits at the throttle guard — no second UPDATE.
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    });

    it('writes again once THROTTLE_MS has elapsed (prev defined && window expired)', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      service.touch('user-1', 'tenant-1');
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1_000_000 + THROTTLE_MS + 1);
      service.touch('user-1', 'tenant-1');
      expect(mockExecuteRaw).toHaveBeenCalledTimes(2);

      nowSpy.mockRestore();
    });

    it('throttles per user — a different userId is never blocked by another user’s entry', () => {
      service.touch('user-1', 'tenant-1');
      service.touch('user-2', 'tenant-1');

      expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    });

    it('swallows a rejected UPDATE and logs last-seen.touch.failed (never surfaces to caller)', async () => {
      const err = new Error('db down');
      mockExecuteRaw.mockRejectedValue(err);

      // Must not throw synchronously — it is fire-and-forget.
      expect(() => service.touch('user-err', 'tenant-1')).not.toThrow();

      await flushMicrotasks();

      expect(mockDebug).toHaveBeenCalledWith({ err }, 'last-seen.touch.failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('disconnects the prisma client', async () => {
      await service.onModuleDestroy();

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });
  });
});
