// HTTP metrics hook (§31.3 / QM-8). Asserts the two request metrics are emitted with the same label
// set the backend interceptor uses, and that the path label is the route *pattern* — a raw URL would
// put file ids into metric labels (unbounded cardinality + id leakage into the metrics store).
import Fastify from 'fastify';

const record = jest.fn();
const add = jest.fn();

jest.mock('@cos/tracing', () => ({
  createMetrics: () => ({
    httpRequestDuration: { record },
    httpRequestsTotal: { add },
  }),
}));

import { metricsPlugin } from '../plugins/metrics';

describe('metricsPlugin', () => {
  beforeEach(() => {
    record.mockClear();
    add.mockClear();
  });

  async function appWithRoute() {
    const app = Fastify();
    await app.register(metricsPlugin);
    app.get('/api/v1/files/:fileId', async () => ({ ok: true }));
    await app.ready();
    return app;
  }

  it('labels by route pattern, method and status — never the raw URL', async () => {
    const app = await appWithRoute();
    const res = await app.inject({ method: 'GET', url: '/api/v1/files/abc-123' });
    expect(res.statusCode).toBe(200);

    expect(add).toHaveBeenCalledWith(1, {
      method: 'GET',
      path: '/api/v1/files/:fileId',
      status: '200',
    });
    // Duration is recorded in seconds (Fastify reports elapsedTime in ms).
    const [seconds, attrs] = record.mock.calls[0] as [number, Record<string, string>];
    expect(seconds).toBeLessThan(1);
    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(attrs.path).toBe('/api/v1/files/:fileId');
    expect(JSON.stringify(record.mock.calls)).not.toContain('abc-123');
    await app.close();
  });

  it('falls back to "unknown" when no route matched (404s still counted)', async () => {
    const app = await appWithRoute();
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(add).toHaveBeenCalledWith(1, { method: 'GET', path: 'unknown', status: '404' });
    await app.close();
  });
});
