const recorded: Array<{ kind: 'duration' | 'count'; attrs: Record<string, string> }> = [];

jest.mock('../../interceptors/http-metrics.shared', () => {
  const actual = jest.requireActual('../../interceptors/http-metrics.shared');
  return {
    ...actual,
    httpMetrics: {
      httpRequestDuration: {
        record: (_v: number, attrs: Record<string, string>) =>
          recorded.push({ kind: 'duration', attrs }),
      },
      httpRequestsTotal: {
        add: (_v: number, attrs: Record<string, string>) => recorded.push({ kind: 'count', attrs }),
      },
    },
  };
});

import { METRICS_RECORDED } from '../../interceptors/http-metrics.shared';
import {
  UNMATCHED_PATH_LABEL,
  UnmatchedRouteMetricsMiddleware,
} from '../unmatched-route-metrics.middleware';

/** A response whose `finish` listener the test fires by hand. */
const makeRes = (statusCode: number) => {
  let listener: (() => void) | undefined;
  return {
    statusCode,
    on: (event: string, fn: () => void) => {
      if (event === 'finish') listener = fn;
    },
    finish: () => listener?.(),
  };
};

describe('UnmatchedRouteMetricsMiddleware', () => {
  let middleware: UnmatchedRouteMetricsMiddleware;

  beforeEach(() => {
    recorded.length = 0;
    middleware = new UnmatchedRouteMetricsMiddleware();
  });

  it('records a request no route handled', () => {
    // These never reach a global interceptor, so without this middleware a flood of 404s — a
    // scanner, a client on the wrong API prefix — is absent from http_requests_total entirely.
    const res = makeRes(404);
    const next = jest.fn();
    middleware.use({ method: 'GET' }, res, next);
    res.finish();

    expect(next).toHaveBeenCalled();
    expect(recorded.filter((r) => r.kind === 'count')).toHaveLength(1);
    expect(recorded[0].attrs).toMatchObject({ method: 'GET', status: '404' });
  });

  it('records both instruments, as the interceptor does', () => {
    // APIHighLatency reads the histogram and APIHighErrorRate the counter; a layer that fed only
    // one would leave a gap in whichever alert reads the other.
    const res = makeRes(404);
    middleware.use({ method: 'GET' }, res, jest.fn());
    res.finish();

    expect(recorded.some((r) => r.kind === 'duration')).toBe(true);
    expect(recorded.some((r) => r.kind === 'count')).toBe(true);
  });

  it('stays silent when the interceptor already recorded', () => {
    // Both layers see a request that DID reach a route. Counting it twice would halve every ratio
    // computed from this counter.
    const res = makeRes(200);
    middleware.use({ method: 'GET', [METRICS_RECORDED]: true }, res, jest.fn());
    res.finish();

    expect(recorded).toHaveLength(0);
  });

  it('collapses every unmatched path into one label', () => {
    // The path of a 404 is client-controlled; one series per distinct URL is a cardinality
    // explosion that takes Prometheus down before anyone reads the dashboard.
    const res = makeRes(404);
    middleware.use({ method: 'GET' }, res, jest.fn());
    res.finish();

    expect(recorded[0].attrs.path).toBe(UNMATCHED_PATH_LABEL);
  });

  it('falls back to 404 when the response carries no status', () => {
    const res = makeRes(undefined as unknown as number);
    middleware.use({ method: 'GET' }, res, jest.fn());
    res.finish();

    expect(recorded[0].attrs.status).toBe('404');
  });

  it('labels an unknown method rather than dropping the request', () => {
    const res = makeRes(404);
    middleware.use({}, res, jest.fn());
    res.finish();

    expect(recorded[0].attrs.method).toBe('UNKNOWN');
  });

  it('does not fail when the response cannot be hooked', () => {
    // A response object without `on` would otherwise throw INSIDE the middleware chain and turn a
    // metrics gap into a failed request.
    const next = jest.fn();
    expect(() => middleware.use({ method: 'GET' }, { statusCode: 404 }, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});
