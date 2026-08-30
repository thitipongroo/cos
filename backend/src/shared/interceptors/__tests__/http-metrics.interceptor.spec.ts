import {
  ExecutionContext,
  CallHandler,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';

// Mock @cos/tracing before importing the interceptor
const mockRecord = jest.fn();
const mockAdd = jest.fn();
const mockCreateMetrics = jest.fn().mockReturnValue({
  httpRequestDuration: { record: mockRecord },
  httpRequestsTotal: { add: mockAdd },
  kafkaProducedTotal: { add: jest.fn() },
  kafkaConsumedTotal: { add: jest.fn() },
  kafkaConsumerLag: { addCallback: jest.fn() },
  kafkaDlqDepth: { addCallback: jest.fn() },
  dbQueryDuration: { record: jest.fn() },
  aiTokenUsageTotal: { add: jest.fn() },
  aiRequestDuration: { record: jest.fn() },
  syncQueueDepth: { addCallback: jest.fn() },
  fileUploadBytesTotal: { add: jest.fn() },
});
jest.mock('@cos/tracing', () => ({
  createMetrics: mockCreateMetrics,
  injectKafkaTraceContext: jest.fn((h) => h),
}));

import { HttpMetricsInterceptor } from '../http-metrics.interceptor';

function makeCtx(method = 'GET', path = '/api/v1/projects', status = 200): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, routerPath: path }),
      getResponse: () => ({ statusCode: status }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(obs: Observable<unknown>): CallHandler {
  return { handle: () => obs } as unknown as CallHandler;
}

describe('HttpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new HttpMetricsInterceptor();
  });

  it('records duration and request count on success', (done) => {
    interceptor
      .intercept(makeCtx('GET', '/api/v1/projects', 200), makeHandler(of({ data: [] })))
      .subscribe({
        complete: () => {
          expect(mockRecord).toHaveBeenCalledTimes(1);
          const [durationSec, attrs] = mockRecord.mock.calls[0];
          expect(typeof durationSec).toBe('number');
          expect(durationSec).toBeGreaterThanOrEqual(0);
          expect(attrs).toMatchObject({ method: 'GET', path: '/api/v1/projects', status: '200' });
          expect(mockAdd).toHaveBeenCalledWith(1, expect.objectContaining({ status: '200' }));
          done();
        },
      });
  });

  it('records the status an HttpException carries, not a blanket 500', (done) => {
    // Corrected 2026-08-23. The error branch used to record 500 for EVERY failure, so a 400 from
    // validation and a 403 from a guard both landed in the 5xx series. APIHighErrorRate is
    // `http_requests_total{status=~"5.."} / total > 1%` at severity critical (master:4382): a burst
    // of client errors paged on-call for a server fault that never happened, and a genuine 5xx was
    // indistinguishable from them.
    interceptor
      .intercept(
        makeCtx('POST', '/api/v1/projects', 201),
        makeHandler(throwError(() => new BadRequestException('invalid payload'))),
      )
      .subscribe({
        error: () => {
          const [, attrs] = mockRecord.mock.calls[0];
          expect(attrs.status).toBe('400');
          done();
        },
      });
  });

  it('records 403 for a guard rejection', (done) => {
    interceptor
      .intercept(
        makeCtx('GET', '/api/v1/projects', 200),
        makeHandler(throwError(() => new ForbiddenException())),
      )
      .subscribe({
        error: () => {
          expect(mockRecord.mock.calls[0][1].status).toBe('403');
          done();
        },
      });
  });

  it('trusts a plain error object that carries a real status code', (done) => {
    // Some libraries throw a plain object rather than an HttpException.
    interceptor
      .intercept(
        makeCtx('GET', '/api/v1/projects', 200),
        makeHandler(throwError(() => ({ status: 409, message: 'conflict' }))),
      )
      .subscribe({
        error: () => {
          expect(mockRecord.mock.calls[0][1].status).toBe('409');
          done();
        },
      });
  });

  it('ignores a status that is not a valid HTTP code', (done) => {
    // A library using `status` for something else — an internal enum, a boolean — must not be able
    // to write nonsense into the label the error-rate alert groups on.
    interceptor
      .intercept(
        makeCtx('GET', '/api/v1/projects', 200),
        makeHandler(throwError(() => ({ status: 9999 }))),
      )
      .subscribe({
        error: () => {
          expect(mockRecord.mock.calls[0][1].status).toBe('500');
          done();
        },
      });
  });

  it('records status 500 for an error with no status at all', (done) => {
    interceptor
      .intercept(
        makeCtx('POST', '/api/v1/projects', 201),
        makeHandler(throwError(() => new Error('boom'))),
      )
      .subscribe({
        error: () => {
          expect(mockRecord).toHaveBeenCalledTimes(1);
          const [, attrs] = mockRecord.mock.calls[0];
          expect(attrs.status).toBe('500');
          done();
        },
      });
  });

  it('uses routerPath label (not full URL) to avoid high cardinality', (done) => {
    interceptor
      .intercept(makeCtx('GET', '/api/v1/projects/:id', 200), makeHandler(of({})))
      .subscribe({
        complete: () => {
          const [, attrs] = mockRecord.mock.calls[0];
          expect(attrs.path).toBe('/api/v1/projects/:id');
          done();
        },
      });
  });

  it('falls back to req.url when routerPath is undefined', (done) => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/fallback-url' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;
    interceptor.intercept(ctx, makeHandler(of({}))).subscribe({
      complete: () => {
        const [, attrs] = mockRecord.mock.calls[0];
        expect(attrs.path).toBe('/fallback-url');
        done();
      },
    });
  });

  it('falls back to "unknown" when both routerPath and url are undefined', (done) => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;
    interceptor.intercept(ctx, makeHandler(of({}))).subscribe({
      complete: () => {
        const [, attrs] = mockRecord.mock.calls[0];
        expect(attrs.path).toBe('unknown');
        done();
      },
    });
  });

  it('uses "UNKNOWN" when req.method is undefined', (done) => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ routerPath: '/api' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;
    interceptor.intercept(ctx, makeHandler(of({}))).subscribe({
      complete: () => {
        const [, attrs] = mockRecord.mock.calls[0];
        expect(attrs.method).toBe('UNKNOWN');
        done();
      },
    });
  });

  it('defaults statusCode to 200 when response statusCode is undefined', (done) => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', routerPath: '/api' }),
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;
    interceptor.intercept(ctx, makeHandler(of({}))).subscribe({
      complete: () => {
        const [, attrs] = mockRecord.mock.calls[0];
        expect(attrs.status).toBe('200');
        done();
      },
    });
  });
});
