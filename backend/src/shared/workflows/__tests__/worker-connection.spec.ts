// Each backend Temporal worker connects to TEMPORAL_ADDRESS (D41, 2026-11-12).
//
// All three called `Worker.create()` without a `connection`, which dials localhost:7233 whatever
// TEMPORAL_ADDRESS says, so none could reach Temporal outside a machine running it locally. The
// existing workflow specs never saw it: they build their own TestWorkflowEnvironment worker. This spec
// runs each worker's real `run…Worker()` with @temporalio/worker mocked and asserts that the
// connection made from TEMPORAL_ADDRESS is the one handed to Worker.create, and that it is closed
// when the worker stops.

const connection = { close: jest.fn(async () => void order.push('connection')) };
const connect = jest.fn().mockResolvedValue(connection);
const run = jest.fn().mockResolvedValue(undefined);
const create = jest.fn().mockResolvedValue({ run });

jest.mock('@temporalio/worker', () => ({
  NativeConnection: { connect: (opts: unknown) => connect(opts) },
  Worker: { create: (opts: unknown) => create(opts) },
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
// Activities and their database clients are not under test; the workers only spread them.
jest.mock('../../../modules/procurement/workflows/rfq.activities', () => ({}));
jest.mock('../../../modules/procurement/workflows/po.activities', () => ({}));
jest.mock('../../../modules/tenant/workflows/enterprise-provisioning.activities', () => ({}));
const order: string[] = [];
const disconnectExportClients = jest.fn(async () => void order.push('export-clients'));
const disconnectActivityClients = jest.fn(async () => void order.push('activity-clients'));
jest.mock('../../../modules/identity/data-export/workflows/data-export.activities', () => ({
  disconnectExportClients: () => disconnectExportClients(),
}));
jest.mock('../activity-helpers', () => ({
  disconnectActivityClients: () => disconnectActivityClients(),
}));

import { runProcurementWorker } from '../../../modules/procurement/workflows/worker';
import { runEnterpriseProvisioningWorker } from '../../../modules/tenant/workflows/enterprise-provisioning.worker';
import { runDataExportWorker } from '../../../modules/identity/data-export/workflows/worker';

const workers: Array<[name: string, start: () => Promise<void>, taskQueue: string]> = [
  ['procurement', runProcurementWorker, 'procurement'],
  ['enterprise-provisioning', runEnterpriseProvisioningWorker, 'enterprise-provisioning'],
  ['data-export', runDataExportWorker, 'data-export'],
];

describe('backend Temporal workers connect to TEMPORAL_ADDRESS', () => {
  const saved = process.env['TEMPORAL_ADDRESS'];
  beforeEach(() => {
    jest.clearAllMocks();
    order.length = 0;
  });
  afterAll(() => {
    if (saved === undefined) delete process.env['TEMPORAL_ADDRESS'];
    else process.env['TEMPORAL_ADDRESS'] = saved;
  });

  it.each(workers)(
    '%s: Worker.create gets the connection made from TEMPORAL_ADDRESS',
    async (_n, start, taskQueue) => {
      process.env['TEMPORAL_ADDRESS'] = 'temporal.test:7233';

      await start();

      expect(connect).toHaveBeenCalledWith({ address: 'temporal.test:7233' });
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0]).toMatchObject({ connection, taskQueue });
      expect(run).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
    },
  );

  it.each(workers)('%s: closes the connection when the worker fails', async (_n, start) => {
    process.env['TEMPORAL_ADDRESS'] = 'temporal.test:7233';
    run.mockRejectedValueOnce(new Error('worker crashed'));

    await expect(start()).rejects.toThrow('worker crashed');
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('falls back to localhost:7233, as the Temporal clients do, when TEMPORAL_ADDRESS is unset', async () => {
    delete process.env['TEMPORAL_ADDRESS'];

    await runProcurementWorker();

    expect(connect).toHaveBeenCalledWith({ address: 'localhost:7233' });
  });

  it.each(workers)('%s: closes the connection when Worker.create fails', async (_n, start) => {
    create.mockRejectedValueOnce(new Error('bundle failed'));

    await expect(start()).rejects.toThrow('bundle failed');
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  // The activity clients still close when the worker stops, and before the connection does.
  it.each([
    ['procurement', runProcurementWorker, ['activity-clients', 'connection']],
    ['data-export', runDataExportWorker, ['activity-clients', 'export-clients', 'connection']],
  ] as const)(
    '%s: closes its activity clients, then the connection',
    async (_n, start, expected) => {
      await start();
      expect([...order].sort()).toEqual([...expected].sort());
      expect(order[order.length - 1]).toBe('connection');
    },
  );

  it.each([
    ['procurement', runProcurementWorker],
    ['data-export', runDataExportWorker],
  ] as const)('%s: closes its activity clients when the worker fails too', async (_n, start) => {
    run.mockRejectedValueOnce(new Error('worker crashed'));
    await expect(start()).rejects.toThrow('worker crashed');
    expect(disconnectActivityClients).toHaveBeenCalledTimes(1);
    expect(order[order.length - 1]).toBe('connection');
  });
});
