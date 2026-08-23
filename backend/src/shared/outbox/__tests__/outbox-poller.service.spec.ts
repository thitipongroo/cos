// OutboxPollerService lifecycle tests — Rule 39(f): every onApplicationBootstrap /
// onApplicationShutdown hook needs a unit test that invokes it and asserts the handles are opened
// and closed. Source: §35.13 ESC-13, ESC-22; ADR-034.

const mockPollerInstances: Array<{ start: jest.Mock; stop: jest.Mock }> = [];
const mockProducerInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@cos/kafka', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => mockProducerInstance),
  OutboxPoller: jest.fn().mockImplementation(() => {
    const inst = { start: jest.fn(), stop: jest.fn() };
    mockPollerInstances.push(inst);
    return inst;
  }),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// One Prisma client per datasource; each records the connection string it was built with so the
// tests can tell the shared client from a dedicated-tenant one.
const mockPrismaInstances: Array<{
  url: string | undefined;
  $queryRaw: jest.Mock;
  $disconnect: jest.Mock;
}> = [];
jest.mock('../../prisma/create-prisma-client', () => ({
  createPrismaClient: jest.fn((url?: string) => {
    const inst = {
      url,
      $queryRaw: jest.fn().mockResolvedValue([]),
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };
    mockPrismaInstances.push(inst);
    return inst;
  }),
}));

import { OutboxPollerService } from '../outbox-poller.service';

/** The client built without a URL — the shared database. */
const sharedPrisma = () => mockPrismaInstances[0]!;

describe('OutboxPollerService', () => {
  let svc: OutboxPollerService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPollerInstances.length = 0;
    mockPrismaInstances.length = 0;
    delete process.env['OUTBOX_POLLER_ENABLED'];
    delete process.env['OUTBOX_POLLER_TENANT_REFRESH_MS'];
    svc = new OutboxPollerService();
  });

  afterEach(async () => {
    await svc.onApplicationShutdown();
  });

  it('starts the shared-database poller on application bootstrap', async () => {
    await svc.onApplicationBootstrap();

    expect(mockProducerInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockPollerInstances).toHaveLength(1);
    expect(mockPollerInstances[0]!.start).toHaveBeenCalledTimes(1);
    expect(sharedPrisma().url).toBeUndefined();
  });

  it('stops every poller and closes every handle on shutdown (Rule 39)', async () => {
    await svc.onApplicationBootstrap();
    await svc.onApplicationShutdown();

    expect(mockPollerInstances[0]!.stop).toHaveBeenCalledTimes(1);
    expect(mockProducerInstance.disconnect).toHaveBeenCalledTimes(1);
    expect(sharedPrisma().$disconnect).toHaveBeenCalledTimes(1);
  });

  it('shutdown is safe when bootstrap never ran', async () => {
    await expect(svc.onApplicationShutdown()).resolves.toBeUndefined();

    expect(mockPollerInstances).toHaveLength(0);
    expect(mockProducerInstance.disconnect).not.toHaveBeenCalled();
  });

  it('does not start when OUTBOX_POLLER_ENABLED=false', async () => {
    process.env['OUTBOX_POLLER_ENABLED'] = 'false';

    await svc.onApplicationBootstrap();

    expect(mockPollerInstances).toHaveLength(0);
    expect(mockProducerInstance.connect).not.toHaveBeenCalled();
  });

  // ── §35.13 ESC-22 — one poller per datasource ────────────────────────────
  //
  // An ENTERPRISE tenant's outbox rows live in that tenant's own database. A single poller bound
  // to DATABASE_URL would never read them and the events would sit unpublished forever, silently.
  describe('dedicated-database pollers (ESC-22)', () => {
    it('starts one additional poller per active dedicated database', async () => {
      const svc2 = new OutboxPollerService();
      // The shared client is built first; make its tenant query return two dedicated DBs.
      const { createPrismaClient } = jest.requireMock('../../prisma/create-prisma-client');
      (createPrismaClient as jest.Mock).mockImplementationOnce(() => {
        const inst = {
          url: undefined,
          $queryRaw: jest
            .fn()
            .mockResolvedValue([
              { dedicated_db_url: 'postgresql://ent-a/db' },
              { dedicated_db_url: 'postgresql://ent-b/db' },
            ]),
          $disconnect: jest.fn().mockResolvedValue(undefined),
        };
        mockPrismaInstances.push(inst);
        return inst;
      });

      await svc2.onApplicationBootstrap();

      // shared + 2 dedicated
      expect(mockPollerInstances).toHaveLength(3);
      expect(mockPrismaInstances.map((p) => p.url)).toEqual([
        undefined,
        'postgresql://ent-a/db',
        'postgresql://ent-b/db',
      ]);
      for (const p of mockPollerInstances) expect(p.start).toHaveBeenCalledTimes(1);

      await svc2.onApplicationShutdown();
      for (const p of mockPollerInstances) expect(p.stop).toHaveBeenCalledTimes(1);
      for (const p of mockPrismaInstances) expect(p.$disconnect).toHaveBeenCalledTimes(1);
    });

    it('does not start a second poller for a datasource it already polls', async () => {
      await svc.onApplicationBootstrap();
      sharedPrisma().$queryRaw.mockResolvedValue([{ dedicated_db_url: 'postgresql://ent-a/db' }]);

      await (
        svc as unknown as { refreshDedicatedPollers(): Promise<void> }
      ).refreshDedicatedPollers();
      expect(mockPollerInstances).toHaveLength(2);

      // second refresh sees the same tenant — no new poller, no new client
      await (
        svc as unknown as { refreshDedicatedPollers(): Promise<void> }
      ).refreshDedicatedPollers();
      expect(mockPollerInstances).toHaveLength(2);
      expect(mockPrismaInstances).toHaveLength(2);
    });

    it('survives a failing tenant lookup and retries on the next refresh', async () => {
      await svc.onApplicationBootstrap();
      sharedPrisma().$queryRaw.mockRejectedValueOnce(new Error('shared db unreachable'));

      await expect(
        (svc as unknown as { refreshDedicatedPollers(): Promise<void> }).refreshDedicatedPollers(),
      ).resolves.toBeUndefined();
      expect(mockPollerInstances).toHaveLength(1);

      // next refresh succeeds and picks the tenant up
      sharedPrisma().$queryRaw.mockResolvedValue([{ dedicated_db_url: 'postgresql://ent-a/db' }]);
      await (
        svc as unknown as { refreshDedicatedPollers(): Promise<void> }
      ).refreshDedicatedPollers();
      expect(mockPollerInstances).toHaveLength(2);
    });

    it('survives a dedicated client that cannot be constructed', async () => {
      await svc.onApplicationBootstrap();
      sharedPrisma().$queryRaw.mockResolvedValue([{ dedicated_db_url: 'postgresql://broken/db' }]);
      const { createPrismaClient } = jest.requireMock('../../prisma/create-prisma-client');
      (createPrismaClient as jest.Mock).mockImplementationOnce(() => {
        throw new Error('bad connection string');
      });

      await expect(
        (svc as unknown as { refreshDedicatedPollers(): Promise<void> }).refreshDedicatedPollers(),
      ).resolves.toBeUndefined();
      expect(mockPollerInstances).toHaveLength(1);
    });

    it('refresh is a no-op before bootstrap has built the shared poller', async () => {
      await expect(
        (svc as unknown as { refreshDedicatedPollers(): Promise<void> }).refreshDedicatedPollers(),
      ).resolves.toBeUndefined();
      expect(mockPollerInstances).toHaveLength(0);
    });

    it('refreshes on the configured interval and clears the timer on shutdown', async () => {
      jest.useFakeTimers();
      try {
        process.env['OUTBOX_POLLER_TENANT_REFRESH_MS'] = '1000';
        const svc2 = new OutboxPollerService();
        await svc2.onApplicationBootstrap();

        const shared = mockPrismaInstances[0]!;
        expect(shared.$queryRaw).toHaveBeenCalledTimes(1); // the bootstrap refresh
        shared.$queryRaw.mockResolvedValue([{ dedicated_db_url: 'postgresql://ent-late/db' }]);

        jest.advanceTimersByTime(1000);
        await Promise.resolve(); // let the scheduled refresh's promise settle
        await Promise.resolve();
        expect(shared.$queryRaw).toHaveBeenCalledTimes(2);

        await svc2.onApplicationShutdown();
        jest.advanceTimersByTime(5000);
        expect(shared.$queryRaw).toHaveBeenCalledTimes(2); // timer cleared
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
