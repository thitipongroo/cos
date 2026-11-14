/**
 * The metrics label on real adapters: Fastify 5, which the app runs (main.ts), and Express.
 *
 * The other spec hands the interceptor a request object it builds itself, so it could only ever test
 * the field it was told to read — it fed `routerPath`, which Fastify 5 no longer has, and never saw
 * the label fall back to the URL with its query string. Here Fastify builds the request: a real app,
 * driven with `inject` (no socket is opened); and Express, which the integration harness runs on.
 */
const mockRecord = jest.fn();
const mockAdd = jest.fn();
jest.mock('@cos/tracing', () => ({
  createMetrics: jest.fn().mockReturnValue({
    httpRequestDuration: { record: mockRecord },
    httpRequestsTotal: { add: mockAdd },
  }),
}));

import { Controller, Get, Param, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { HttpMetricsInterceptor } from '../http-metrics.interceptor';

@Controller('things')
class ThingsController {
  @Get(':id')
  get(@Param('id') id: string) {
    return { id };
  }
}

describe('HttpMetricsInterceptor on a real Fastify app', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThingsController],
      providers: [{ provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor }],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('labels a request by its route template — no id, no query string', async () => {
    mockAdd.mockClear();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/things/abc-123?q=${encodeURIComponent('นายสมชาย')}`,
    });
    expect(res.statusCode).toBe(200);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [, attrs] = mockAdd.mock.calls[0] as [number, { path: string; status: string }];
    expect(attrs).toEqual({ method: 'GET', path: '/api/v1/things/:id', status: '200' });
  });

  it('two ids and two searches are one series', async () => {
    mockAdd.mockClear();
    await app.inject({ method: 'GET', url: '/api/v1/things/a?q=x' });
    await app.inject({ method: 'GET', url: '/api/v1/things/b?q=y' });
    const paths = mockAdd.mock.calls.map((c) => (c[1] as { path: string }).path);
    expect(new Set(paths)).toEqual(new Set(['/api/v1/things/:id']));
  });
});

// Nest's default adapter, which the integration harness (test/observability/01) runs on: the label
// comes from Express's matched `req.route.path`. Loopback only, on a port the OS picks.
describe('HttpMetricsInterceptor on a real Express app', () => {
  let app: INestApplication;
  let base = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThingsController],
      providers: [{ provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('labels a request by its route template — no id, no query string', async () => {
    mockAdd.mockClear();
    const res = await fetch(`${base}/api/v1/things/abc-123?q=${encodeURIComponent('นายสมชาย')}`);
    expect(res.status).toBe(200);
    const [, attrs] = mockAdd.mock.calls[0] as [number, { path: string }];
    expect(attrs.path).toBe('/api/v1/things/:id');
  });
});
