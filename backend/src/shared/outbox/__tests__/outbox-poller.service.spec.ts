// OutboxPollerService lifecycle tests — Rule 39(f): every onApplicationBootstrap /
// onApplicationShutdown hook needs a unit test that invokes it and asserts the handles are opened
// and closed. Source: §35.13 ESC-13; ADR-034.

const mockPollerInstance = { start: jest.fn(), stop: jest.fn() };
const mockProducerInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@cos/kafka', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => mockProducerInstance),
  OutboxPoller: jest.fn().mockImplementation(() => mockPollerInstance),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockPrismaInstance = { $disconnect: jest.fn().mockResolvedValue(undefined) };
jest.mock('../../prisma/create-prisma-client', () => ({
  createPrismaClient: jest.fn(() => mockPrismaInstance),
}));

import { OutboxPollerService } from '../outbox-poller.service';

describe('OutboxPollerService', () => {
  let svc: OutboxPollerService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['OUTBOX_POLLER_ENABLED'];
    svc = new OutboxPollerService();
  });

  it('starts the poller on application bootstrap', async () => {
    await svc.onApplicationBootstrap();

    expect(mockProducerInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockPollerInstance.start).toHaveBeenCalledTimes(1);
  });

  it('stops the poller and closes every handle on shutdown (Rule 39)', async () => {
    await svc.onApplicationBootstrap();
    await svc.onApplicationShutdown();

    expect(mockPollerInstance.stop).toHaveBeenCalledTimes(1);
    expect(mockProducerInstance.disconnect).toHaveBeenCalledTimes(1);
    expect(mockPrismaInstance.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('shutdown is safe when bootstrap never ran', async () => {
    await expect(svc.onApplicationShutdown()).resolves.toBeUndefined();

    expect(mockPollerInstance.stop).not.toHaveBeenCalled();
    expect(mockProducerInstance.disconnect).not.toHaveBeenCalled();
    expect(mockPrismaInstance.$disconnect).not.toHaveBeenCalled();
  });

  it('does not start when OUTBOX_POLLER_ENABLED=false', async () => {
    process.env['OUTBOX_POLLER_ENABLED'] = 'false';

    await svc.onApplicationBootstrap();

    expect(mockPollerInstance.start).not.toHaveBeenCalled();
    expect(mockProducerInstance.connect).not.toHaveBeenCalled();
  });
});
