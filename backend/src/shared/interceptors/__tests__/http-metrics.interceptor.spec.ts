import { ExecutionContext, CallHandler } from '@nestjs/common';
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

  it('records status 500 on handler error', (done) => {
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
