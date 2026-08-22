// services/file-service/src/workers/main.ts — the Temporal worker entrypoint added for TDD OQ-32.
//
// It shipped with no tests at all, which took this package's 100% line/branch gate red and kept it
// there: `jest --coverage` reported `src/workers/main.ts  0 | 0 | 0 | 0`. The suite was never run
// after the file landed, so nothing said so.
//
// What is worth asserting is not "does Promise.all resolve" but the properties the file exists to
// guarantee: that BOTH queues start, that the probe target the chart hits actually answers, and that
// losing one queue takes the process down rather than leaving a pod that passes its probe while
// doing half the work.
//
// The module reads WORKER_HEALTH_PORT at MODULE scope, so the env var has to be set before the
// import — hence `loadWorkers()` rather than a top-level import plus a beforeEach.

const runFileCleanupWorker = jest.fn();
const runZipExtractionWorker = jest.fn();

jest.mock('../cleanup/worker', () => ({ runFileCleanupWorker: () => runFileCleanupWorker() }));
jest.mock('../extraction/worker', () => ({
  runZipExtractionWorker: () => runZipExtractionWorker(),
}));

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@cos/logger', () => ({ createLogger: () => logger }));

type WorkersModule = typeof import('../workers/main');

/**
 * Import a fresh copy of the module with WORKER_HEALTH_PORT set (or deliberately unset).
 *
 * `require` inside `isolateModulesAsync`, not a dynamic `import()`: this package's jest runs in
 * CommonJS, where `import()` throws "A dynamic import callback was invoked without
 * --experimental-vm-modules". Same pattern as jwt-verify.spec.ts.
 */
async function loadWorkers(port?: number): Promise<WorkersModule> {
  if (port === undefined) delete process.env['WORKER_HEALTH_PORT'];
  else process.env['WORKER_HEALTH_PORT'] = String(port);

  let mod!: WorkersModule;
  await jest.isolateModulesAsync(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../workers/main') as WorkersModule;
  });
  return mod;
}

/** Ask the health server what it answers on `path`, over a real socket. */
async function probe(port: number, path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.text() };
}

/** A promise held open so the health server stays up while it is probed. */
function gate(): { held: Promise<void>; release: () => void } {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => delete process.env['WORKER_HEALTH_PORT']);

describe('file-service worker entrypoint', () => {
  it('starts BOTH queues', async () => {
    const mod = await loadWorkers(18191);
    runFileCleanupWorker.mockResolvedValue(undefined);
    runZipExtractionWorker.mockResolvedValue(undefined);

    await mod.runAllFileServiceWorkers();

    // Before this file existed neither ran: the Dockerfile starts the API and nothing else, so the
    // daily hard-delete never fired and ZIP uploads queued workflows no worker executed.
    expect(runFileCleanupWorker).toHaveBeenCalledTimes(1);
    expect(runZipExtractionWorker).toHaveBeenCalledTimes(1);
  });

  it('serves the liveness path the chart probes, and 404s anything else', async () => {
    const mod = await loadWorkers(18192);
    const { held, release } = gate();
    runFileCleanupWorker.mockReturnValue(held);
    runZipExtractionWorker.mockResolvedValue(undefined);

    const running = mod.runAllFileServiceWorkers();
    await new Promise((r) => setTimeout(r, 50)); // let the listener bind

    const live = await probe(18192, '/health/live');
    expect(live.status).toBe(200);
    expect(JSON.parse(live.body)).toEqual({
      status: 'ok',
      queues: ['file-cleanup', 'zip-extraction'],
    });

    expect((await probe(18192, '/health/ready')).status).toBe(200);
    expect((await probe(18192, '/anything-else')).status).toBe(404);

    release();
    await running;
  });

  it('dies when ONE queue fails — a half-working pod must not look healthy', async () => {
    const mod = await loadWorkers(18193);
    runFileCleanupWorker.mockRejectedValue(new Error('temporal unreachable'));
    runZipExtractionWorker.mockReturnValue(new Promise(() => {})); // never settles

    // Promise.all, not allSettled: this is the OQ-32 failure mode the file's header names, and the
    // reason it is a rejection rather than a warning is that Kubernetes can only restart what
    // reports itself broken.
    await expect(mod.runAllFileServiceWorkers()).rejects.toThrow('temporal unreachable');
  });

  it('closes the health server even when a queue fails', async () => {
    const mod = await loadWorkers(18194);
    runFileCleanupWorker.mockRejectedValue(new Error('boom'));
    runZipExtractionWorker.mockResolvedValue(undefined);

    await expect(mod.runAllFileServiceWorkers()).rejects.toThrow('boom');

    // The `finally` released the port. Without it this second bind is EADDRINUSE.
    runFileCleanupWorker.mockResolvedValue(undefined);
    await expect(mod.runAllFileServiceWorkers()).resolves.toBeUndefined();
  });

  it('falls back to port 8090 when WORKER_HEALTH_PORT is unset', async () => {
    // 8090 is the port the chart probes and the convention the Go worker charts use, so the default
    // is part of the contract. Bound on a real socket rather than asserted textually: the property
    // is that an unset env var still yields a listening probe target, which is what keeps the pod
    // out of a CrashLoop.
    const mod = await loadWorkers(undefined);
    const { held, release } = gate();
    runFileCleanupWorker.mockReturnValue(held);
    runZipExtractionWorker.mockResolvedValue(undefined);

    const running = mod.runAllFileServiceWorkers();
    await new Promise((r) => setTimeout(r, 50));

    expect((await probe(8090, '/health/live')).status).toBe(200);

    release();
    await running;
  });
});
