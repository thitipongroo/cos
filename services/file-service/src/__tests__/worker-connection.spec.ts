// file-service's Temporal workers connect to config.temporal.address (D41, 2026-11-12).
//
// Both called `Worker.create()` without a `connection`, which dials localhost:7233 whatever
// TEMPORAL_ADDRESS says — so in compose and Kubernetes they could never reach Temporal. Hidden until
// the image moved to glibc (D40): on Alpine they died earlier, loading Temporal's native bridge.
// The worker files are bootstrap code outside the coverage gate (jest.config.js); this spec still
// pins the one property that was wrong.

const connection = { close: jest.fn().mockResolvedValue(undefined) };
const connect = jest.fn().mockResolvedValue(connection);
const run = jest.fn().mockResolvedValue(undefined);
const create = jest.fn().mockResolvedValue({ run });
const scheduleCreate = jest.fn().mockResolvedValue(undefined);

jest.mock('@temporalio/worker', () => ({
  NativeConnection: { connect: (opts: unknown) => connect(opts) },
  Worker: { create: (opts: unknown) => create(opts) },
}));
jest.mock('@temporalio/client', () => ({
  Connection: { lazy: () => ({}) },
  ScheduleClient: jest.fn().mockImplementation(() => ({ create: scheduleCreate })),
  ScheduleOverlapPolicy: { SKIP: 'SKIP' },
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../config', () => ({
  loadConfig: () => ({ temporal: { address: 'temporal.test:7233' } }),
}));
// Services and activities are constructed, not exercised.
jest.mock('../services/db.service', () => ({ DbService: jest.fn() }));
jest.mock('../services/minio.service', () => ({ MinioService: jest.fn() }));
jest.mock('../services/antivirus.service', () => ({ AntivirusService: jest.fn() }));
jest.mock('../services/opensearch.service', () => ({ OpenSearchService: jest.fn() }));
jest.mock('../services/kafka.service', () => ({ KafkaService: jest.fn() }));
jest.mock('../services/zip-extraction.service', () => ({ ZipExtractionService: jest.fn() }));
jest.mock('../cleanup/file-cleanup.activities', () => ({
  createFileCleanupActivities: () => ({}),
}));
jest.mock('../extraction/zip-extraction.activities', () => ({
  createZipExtractionActivities: () => ({}),
}));

import { runFileCleanupWorker } from '../cleanup/worker';
import { runZipExtractionWorker } from '../extraction/worker';

const workers: Array<[name: string, start: () => Promise<void>, taskQueue: string]> = [
  ['file-cleanup', runFileCleanupWorker, 'file-cleanup'],
  ['zip-extraction', runZipExtractionWorker, 'file-extraction'],
];

describe('file-service Temporal workers connect to config.temporal.address', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(workers)(
    '%s: Worker.create gets the connection made from the config',
    async (_n, start, taskQueue) => {
      await start();

      expect(connect).toHaveBeenCalledWith({ address: 'temporal.test:7233' });
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0]).toMatchObject({ connection, taskQueue });
      expect(run).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
    },
  );

  it.each(workers)('%s: closes the connection when the worker fails', async (_n, start) => {
    run.mockRejectedValueOnce(new Error('worker crashed'));

    await expect(start()).rejects.toThrow('worker crashed');
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it.each(workers)('%s: closes the connection when Worker.create fails', async (_n, start) => {
    create.mockRejectedValueOnce(new Error('bundle failed'));

    await expect(start()).rejects.toThrow('bundle failed');
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  // The schedule is ensured before the worker exists, so its own error comes through — after a
  // Worker.create, NativeConnection.close() would throw instead ("Workers hold a reference").
  it('file-cleanup: a schedule failure surfaces as itself, before any worker is created', async () => {
    scheduleCreate.mockRejectedValueOnce(new Error('permission denied'));

    await expect(runFileCleanupWorker()).rejects.toThrow('permission denied');
    expect(create).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
});
