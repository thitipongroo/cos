// The Temporal worker entrypoint (TDD OQ-32).
//
// Three worker files existed for months and nothing started any of them: no script, no Dockerfile,
// no Compose service, no CI step. Every workflow they should have run was accepted by the Temporal
// server and recorded as Running while no worker polled its queue — POST /procurement/rfqs/:id
// /publish answered 200 and the RFQ stayed DRAFT forever. This process is what starts them, so the
// two things worth asserting are that it starts ALL THREE, and that losing one takes the process
// down instead of leaving it serving two queues and looking healthy.

const runProcurementWorker = jest.fn();
const runEnterpriseProvisioningWorker = jest.fn();
const runDataExportWorker = jest.fn();

jest.mock('../../modules/procurement/workflows/worker', () => ({
  runProcurementWorker: () => runProcurementWorker(),
}));
jest.mock('../../modules/tenant/workflows/enterprise-provisioning.worker', () => ({
  runEnterpriseProvisioningWorker: () => runEnterpriseProvisioningWorker(),
}));
jest.mock('../../modules/identity/data-export/workflows/worker', () => ({
  runDataExportWorker: () => runDataExportWorker(),
}));

import { AddressInfo } from 'net';
import { get } from 'http';
import { runAllBackendWorkers } from '../main';

/** GET a path off the health server the entrypoint just started. */
function probe(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    }).on('error', reject);
  });
}

/** The health server the run created — it is the only listening handle in the process. */
function listeningPort(): number {
  const handles = (
    process as unknown as { _getActiveHandles(): Array<{ address?: () => AddressInfo }> }
  )._getActiveHandles();
  for (const h of handles) {
    const addr = typeof h.address === 'function' ? h.address() : undefined;
    if (addr && typeof addr === 'object' && 'port' in addr) return addr.port;
  }
  throw new Error('no health server is listening');
}

describe('runAllBackendWorkers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Port 0: the OS picks a free one, so the suite cannot collide with a developer's running
    // worker or with another jest project on 8090.
    process.env['WORKER_HEALTH_PORT'] = '0';
  });

  it('starts all three queues and resolves when every worker has stopped', async () => {
    runProcurementWorker.mockResolvedValue(undefined);
    runEnterpriseProvisioningWorker.mockResolvedValue(undefined);
    runDataExportWorker.mockResolvedValue(undefined);

    await expect(runAllBackendWorkers()).resolves.toBeUndefined();

    expect(runProcurementWorker).toHaveBeenCalled();
    expect(runEnterpriseProvisioningWorker).toHaveBeenCalled();
    expect(runDataExportWorker).toHaveBeenCalled();
  });

  it('one worker failing brings the whole process down', async () => {
    // Promise.all, not allSettled: a process that keeps serving two queues while silently having
    // lost the third is the exact failure OQ-32 is about — present, healthy-looking, not working.
    runProcurementWorker.mockResolvedValue(undefined);
    runEnterpriseProvisioningWorker.mockRejectedValue(new Error('temporal unreachable'));
    runDataExportWorker.mockResolvedValue(undefined);

    await expect(runAllBackendWorkers()).rejects.toThrow('temporal unreachable');
  });

  it('the health server is closed on the way out, however it exits', async () => {
    // It is in a `finally` for the failure case: a worker that dies leaving a listening socket
    // behind keeps the process alive, so Kubernetes never restarts what it cannot see has died.
    runProcurementWorker.mockRejectedValue(new Error('down'));
    runEnterpriseProvisioningWorker.mockResolvedValue(undefined);
    runDataExportWorker.mockResolvedValue(undefined);

    await expect(runAllBackendWorkers()).rejects.toThrow('down');
    expect(() => listeningPort()).toThrow('no health server is listening');
  });

  describe('the health endpoint', () => {
    let port: number;
    let finished: Promise<unknown>;
    let release: () => void;

    beforeEach(async () => {
      // Hold the workers open so the server is still listening while we probe it.
      const held = new Promise<void>((r) => (release = r));
      runProcurementWorker.mockReturnValue(held);
      runEnterpriseProvisioningWorker.mockResolvedValue(undefined);
      runDataExportWorker.mockResolvedValue(undefined);
      finished = runAllBackendWorkers();
      await new Promise((r) => setImmediate(r));
      port = listeningPort();
    });

    afterEach(async () => {
      release();
      await finished;
    });

    it('answers /health/live with the queues it serves', async () => {
      const res = await probe(port, '/health/live');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({
        status: 'ok',
        queues: ['procurement', 'enterprise-provisioning', 'data-export'],
      });
    });

    it('answers /health/ready the same way', async () => {
      // There is no readiness signal a worker can honestly give — it polls an outbound queue rather
      // than accepting traffic — so the chart points both probes at the same answer.
      const res = await probe(port, '/health/ready');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body).status).toBe('ok');
    });

    it('404s anything else, rather than reporting healthy for every path', async () => {
      const res = await probe(port, '/');
      expect(res.status).toBe(404);
    });
  });
});
